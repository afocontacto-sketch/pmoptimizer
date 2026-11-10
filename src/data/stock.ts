import { can } from "../app/permissions";
import type { Role } from "../app/roles";
import { nextDocNumber } from "./docNumbering";
import { keys } from "./keys";
import { readMaterials } from "./materials";
import type { MaterialRecord } from "./materials";
import { fail, ok } from "./result";
import type { Result } from "./result";
import { readJson, runAtomic, updateJson } from "./storage";
import type { PickingStatus, WorkOrder } from "./workOrders";

export type StockStatus = "Libre utilización" | "Bloqueado calidad" | "En tránsito";

export type StockBin = {
  id: string;
  code: string;
  name: string;
  warehouse: string;
  location: string;
  status: StockStatus;
  quantity: number;
  reserved: number; // deprecado: siempre 0
  unit: string;
  unitCost: number;
  reference?: string;
  receivedAt?: string;
  releasedAt?: string;
  releasedBy?: string;
};

export type StockMovementType =
  | "Recepción OC"
  | "Salida picking OT"
  | "Liberación de calidad"
  | "Ubicación"
  | "Ajuste inventario"
  | "Traspaso emitido"
  | "Traspaso recibido"
  | "Diferencia traspaso";

export type StockMovement = {
  id: string;
  date: string;
  type: StockMovementType;
  code: string;
  quantity: number;
  from: string;
  to: string;
  reference: string;
  user: string;
  orderId?: string;
  orderType?: string;
  wbs?: string;
  unitCost?: number;
  transferId?: string;
};

export type TransferStatus = "En tránsito" | "Recibido" | "Recibido con diferencia";

export type TransferLine = {
  code: string;
  name: string;
  unit: string;
  unitCost: number;
  sent: number;
  received?: number;
};

export type TransferOrder = {
  id: string;
  createdAt: string;
  createdBy: string;
  fromWarehouse: string;
  toWarehouse: string;
  status: TransferStatus;
  lines: TransferLine[];
  receivedAt?: string;
  receivedBy?: string;
  toQuality: boolean;
};

export function readBins(): StockBin[] {
  return readJson<StockBin[]>(keys.warehouseBins, []);
}

export function readMovements(): StockMovement[] {
  return readJson<StockMovement[]>(keys.warehouseMovements, []);
}

export function readTransfers(): TransferOrder[] {
  return readJson<TransferOrder[]>(keys.transferOrders, []);
}

// Costo medio ponderado sobre todos los bins del material con cantidad > 0.
export function averageCost(code: string, bins: StockBin[]): number {
  const own = bins.filter((bin) => bin.code === code && bin.quantity > 0);
  const qty = own.reduce((sum, bin) => sum + bin.quantity, 0);
  return qty === 0 ? 0 : own.reduce((sum, bin) => sum + bin.quantity * bin.unitCost, 0) / qty;
}

// ---------------------------------------------------------------------------
// E4: consulta de stock, picking parcial y traspasos (documento 32).
// ---------------------------------------------------------------------------
type Actor = { user: string; role: Role };

export const NON_PICKABLE_LOCATIONS = ["REC-UBICAR", "REC-CALIDAD", "TRANSITO"];
export const isPickableLocation = (location: string): boolean => !NON_PICKABLE_LOCATIONS.includes(location.toUpperCase());
// Los traspasos son documentos de la serie 32; sus bins en tránsito llevan ese número como referencia.
export const isTransferRef = (reference?: string): boolean => /^32\d{6}$/.test(reference ?? "");

const isFreePickable = (bin: StockBin) => bin.status === "Libre utilización" && isPickableLocation(bin.location) && bin.quantity > 0;
const byLocation = (a: StockBin, b: StockBin) => a.location.localeCompare(b.location, undefined, { numeric: true });
const readOrderList = (): WorkOrder[] => {
  const value = readJson<unknown>(keys.workOrders, []);
  return Array.isArray(value) ? (value as WorkOrder[]) : [];
};

export type StockRow = {
  code: string;
  name: string;
  unit: string;
  free: number;      // Libre utilización en ubicación pickable
  unlocated: number; // Libre utilización aún en zona de recepción (REC-UBICAR)
  quality: number;
  transit: number;
  total: number;     // free + unlocated + quality + transit
  averageCost: number;
  value: number;     // total x costo medio
};

export function stockByMaterial(bins: StockBin[] = readBins(), warehouse?: string): StockRow[] {
  const scoped = bins.filter((bin) => bin.quantity > 0 && (!warehouse || bin.warehouse === warehouse));
  const rows = new Map<string, StockRow>();
  for (const bin of scoped) {
    const row = rows.get(bin.code) ?? {
      code: bin.code, name: bin.name, unit: bin.unit, free: 0, unlocated: 0, quality: 0, transit: 0, total: 0, averageCost: 0, value: 0,
    };
    if (bin.status === "Bloqueado calidad") row.quality += bin.quantity;
    else if (bin.status === "En tránsito") row.transit += bin.quantity;
    else if (isPickableLocation(bin.location)) row.free += bin.quantity;
    else row.unlocated += bin.quantity;
    row.total += bin.quantity;
    rows.set(bin.code, row);
  }
  return [...rows.values()]
    .map((row) => {
      const cost = averageCost(row.code, scoped);
      return { ...row, averageCost: cost, value: row.total * cost };
    })
    .sort((a, b) => a.code.localeCompare(b.code));
}

export type DemandRow = { code: string; name: string; unit: string; available: number; required: number; low: boolean };

const isOpenOrder = (order: WorkOrder) => order.status !== "Cerrada" && order.type !== "ESPERA";
const pendingOf = (line: { required: number; picked: number }) => Math.max(0, line.required - line.picked);

// Pendiente de picking de OT abiertas con dueDate en [from, to] (YYYY-MM-DD). Bajo stock: libre < demanda o libre <= reorderPoint.
export function demandByMaterial(
  from: string,
  to: string,
  options: { warehouse?: string; orders?: WorkOrder[]; bins?: StockBin[]; materials?: MaterialRecord[] } = {},
): DemandRow[] {
  const orders = options.orders ?? readOrderList();
  const bins = options.bins ?? readBins();
  const materials = options.materials ?? readMaterials();
  const demand = new Map<string, { name: string; unit: string; required: number }>();
  for (const order of orders) {
    if (!isOpenOrder(order) || order.dueDate < from || order.dueDate > to) continue;
    for (const line of order.materials) {
      const pending = pendingOf(line);
      if (pending <= 0) continue;
      const current = demand.get(line.code) ?? { name: line.name ?? line.code, unit: line.unit ?? "", required: 0 };
      current.required += pending;
      demand.set(line.code, current);
    }
  }
  return [...demand.entries()].map(([code, item]) => {
    const available = bins
      .filter((bin) => bin.code === code && isFreePickable(bin) && (!options.warehouse || bin.warehouse === options.warehouse))
      .reduce((sum, bin) => sum + bin.quantity, 0);
    const reorderPoint = materials.find((material) => material.code === code)?.reorderPoint ?? 0;
    const sample = bins.find((bin) => bin.code === code);
    return {
      code, name: sample?.name ?? item.name, unit: sample?.unit ?? item.unit, available, required: item.required,
      low: available < item.required || available <= reorderPoint,
    };
  }).sort((a, b) => a.code.localeCompare(b.code));
}

// Semáforo de despacho: verde = libre alcanza; ámbar = alcanza con calidad y tránsito; rojo = no alcanza.
export type Light = "verde" | "ambar" | "rojo";
export type DispatchLine = { code: string; name: string; unit: string; pending: number; free: number; light: Light };
export type DispatchOrder = { order: WorkOrder; lines: DispatchLine[]; light: Light };
export type DispatchDay = { date: string; orders: DispatchOrder[] };

const lightRank: Record<Light, number> = { verde: 0, ambar: 1, rojo: 2 };

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// OT abierta -> líneas con semáforo; null si no tiene pendientes. El ámbar suma calidad, tránsito y "Por ubicar".
function toDispatchOrder(order: WorkOrder, rows: Map<string, StockRow>): DispatchOrder | null {
  const lines = order.materials.filter((line) => pendingOf(line) > 0).map((line): DispatchLine => {
    const row = rows.get(line.code);
    const pending = pendingOf(line);
    const free = row?.free ?? 0;
    const light: Light = free >= pending ? "verde"
      : free + (row?.unlocated ?? 0) + (row?.quality ?? 0) + (row?.transit ?? 0) >= pending ? "ambar" : "rojo";
    return { code: line.code, name: line.name ?? row?.name ?? line.code, unit: line.unit ?? row?.unit ?? "", pending, free, light };
  });
  if (!lines.length) return null;
  const light = lines.reduce<Light>((worst, line) => lightRank[line.light] > lightRank[worst] ? line.light : worst, "verde");
  return { order, lines, light };
}

const dispatchRows = (bins: StockBin[]) => new Map(stockByMaterial(bins).map((row) => [row.code, row]));

// Un día por columna desde hoy hasta hoy + horizonDays (inclusive).
export function dispatchBoard(today: string, horizonDays = 3, orders: WorkOrder[] = readOrderList(), bins: StockBin[] = readBins()): DispatchDay[] {
  const rows = dispatchRows(bins);
  return Array.from({ length: horizonDays + 1 }, (_, index) => {
    const date = addDays(today, index);
    const dayOrders = orders.filter((order) => isOpenOrder(order) && order.dueDate === date)
      .map((order) => toDispatchOrder(order, rows))
      .filter((item): item is DispatchOrder => item !== null);
    return { date, orders: dayOrders };
  });
}

// Columna "Vencidas": OT abiertas con dueDate anterior a hoy y picking pendiente.
export function dispatchOverdue(today: string, orders: WorkOrder[] = readOrderList(), bins: StockBin[] = readBins()): DispatchOrder[] {
  const rows = dispatchRows(bins);
  return orders.filter((order) => isOpenOrder(order) && order.dueDate < today)
    .map((order) => toDispatchOrder(order, rows))
    .filter((item): item is DispatchOrder => item !== null);
}

// Q4: solo los materiales con requiresInspection (o ausentes del maestro) entran a "Bloqueado calidad"; el resto entra libre.
export function receivingTarget(
  code: string,
  materials: MaterialRecord[] = readMaterials(),
  freeLocation = "REC-UBICAR",
): { status: StockStatus; location: string } {
  // Material fuera del maestro: se trata como crítico y pasa por Calidad.
  const master = materials.find((material) => material.code === code);
  return !master || master.requiresInspection
    ? { status: "Bloqueado calidad", location: "REC-CALIDAD" }
    : { status: "Libre utilización", location: freeLocation };
}

const movementId = () => `MOV-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const binId = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const saveFailed = "No se pudo guardar el cambio (almacenamiento lleno); no se aplicó ninguna modificación.";

export type PickLineInput = { orderId: string; code: string; binId: string; qty: number };

// Picking parcial: descuenta el bin libre y suma a picked de la OT con costo medio ponderado.
export function pickLine(input: PickLineInput, actor: Actor, now: Date = new Date()): Result<WorkOrder> {
  if (!can(actor.role, "warehouse.pick")) return fail("Tu rol no tiene permiso para hacer picking.");
  const { orderId, code, qty } = input;
  if (!Number.isFinite(qty) || qty <= 0) return fail("La cantidad debe ser mayor a cero.");
  const order = readOrderList().find((item) => item.id === orderId);
  if (!order) return fail(`No existe la OT ${orderId}.`);
  if (!isOpenOrder(order)) return fail(`La OT ${orderId} no admite picking (cerrada o de espera).`);
  const line = order.materials.find((item) => item.code === code);
  if (!line) return fail(`La OT ${orderId} no requiere el material ${code}.`);
  const pending = pendingOf(line);
  if (qty > pending) return fail(`La cantidad supera el pendiente de ${code} (${pending}).`);
  const bin = readBins().find((item) => item.id === input.binId);
  if (!bin || bin.code !== code) return fail("La ubicación elegida no corresponde al material.");
  if (!isFreePickable(bin)) return fail("Solo se puede tomar stock libre en ubicación pickable.");
  if (qty > bin.quantity) return fail(`La cantidad supera el stock libre de la ubicación (${bin.quantity}).`);
  let updated: WorkOrder | undefined;
  const saved = runAtomic([keys.warehouseBins, keys.warehouseMovements, keys.workOrders], [
    () => updateJson<StockBin[]>(keys.warehouseBins, [], (current) =>
      current.map((item) => item.id === bin.id ? { ...item, quantity: item.quantity - qty } : item)) !== null,
    () => updateJson<StockMovement[]>(keys.warehouseMovements, [], (current) => [{
      id: movementId(), date: now.toISOString(), type: "Salida picking OT", code, quantity: qty,
      from: `${bin.warehouse}/${bin.location}`, to: orderId, reference: orderId, user: actor.user,
      orderId, orderType: order.type, wbs: order.wbs, unitCost: bin.unitCost,
    }, ...current]) !== null,
    () => updateJson<WorkOrder[]>(keys.workOrders, [], (current) => current.map((item) => {
      if (item.id !== orderId) return item;
      const materials = item.materials.map((material) => {
        if (material.code !== code) return material;
        const picked = material.picked + qty;
        const unitCostAvg = material.picked > 0
          ? ((material.unitCostAvg ?? bin.unitCost) * material.picked + bin.unitCost * qty) / picked
          : bin.unitCost;
        return { ...material, picked, unitCostAvg };
      });
      const pickingStatus: PickingStatus = materials.every((material) => material.picked >= material.required) ? "Picking completo" : "Picking parcial";
      updated = { ...item, materials, pickingStatus };
      return updated;
    })) !== null,
  ]);
  return saved && updated ? ok(updated) : fail(saveFailed);
}

export type TransferLineInput = { code: string; qty: number };
export type EmitTransferInput = { fromWarehouse: string; toWarehouse: string; lines: TransferLineInput[] };

export function emitTransfer(input: EmitTransferInput, actor: Actor, now: Date = new Date()): Result<TransferOrder> {
  if (!can(actor.role, "warehouse.transfer")) return fail("Tu rol no tiene permiso para emitir traspasos.");
  const { fromWarehouse, toWarehouse } = input;
  if (!fromWarehouse || !toWarehouse || fromWarehouse === toWarehouse) return fail("Origen y destino deben ser almacenes distintos.");
  if (!input.lines.length) return fail("Agrega al menos una línea al traspaso.");
  const merged = new Map<string, number>();
  for (const line of input.lines) {
    if (!Number.isFinite(line.qty) || line.qty <= 0) return fail(`Cantidad no válida para ${line.code}.`);
    merged.set(line.code, (merged.get(line.code) ?? 0) + line.qty);
  }
  const bins = readBins();
  const takes: { bin: StockBin; qty: number }[] = [];
  for (const [code, qty] of merged) {
    let needed = qty;
    for (const bin of bins.filter((item) => item.code === code && item.warehouse === fromWarehouse && isFreePickable(item)).sort(byLocation)) {
      const take = Math.min(needed, bin.quantity);
      if (take <= 0) continue;
      takes.push({ bin, qty: take });
      needed -= take;
    }
    if (needed > 0) return fail(`Stock libre insuficiente de ${code} en ${fromWarehouse} (faltan ${needed}).`);
  }
  const transfers = readTransfers();
  const id = nextDocNumber("32", (candidate) => transfers.some((transfer) => transfer.id === candidate));
  const lines: TransferLine[] = [...merged].map(([code, sent]) => {
    const own = takes.filter((take) => take.bin.code === code);
    const cost = own.reduce((sum, take) => sum + take.qty * take.bin.unitCost, 0) / sent;
    return { code, name: own[0].bin.name, unit: own[0].bin.unit, unitCost: cost, sent };
  });
  const materials = readMaterials();
  const transfer: TransferOrder = {
    id, createdAt: now.toISOString(), createdBy: actor.user, fromWarehouse, toWarehouse, status: "En tránsito",
    lines, toQuality: lines.some((line) => materials.find((material) => material.code === line.code)?.requiresInspection === true),
  };
  const saved = runAtomic([keys.warehouseBins, keys.warehouseMovements, keys.transferOrders], [
    () => updateJson<StockBin[]>(keys.warehouseBins, [], (current) => [
      ...current.map((bin) => {
        const taken = takes.filter((take) => take.bin.id === bin.id).reduce((sum, take) => sum + take.qty, 0);
        return taken ? { ...bin, quantity: bin.quantity - taken } : bin;
      }),
      ...lines.map((line): StockBin => ({
        id: binId(`BIN-TR${id}`), code: line.code, name: line.name, warehouse: toWarehouse, location: "TRANSITO",
        status: "En tránsito", quantity: line.sent, reserved: 0, unit: line.unit, unitCost: line.unitCost, reference: id,
      })),
    ]) !== null,
    () => updateJson<StockMovement[]>(keys.warehouseMovements, [], (current) => [
      ...takes.map((take): StockMovement => ({
        id: movementId(), date: now.toISOString(), type: "Traspaso emitido", code: take.bin.code, quantity: take.qty,
        from: `${take.bin.warehouse}/${take.bin.location}`, to: `${toWarehouse}/TRANSITO`, reference: id, user: actor.user,
        transferId: id, unitCost: take.bin.unitCost,
      })),
      ...current,
    ]) !== null,
    () => updateJson<TransferOrder[]>(keys.transferOrders, [], (current) => [...current, transfer]) !== null,
  ]);
  return saved ? ok(transfer) : fail(saveFailed);
}

// received: cantidad recibida ahora por código de material. location: ubicación de lo que entra libre (por defecto REC-UBICAR).
export function receiveTransfer(
  transferId: string,
  received: Record<string, number>,
  actor: Actor,
  options: { location?: string; now?: Date; materials?: MaterialRecord[] } = {},
): Result<TransferOrder> {
  if (!can(actor.role, "warehouse.receiveTransfer")) return fail("Tu rol no tiene permiso para recibir traspasos.");
  const transfer = readTransfers().find((item) => item.id === transferId);
  if (!transfer) return fail(`No existe el traspaso ${transferId}.`);
  if (transfer.status === "Recibido") return fail("El traspaso ya fue recibido por completo.");
  const location = (options.location ?? "").trim().toUpperCase() || "REC-UBICAR";
  if (location === "TRANSITO" || location === "REC-CALIDAD") return fail("Indica una ubicación de recepción válida.");
  const now = options.now ?? new Date();
  const materials = options.materials ?? readMaterials();
  const incoming: { line: TransferLine; qty: number; target: { status: StockStatus; location: string } }[] = [];
  for (const line of transfer.lines) {
    const qty = received[line.code] ?? 0;
    if (!Number.isFinite(qty) || qty < 0) return fail(`Cantidad no válida para ${line.code}.`);
    const pending = line.sent - (line.received ?? 0);
    if (qty > pending) return fail(`Lo recibido de ${line.code} supera lo enviado pendiente (${pending}).`);
    if (qty > 0) incoming.push({ line, qty, target: receivingTarget(line.code, materials, location) });
  }
  if (!incoming.length) return fail("Indica al menos una cantidad recibida.");
  const lines = transfer.lines.map((line) => {
    const qty = incoming.find((item) => item.line.code === line.code)?.qty ?? 0;
    return qty ? { ...line, received: (line.received ?? 0) + qty } : line;
  });
  const complete = lines.every((line) => (line.received ?? 0) >= line.sent);
  const updated: TransferOrder = {
    ...transfer, lines, status: complete ? "Recibido" : "Recibido con diferencia", receivedAt: now.toISOString(), receivedBy: actor.user,
  };
  const saved = runAtomic([keys.warehouseBins, keys.warehouseMovements, keys.transferOrders], [
    () => updateJson<StockBin[]>(keys.warehouseBins, [], (current) => [
      ...current.map((bin) => {
        if (bin.status !== "En tránsito" || bin.reference !== transferId) return bin;
        const qty = incoming.find((item) => item.line.code === bin.code)?.qty ?? 0;
        return qty ? { ...bin, quantity: bin.quantity - qty } : bin;
      }),
      ...incoming.map(({ line, qty, target }): StockBin => ({
        id: binId(`BIN-TRR${transferId}`), code: line.code, name: line.name, warehouse: transfer.toWarehouse, ...target,
        quantity: qty, reserved: 0, unit: line.unit, unitCost: line.unitCost, reference: transferId, receivedAt: now.toISOString(),
      })),
    ]) !== null,
    () => updateJson<StockMovement[]>(keys.warehouseMovements, [], (current) => [
      ...incoming.map(({ line, qty, target }): StockMovement => ({
        id: movementId(), date: now.toISOString(), type: "Traspaso recibido", code: line.code, quantity: qty,
        from: `${transfer.toWarehouse}/TRANSITO`, to: `${transfer.toWarehouse}/${target.location}`,
        reference: transferId, user: actor.user, transferId, unitCost: line.unitCost,
      })),
      ...current,
    ]) !== null,
    () => updateJson<TransferOrder[]>(keys.transferOrders, [], (current) => current.map((item) => item.id === transferId ? updated : item)) !== null,
  ]);
  return saved ? ok(updated) : fail(saveFailed);
}

export const transferPending = (transfer: TransferOrder): number =>
  transfer.lines.reduce((sum, line) => sum + Math.max(0, line.sent - (line.received ?? 0)), 0);
