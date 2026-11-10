import { beforeEach, describe, expect, test } from "vitest";
import { keys } from "../src/data/keys";
import { closeTransferDifference, demandByMaterial, dispatchBoard, emitTransfer, pickLine, receiveTransfer, stockByMaterial } from "../src/data/stock";
import type { StockBin, StockMovement, TransferOrder } from "../src/data/stock";
import type { WorkOrder } from "../src/data/workOrders";
import type { MaterialRecord } from "../src/data/materials";
import { installStorage, readStore, store } from "./helpers/storageMock";

const almacen = { user: "almacen", role: "Almacén" as const };
const tecnico = { user: "tecnico", role: "Técnico" as const };

const bin = (id: string, over: Partial<StockBin>): StockBin => ({
  id, code: "MAT-1", name: "Material 1", warehouse: "Central", location: "A-01", status: "Libre utilización",
  quantity: 10, reserved: 0, unit: "u", unitCost: 100, ...over,
});
const material = (code: string, requiresInspection: boolean, reorderPoint = 0): MaterialRecord => ({
  code, name: code, unit: "u", category: "X", minStock: 0, reorderPoint, leadTimeDays: 1, requiresInspection,
});
const order = (over: Partial<WorkOrder> = {}): WorkOrder => ({
  id: "61000001", type: "COR", contract: "C", wbs: "C-COR", equipment: "E", description: "D", dueDate: "2026-11-11",
  projectedHours: 1, status: "Asignada", assignees: [], pickingStatus: "Sin picking",
  materials: [{ code: "MAT-1", required: 10, picked: 0 }], statusHistory: [], createdAt: "", createdBy: "", ...over,
} as WorkOrder);

const put = (key: string, value: unknown) => store.set(key, JSON.stringify(value));
const bins = () => readStore<StockBin[]>(keys.warehouseBins, []);

beforeEach(() => {
  installStorage();
  put(keys.warehouseBins, [bin("B1", { location: "A-02", quantity: 6 }), bin("B2", { location: "A-01", quantity: 6, unitCost: 200 })]);
  put(keys.workOrders, [order()]);
  put(keys.warehouseMovements, []);
  put(keys.transferOrders, []);
  put(keys.docCounters, { "32": 1 });
  put(keys.materialMaster, [material("MAT-1", false)]);
});

describe("stockByMaterial", () => {
  const sample = [
    bin("1", { quantity: 5 }),
    bin("2", { location: "REC-UBICAR", quantity: 2 }),
    bin("3", { status: "Bloqueado calidad", location: "REC-CALIDAD", quantity: 3 }),
    bin("4", { status: "En tránsito", warehouse: "Recepciones", location: "TRANSITO", quantity: 4 }),
    bin("5", { warehouse: "Taller", quantity: 7, unitCost: 200 }),
  ];

  test("separa libre, calidad y tránsito; total es la suma de las columnas", () => {
    const [row] = stockByMaterial(sample);
    expect(row).toMatchObject({ free: 12, unlocated: 2, quality: 3, transit: 4, total: 21 });
    expect(row.total).toBe(row.free + row.unlocated + row.quality + row.transit);
    expect(row.value).toBeCloseTo(21 * row.averageCost);
  });

  test("filtra por almacén y la suma de almacenes iguala a Todos", () => {
    const all = stockByMaterial(sample)[0].total;
    const sum = ["Central", "Recepciones", "Taller"].reduce((acc, w) => acc + (stockByMaterial(sample, w)[0]?.total ?? 0), 0);
    expect(sum).toBe(all);
  });
});

describe("pickLine", () => {
  test("picking parcial deja pendiente y estado parcial; completar lo cierra", () => {
    const first = pickLine({ orderId: "61000001", code: "MAT-1", binId: "B2", qty: 3 }, almacen);
    expect(first.ok && first.value.pickingStatus).toBe("Picking parcial");
    expect(first.ok && first.value.materials[0]).toMatchObject({ picked: 3, unitCostAvg: 200 });
    expect(bins().find((b) => b.id === "B2")?.quantity).toBe(3);
    const second = pickLine({ orderId: "61000001", code: "MAT-1", binId: "B2", qty: 3 }, almacen);
    expect(second.ok).toBe(true);
    const third = pickLine({ orderId: "61000001", code: "MAT-1", binId: "B1", qty: 4 }, almacen);
    expect(third.ok && third.value.pickingStatus).toBe("Picking completo");
    expect(third.ok && third.value.materials[0].unitCostAvg).toBeCloseTo((200 * 6 + 100 * 4) / 10);
  });

  test("registra movimiento con wbs y unitCost", () => {
    pickLine({ orderId: "61000001", code: "MAT-1", binId: "B1", qty: 2 }, almacen);
    const [movement] = readStore<StockMovement[]>(keys.warehouseMovements, []);
    expect(movement).toMatchObject({ type: "Salida picking OT", wbs: "C-COR", unitCost: 100, orderId: "61000001", quantity: 2 });
  });

  test("no permite más que el pendiente ni que el stock del bin", () => {
    put(keys.workOrders, [order({ materials: [{ code: "MAT-1", required: 20, picked: 0 }] })]);
    expect(pickLine({ orderId: "61000001", code: "MAT-1", binId: "B1", qty: 7 }, almacen).ok).toBe(false);
    put(keys.workOrders, [order({ materials: [{ code: "MAT-1", required: 2, picked: 0 }] })]);
    const result = pickLine({ orderId: "61000001", code: "MAT-1", binId: "B1", qty: 3 }, almacen);
    expect(result).toMatchObject({ ok: false });
    expect(bins().find((b) => b.id === "B1")?.quantity).toBe(6);
  });

  test("rechaza bins no libres, roles sin permiso y OT cerrada", () => {
    put(keys.warehouseBins, [bin("Q", { status: "Bloqueado calidad", location: "REC-CALIDAD" })]);
    expect(pickLine({ orderId: "61000001", code: "MAT-1", binId: "Q", qty: 1 }, almacen).ok).toBe(false);
    expect(pickLine({ orderId: "61000001", code: "MAT-1", binId: "Q", qty: 1 }, tecnico).ok).toBe(false);
    put(keys.workOrders, [order({ status: "Cerrada" })]);
    expect(pickLine({ orderId: "61000001", code: "MAT-1", binId: "Q", qty: 1 }, almacen).ok).toBe(false);
  });

  test("rollback: si falla el guardado de la OT no queda ningún cambio", () => {
    const original = store.get(keys.warehouseBins);
    const realSet = localStorage.setItem.bind(localStorage);
    localStorage.setItem = (key: string, value: string) => {
      if (key === keys.workOrders) throw new DOMException("lleno", "QuotaExceededError");
      realSet(key, value);
    };
    const result = pickLine({ orderId: "61000001", code: "MAT-1", binId: "B1", qty: 2 }, almacen);
    expect(result.ok).toBe(false);
    expect(store.get(keys.warehouseBins)).toBe(original);
    expect(readStore<StockMovement[]>(keys.warehouseMovements, [])).toHaveLength(0);
  });
});

describe("traspasos", () => {
  const input = { fromWarehouse: "Central", toWarehouse: "Taller", lines: [{ code: "MAT-1", qty: 5 }] };

  test("emitir crea 32000002, descuenta origen y deja tránsito en destino", () => {
    const result = emitTransfer(input, almacen);
    expect(result.ok && result.value.id).toBe("32000002");
    expect(bins().filter((b) => b.warehouse === "Central").reduce((s, b) => s + b.quantity, 0)).toBe(7);
    const transit = bins().find((b) => b.status === "En tránsito");
    expect(transit).toMatchObject({ warehouse: "Taller", location: "TRANSITO", quantity: 5, reference: "32000002" });
    expect(stockByMaterial(bins(), "Taller")[0]).toMatchObject({ free: 0, transit: 5 });
    expect(readStore<StockMovement[]>(keys.warehouseMovements, []).every((m) => m.type === "Traspaso emitido")).toBe(true);
  });

  test("valida stock, almacenes y permiso", () => {
    expect(emitTransfer({ ...input, lines: [{ code: "MAT-1", qty: 50 }] }, almacen).ok).toBe(false);
    expect(emitTransfer({ ...input, toWarehouse: "Central" }, almacen).ok).toBe(false);
    expect(emitTransfer(input, tecnico).ok).toBe(false);
    expect(bins().reduce((s, b) => s + b.quantity, 0)).toBe(12);
  });

  test("recibir 4 de 5 deja 1 en tránsito, estado con diferencia y entra libre si no requiere inspección", () => {
    emitTransfer(input, almacen);
    const result = receiveTransfer("32000002", { "MAT-1": 4 }, almacen, { location: "b-01" });
    expect(result.ok && result.value.status).toBe("Recibido con diferencia");
    expect(bins().find((b) => b.status === "En tránsito")?.quantity).toBe(1);
    expect(bins().find((b) => b.warehouse === "Taller" && b.status === "Libre utilización")).toMatchObject({ quantity: 4, location: "B-01" });
    expect(readStore<TransferOrder[]>(keys.transferOrders, [])[0].lines[0].received).toBe(4);
  });

  test("Q4: lo recibido va a Bloqueado calidad solo si el material requiere inspección", () => {
    put(keys.materialMaster, [material("MAT-1", true)]);
    emitTransfer(input, almacen);
    receiveTransfer("32000002", { "MAT-1": 4 }, almacen);
    expect(bins().find((b) => b.warehouse === "Taller" && b.quantity === 4)).toMatchObject({ status: "Bloqueado calidad", location: "REC-CALIDAD" });
  });

  test("no permite recibir más de lo enviado y el saldo se puede completar después", () => {
    emitTransfer(input, almacen);
    expect(receiveTransfer("32000002", { "MAT-1": 6 }, almacen).ok).toBe(false);
    receiveTransfer("32000002", { "MAT-1": 4 }, almacen);
    expect(receiveTransfer("32000002", { "MAT-1": 2 }, almacen).ok).toBe(false);
    const last = receiveTransfer("32000002", { "MAT-1": 1 }, almacen);
    expect(last.ok && last.value.status).toBe("Recibido");
    expect(bins().find((b) => b.status === "En tránsito")?.quantity).toBe(0);
  });
});

describe("closeTransferDifference (M7)", () => {
  const emitAndReceive = () => {
    put(keys.warehouseBins, [bin("B1", { location: "A-02", quantity: 10 })]);
    const emitted = emitTransfer({ fromWarehouse: "Central", toWarehouse: "Taller", lines: [{ code: "MAT-1", qty: 5 }] }, almacen);
    if (!emitted.ok) throw new Error(emitted.error);
    receiveTransfer(emitted.value.id, { "MAT-1": 4 }, almacen);
    return emitted.value.id;
  };

  test("devuelve el faltante al origen, deja tránsito en cero y cierra; no se repite", () => {
    const id = emitAndReceive();
    const result = closeTransferDifference(id, almacen);
    expect(result.ok && result.value.status).toBe("Cerrado con devolución");
    expect(stockByMaterial(bins())[0].transit).toBe(0);
    expect(bins().find((b) => b.warehouse === "Central" && b.reference === id)).toMatchObject({ quantity: 1, location: "A-02", status: "Libre utilización" });
    expect(readStore<StockMovement[]>(keys.warehouseMovements, []).some((m) => m.type === "Diferencia traspaso" && m.transferId === id)).toBe(true);
    expect(closeTransferDifference(id, almacen).ok).toBe(false);
    expect(stockByMaterial(bins())[0].total).toBe(10);
  });

  test("rechaza rol sin permiso y hace rollback si falla la escritura", () => {
    const id = emitAndReceive();
    expect(closeTransferDifference(id, tecnico).ok).toBe(false);
    const before = JSON.stringify([bins(), readStore<TransferOrder[]>(keys.transferOrders, [])]);
    const original = localStorage.setItem;
    localStorage.setItem = (key: string, value: string) => {
      if (key === keys.transferOrders) throw new Error("lleno");
      original(key, value);
    };
    try {
      expect(closeTransferDifference(id, almacen).ok).toBe(false);
    } finally {
      localStorage.setItem = original;
    }
    expect(JSON.stringify([bins(), readStore<TransferOrder[]>(keys.transferOrders, [])])).toBe(before);
  });
});

describe("demanda y pantalla de despacho", () => {
  test("demandByMaterial marca bajo stock si libre < demanda o <= punto de reorden", () => {
    const ok = demandByMaterial("2026-11-10", "2026-11-12", { orders: [order()], bins: bins(), materials: [material("MAT-1", false, 5)] });
    expect(ok[0]).toMatchObject({ available: 12, required: 10, low: false });
    const low = demandByMaterial("2026-11-10", "2026-11-12", { orders: [order()], bins: bins(), materials: [material("MAT-1", false, 12)] });
    expect(low[0].low).toBe(true);
    expect(demandByMaterial("2026-11-13", "2026-11-14", { orders: [order()], bins: bins(), materials: [] })).toEqual([]);
  });

  test("dispatchBoard: semáforo verde, ámbar y rojo; sale al completar el picking", () => {
    const quality = bin("Q", { status: "Bloqueado calidad", location: "REC-CALIDAD", quantity: 5 });
    const orders = [order({ materials: [{ code: "MAT-1", required: 20, picked: 0 }] })];
    const days = (b: StockBin[], o: WorkOrder[]) => dispatchBoard("2026-11-10", 3, o, b);
    expect(days(bins(), orders)[1].orders[0].light).toBe("rojo");
    expect(days([...bins(), quality, bin("T", { status: "En tránsito", location: "TRANSITO", quantity: 3 })], orders)[1].orders[0].light).toBe("ambar");
    expect(days(bins(), [order()])[1].orders[0].light).toBe("verde");
    expect(days(bins(), [order({ materials: [{ code: "MAT-1", required: 10, picked: 10 }] })])[1].orders).toHaveLength(0);
    expect(days(bins(), [order({ dueDate: "2026-11-14" })]).every((day) => day.orders.length === 0)).toBe(true);
  });
});
