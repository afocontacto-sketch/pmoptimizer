import { can } from "../app/permissions";
import type { Role } from "../app/roles";
import { keys } from "../data/keys";
import { demoContract } from "../data/contracts";
import type { Contract } from "../data/contracts";
import { isPickableLocation, isTransferRef } from "../data/stock";
import type { StockBin } from "../data/stock";
import { readJson, runAtomic, updateJson } from "../data/storage";
import { orderTimeTotals } from "../data/workOrders";
import type { OrderLine, OrderType, TimeEntry, WorkOrder as BaseWorkOrder } from "../data/workOrders";
import type { RouteTemplate } from "./maintenanceData";
import { purchaseOrdersStorageKey, readStoredList } from "./supplyData";
import type { PurchaseOrder } from "./supplyData";

// Lógica compartida de producción, técnico, almacén y calidad.

export type StockMovementType =
  | "Recepción OC"
  | "Salida picking OT"
  | "Liberación de calidad"
  | "Ubicación"
  | "Ajuste inventario"
  | "Traslado"
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
};

// Campos de ejecución que el modelo de data/ aún no define; se completan al leer.
export type RuntimeFields = {
  supervisorClosedBy: string | null;
};
export type WorkOrder = BaseWorkOrder & RuntimeFields;
export type TimedOrder = WorkOrder & { currentSeconds: number; laborCost: number };
export type StockBinGroup = StockBin & { sourceBins: StockBin[] };

export const qualityCheckItems = [
  "Trabajo ejecutado según hoja de ruta",
  "Materiales utilizados corresponden a la OT",
  "Prueba funcional satisfactoria",
  "Evidencia fotográfica o documental revisada",
];

function readList<T>(key: string): T[] {
  const value = readJson<unknown>(key, []);
  return Array.isArray(value) ? (value as T[]) : [];
}

export function readContracts(): Contract[] {
  const savedClients = readStoredList<{ name: string; contractCode?: string; wbs?: string[] }>(keys.clients);
  const configured: Contract[] = savedClients.flatMap((client) => {
    if (!client.contractCode) return [];
    const wbs = (client.wbs ?? []).map((code) => {
      const suffix = code.split("-").pop()?.toUpperCase();
      const type: OrderType = suffix === "OVH" || suffix === "COR" || suffix === "REP" || suffix === "GAR" || suffix === "ESPERA"
        ? suffix
        : "PRE";
      return { code, type, description: `${client.contractCode} · ${type}`, budget: 0 };
    });
    return [{
      code: client.contractCode,
      customer: client.name,
      description: `Contrato de servicio de ${client.name}`,
      wbs,
    }];
  });
  return [...new Map<string, Contract>(
    [demoContract, ...configured.filter((contract) => contract.code !== demoContract.code)].map((contract): [string, Contract] => [contract.code, contract]),
  ).values()];
}

export function withRuntimeFields(order: BaseWorkOrder & Partial<RuntimeFields>): WorkOrder {
  return {
    ...order,
    assignees: order.assignees ?? [],
    materials: order.materials ?? [],
    supervisorClosedBy: order.supervisorClosedBy ?? null,
  };
}

export function readOrders(): WorkOrder[] {
  return readList<BaseWorkOrder & Partial<RuntimeFields>>(keys.workOrders)
    .map(withRuntimeFields)
    .map((order) => order.type === "ESPERA" && !order.wbs ? { ...order, wbs: "CT1234-CL-B2N4-IND" } : order);
}

// Tiempo y mano de obra por OT, derivados de timeEntries (las entradas abiertas cuentan hasta nowMs).
export function timedOrders(orders: WorkOrder[], entries: TimeEntry[], nowMs: number): TimedOrder[] {
  return orders.map((order) => {
    const totals = orderTimeTotals(order.id, entries, nowMs);
    return { ...order, currentSeconds: Math.round(totals.seconds), laborCost: totals.laborCost };
  });
}

export function addApprovedPurchaseOrdersToTransit(bins: StockBin[], orders: PurchaseOrder[]): StockBin[] {
  const result = [...bins];
  for (const order of orders) {
    if (order.status !== "Aprobada") continue;
    const remaining = Math.max(0, order.quantity - (order.receivedQuantity ?? 0));
    if (remaining === 0 || result.some((bin) => bin.reference === order.id && bin.code === order.materialCode)) continue;
    result.push({
      id: `BIN-TRANSIT-${order.id}`,
      code: order.materialCode,
      name: order.materialName,
      warehouse: "Recepciones",
      location: "TRANSITO",
      status: "En tránsito",
      quantity: remaining,
      reserved: 0,
      unit: order.unit,
      unitCost: order.unitCost,
      reference: order.id,
    });
  }
  return result;
}

export function readStock(): StockBin[] {
  return addApprovedPurchaseOrdersToTransit(
    readList<StockBin>(keys.warehouseBins),
    readStoredList<PurchaseOrder>(purchaseOrdersStorageKey),
  ).map((bin) =>
    bin.status === "En tránsito" && !isTransferRef(bin.reference)
      ? { ...bin, warehouse: "Recepciones", location: "TRANSITO", reference: bin.reference ?? "" }
      : bin,
  );
}

export function readMovements(): StockMovement[] {
  return readList<StockMovement>(keys.warehouseMovements);
}

// Escrituras: leen fresco, aplican fn, guardan y notifican (updateJson). Devuelven false si el guardado falla.
export function writeOrders(fn: (orders: WorkOrder[]) => WorkOrder[]): boolean {
  return updateJson<WorkOrder[]>(keys.workOrders, [], () => fn(readOrders())) !== null;
}

export function writeStock(fn: (stock: StockBin[]) => StockBin[]): boolean {
  return updateJson<StockBin[]>(keys.warehouseBins, [], () => fn(readStock())) !== null;
}

export function writeMovements(fn: (movements: StockMovement[]) => StockMovement[]): boolean {
  return updateJson<StockMovement[]>(keys.warehouseMovements, [], () => fn(readMovements())) !== null;
}

export function writePurchaseOrders(fn: (orders: PurchaseOrder[]) => PurchaseOrder[]): boolean {
  return updateJson<PurchaseOrder[]>(purchaseOrdersStorageKey, [], fn) !== null;
}

export { runAtomic };

// Recepción de OC: stock primero (materializa la línea de tránsito con el saldo correcto), luego kardex y OC; todo o nada.
export function receivePurchaseLine(source: StockBin, quantity: number, newBin: StockBin, movement: StockMovement): boolean {
  return runAtomic([keys.warehouseBins, keys.warehouseMovements, purchaseOrdersStorageKey], [
    () => writeStock((current) => current
      .map((bin) => bin.id === source.id ? { ...bin, quantity: bin.quantity - quantity } : bin)
      .concat(newBin)),
    () => writeMovements((current) => [movement, ...current]),
    () => writePurchaseOrders((storedOrders) => storedOrders.map((order) => {
      if (order.id !== source.reference || order.status !== "Aprobada") return order;
      const receivedQuantity = (order.receivedQuantity ?? 0) + quantity;
      return {
        ...order,
        receivedQuantity,
        status: receivedQuantity >= order.quantity ? "Recepcionada" as const : "Aprobada" as const,
      };
    })),
  ]);
}

export function materialsForRoute(route: RouteTemplate): OrderLine[] {
  const grouped = new Map<string, OrderLine>();
  for (const operation of route.operations) {
    for (const material of operation.materials) {
      const current = grouped.get(material.code);
      if (!current) {
        grouped.set(material.code, {
          code: material.code,
          name: material.name,
          required: material.quantity,
          picked: 0,
          unit: material.unit,
          unitCostAvg: material.unitCost,
        });
        continue;
      }
      const totalQuantity = current.required + material.quantity;
      current.unitCostAvg = ((current.unitCostAvg ?? 0) * current.required + material.unitCost * material.quantity)
        / totalQuantity;
      current.required = totalQuantity;
    }
  }
  return [...grouped.values()];
}

export function routeLaborCost(route: RouteTemplate): number {
  return route.operations.reduce((sum, operation) => sum + operation.durationHours * operation.hourlyCost, 0);
}

// Costo de mano de obra proyectado: el guardado en la OT; si falta, horas proyectadas x tarifa
// (la indicada o el promedio ponderado por horas de las operaciones de la ruta).
export function plannedLaborCost(order: WorkOrder, hourlyRate?: number): number {
  if (order.projectedLaborCost !== undefined) return order.projectedLaborCost;
  const operations = order.routeOperations ?? [];
  const routeHours = operations.reduce((sum, operation) => sum + operation.durationHours, 0);
  const routeRate = routeHours > 0
    ? operations.reduce((sum, operation) => sum + operation.durationHours * operation.hourlyCost, 0) / routeHours
    : 0;
  return Math.max(0, order.projectedHours) * Math.max(0, hourlyRate ?? routeRate);
}

export function plannedMaterialCost(item: OrderLine, fallbackUnitCost: number): number {
  return item.required * (item.unitCostAvg ?? fallbackUnitCost);
}

export function makeMovement(
  type: StockMovementType,
  code: string,
  quantity: number,
  from: string,
  to: string,
  reference: string,
  user: string,
): StockMovement {
  return {
    id: `MOV-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    date: new Date().toISOString(),
    type,
    code,
    quantity,
    from,
    to,
    reference,
    user,
  };
}

export { isPickableLocation };

export function aggregateStockBins(bins: StockBin[]): StockBinGroup[] {
  const grouped = new Map<string, StockBinGroup>();
  for (const bin of bins) {
    const key = [bin.code, bin.warehouse, bin.location, bin.status, bin.unit].join("|");
    const current = grouped.get(key);
    if (!current) {
      grouped.set(key, { ...bin, sourceBins: [bin] });
      continue;
    }
    const priorQuantity = current.quantity;
    const totalQuantity = priorQuantity + bin.quantity;
    current.unitCost = totalQuantity > 0
      ? (current.unitCost * priorQuantity + bin.unitCost * bin.quantity) / totalQuantity
      : current.unitCost;
    current.quantity = totalQuantity;
    current.reserved += bin.reserved;
    current.sourceBins.push(bin);
  }
  return [...grouped.values()];
}

export function averageUnitCost(code: string, stock: StockBin[]): number {
  const bins = stock.filter((bin) => bin.code === code && bin.quantity > 0);
  const quantity = bins.reduce((sum, bin) => sum + bin.quantity, 0);
  return quantity > 0
    ? bins.reduce((sum, bin) => sum + bin.quantity * bin.unitCost, 0) / quantity
    : 0;
}

export function allocatedCost(order: TimedOrder, stock: StockBin[]): number {
  const materialCost = order.materials.reduce((sum, item) => {
    const weightedBins = stock.filter((candidate) => candidate.code === item.code && candidate.quantity > 0);
    const totalQuantity = weightedBins.reduce((total, bin) => total + bin.quantity, 0);
    const averageCost = weightedBins.reduce((total, bin) => total + bin.quantity * bin.unitCost, 0)
      / Math.max(1, totalQuantity);
    return sum + item.picked * (item.unitCostAvg ?? averageCost);
  }, 0);
  return order.laborCost + materialCost;
}

// Comprometido = materiales pendientes de consumir + mano de obra restante de una OT abierta.
export function committedCost(order: TimedOrder, stock: StockBin[]): number {
  const materials = order.materials.reduce((sum, item) => {
    const unitCost = item.unitCostAvg ?? averageUnitCost(item.code, stock);
    return sum + Math.max(0, item.required - item.picked) * unitCost;
  }, 0);
  const remainingHours = Math.max(0, order.projectedHours - order.currentSeconds / 3600);
  const labor = order.projectedHours > 0 ? plannedLaborCost(order) * remainingHours / order.projectedHours : 0;
  return materials + labor;
}

export function wbsTotals(contract: Contract, orders: TimedOrder[], stock: StockBin[]) {
  return contract.wbs.map((element) => {
    const linked = orders.filter((order) => order.wbs === element.code);
    const actual = linked.reduce((sum, order) => sum + allocatedCost(order, stock), 0);
    const committed = linked.filter((order) => order.status !== "Cerrada")
      .reduce((sum, order) => sum + committedCost(order, stock), 0);
    const projected = linked.reduce((sum, order) => sum + plannedLaborCost(order) +
      order.materials.reduce((materialSum, item) =>
        materialSum + plannedMaterialCost(item, averageUnitCost(item.code, stock)), 0), 0);
    return { element, actual, committed, projected, linked: linked.length };
  });
}

export function costSummary(orders: TimedOrder[], stock: StockBin[]) {
  const actual = orders.reduce((sum, order) => sum + allocatedCost(order, stock), 0);
  const committed = orders.filter((order) => order.status !== "Cerrada")
    .reduce((sum, order) => sum + committedCost(order, stock), 0);
  return { actual, committed };
}

export type ActionResult = { ok: true; message: string } | { ok: false; error: string };

// Libera un lote bloqueado por Calidad a libre utilización (pendiente de ubicación). null = nada que hacer.
export function releaseQualityLot(binId: string, role: Role, user: string): ActionResult | null {
  if (!can(role, "quality.releaseStock")) {
    return { ok: false, error: "Solo Calidad o Administrador puede liberar material bloqueado." };
  }
  const bin = readStock().find((item) => item.id === binId);
  if (!bin || bin.status !== "Bloqueado calidad") return null;
  writeStock((current) => current.map((item) => item.id === binId
    ? { ...item, status: "Libre utilización", location: "REC-UBICAR", releasedAt: new Date().toISOString(), releasedBy: user }
    : item));
  writeMovements((current) => [makeMovement(
    "Liberación de calidad",
    bin.code,
    bin.quantity,
    `${bin.warehouse}/${bin.location}`,
    `${bin.warehouse}/REC-UBICAR`,
    bin.reference ?? bin.id,
    user,
  ), ...current]);
  return { ok: true, message: "Lote liberado por Calidad a libre utilización; pendiente de ubicación definitiva." };
}
