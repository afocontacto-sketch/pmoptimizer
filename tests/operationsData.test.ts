import { beforeEach, describe, expect, test } from "vitest";
import { durationLabel, money } from "../src/data/format";
import { keys } from "../src/data/keys";
import type { StockBin } from "../src/data/stock";
import {
  aggregateStockBins,
  allocatedCost,
  costSummary,
  isPickableLocation,
  readOrders,
  readStock,
  receivePurchaseLine,
  releaseQualityLot,
  wbsTotals,
  writeOrders,
  writePurchaseOrders,
  writeStock,
} from "../src/modules/operationsData";
import type { TimedOrder, WorkOrder } from "../src/modules/operationsData";

const store = new Map<string, string>();
const events: string[] = [];

beforeEach(() => {
  store.clear();
  events.length = 0;
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => { store.set(key, value); },
      removeItem: (key: string) => { store.delete(key); },
      key: (index: number) => [...store.keys()][index] ?? null,
      get length() { return store.size; },
    },
  });
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { dispatchEvent: (event: CustomEvent<string>) => { events.push(event.detail); return true; } },
  });
});

const bin = (over: Partial<StockBin>): StockBin => ({
  id: "B1", code: "MAT-1", name: "Material", warehouse: "Bodega Central", location: "A-01-01",
  status: "Libre utilización", quantity: 10, reserved: 0, unit: "un", unitCost: 100, ...over,
});

const order = (over: Partial<WorkOrder>): WorkOrder => ({
  id: "51000001", type: "PRE", contract: "CT1234", wbs: "CT1234-PRE", equipment: "EQ", description: "",
  dueDate: "2026-01-01", assignees: [], projectedHours: 4, status: "Asignada", materials: [],
  pickingStatus: "Sin picking", statusHistory: [], createdAt: "", createdBy: "u",
  hourlyRate: 1000, elapsedSeconds: 0, timerStartedAt: null, supervisorClosedBy: null, ...over,
});

describe("formato", () => {
  test("durationLabel y money", () => {
    expect(durationLabel(3725)).toBe("1 h 02 min");
    expect(money(1500)).toContain("1.500");
  });
});

describe("stock", () => {
  test("aggregateStockBins promedia el costo y acumula cantidades por clave", () => {
    const groups = aggregateStockBins([
      bin({ id: "B1", quantity: 10, unitCost: 100 }),
      bin({ id: "B2", quantity: 30, unitCost: 200 }),
      bin({ id: "B3", location: "B-02-01" }),
    ]);
    expect(groups).toHaveLength(2);
    expect(groups[0].quantity).toBe(40);
    expect(groups[0].unitCost).toBe(175);
    expect(groups[0].sourceBins.map((item) => item.id)).toEqual(["B1", "B2"]);
  });

  test("isPickableLocation excluye recepción, calidad y tránsito", () => {
    expect(isPickableLocation("rec-ubicar")).toBe(false);
    expect(isPickableLocation("TRANSITO")).toBe(false);
    expect(isPickableLocation("A-01-02")).toBe(true);
  });

  test("readStock agrega OC aprobadas pendientes como tránsito y writeStock persiste y notifica", () => {
    store.set(keys.purchaseOrders, JSON.stringify([
      { id: "31000001", status: "Aprobada", quantity: 5, receivedQuantity: 2, materialCode: "MAT-9", materialName: "X", unit: "un", unitCost: 50 },
      { id: "31000002", status: "Recepcionada", quantity: 5, receivedQuantity: 5, materialCode: "MAT-8", materialName: "Y", unit: "un", unitCost: 50 },
    ]));
    const stock = readStock();
    expect(stock).toHaveLength(1);
    expect(stock[0]).toMatchObject({ status: "En tránsito", quantity: 3, location: "TRANSITO", reference: "31000001" });
    expect(writeStock((current) => current.map((item) => ({ ...item, quantity: 1 })))).toBe(true);
    expect(JSON.parse(store.get(keys.warehouseBins) ?? "[]")[0].quantity).toBe(1);
    expect(events).toEqual([keys.warehouseBins]);
  });
});

describe("órdenes y costos", () => {
  test("readOrders completa campos de ejecución y WBS de ESPERA", () => {
    store.set(keys.workOrders, JSON.stringify([
      { ...order({ id: "13000001", type: "ESPERA", wbs: "" }), hourlyRate: undefined, elapsedSeconds: undefined },
    ]));
    const [loaded] = readOrders((name, fallback) => name === "" ? 777 : fallback);
    expect(loaded.hourlyRate).toBe(777);
    expect(loaded.elapsedSeconds).toBe(0);
    expect(loaded.wbs).toBe("CT1234-CL-B2N4-IND");
  });

  test("writeOrders lee fresco, guarda y notifica la clave", () => {
    store.set(keys.workOrders, JSON.stringify([order({})]));
    expect(writeOrders(() => 0, (current) => current.map((item) => ({ ...item, status: "Cerrada" })))).toBe(true);
    expect(JSON.parse(store.get(keys.workOrders) ?? "[]")[0].status).toBe("Cerrada");
    expect(events).toEqual([keys.workOrders]);
  });

  test("allocatedCost suma horas x tarifa y material entregado", () => {
    const withMaterial = order({
      hourlyRate: 1000,
      materials: [{ code: "MAT-1", required: 4, picked: 2, unitCostAvg: 150 }],
    });
    expect(allocatedCost(withMaterial, [], 7200)).toBe(2 * 1000 + 2 * 150);
  });

  test("wbsTotals y costSummary: real, comprometido y proyección", () => {
    const timed: TimedOrder = {
      ...order({ materials: [{ code: "MAT-1", required: 4, picked: 1, unitCostAvg: 100 }] }),
      currentSeconds: 3600,
    };
    const contract = {
      code: "CT1234", customer: "C", description: "",
      wbs: [{ code: "CT1234-PRE", type: "PRE" as const, description: "", budget: 10000 }],
    };
    const [row] = wbsTotals(contract, [timed], []);
    expect(row.actual).toBe(1000 + 100);
    expect(row.committed).toBe(3 * 100 + 4000 * 3 / 4);
    expect(row.projected).toBe(4000 + 400);
    expect(costSummary([timed], [])).toEqual({ actual: row.actual, committed: row.committed });
  });
});

describe("liberación de calidad", () => {
  test("solo Calidad/Admin libera; deja el lote por ubicar y registra el kardex", () => {
    store.set(keys.warehouseBins, JSON.stringify([bin({ id: "Q1", status: "Bloqueado calidad", location: "REC-CALIDAD", quantity: 4 })]));
    expect(releaseQualityLot("Q1", "Almacén", "almacen")).toEqual({
      ok: false,
      error: "Solo Calidad o Administrador puede liberar material bloqueado.",
    });
    expect(releaseQualityLot("NO-EXISTE", "Calidad", "calidad")).toBeNull();
    expect(releaseQualityLot("Q1", "Calidad", "calidad")?.ok).toBe(true);
    const [saved] = JSON.parse(store.get(keys.warehouseBins) ?? "[]") as StockBin[];
    expect(saved).toMatchObject({ status: "Libre utilización", location: "REC-UBICAR" });
    const [movement] = JSON.parse(store.get(keys.warehouseMovements) ?? "[]") as { type: string; quantity: number; user: string }[];
    expect(movement).toMatchObject({ type: "Liberación de calidad", quantity: 4, user: "calidad" });
    expect(releaseQualityLot("Q1", "Calidad", "calidad")).toBeNull();
  });
});

describe("recepción de OC", () => {
  test("writePurchaseOrders actualiza la OC de forma atómica y notifica", () => {
    store.set(keys.purchaseOrders, JSON.stringify([{ id: "31000001", status: "Aprobada", quantity: 5, receivedQuantity: 0 }]));
    const ok = writePurchaseOrders((orders) => orders.map((item) => ({ ...item, receivedQuantity: 5, status: "Recepcionada" as const })));
    expect(ok).toBe(true);
    expect(JSON.parse(store.get(keys.purchaseOrders) ?? "[]")[0]).toMatchObject({ receivedQuantity: 5, status: "Recepcionada" });
    expect(events).toEqual([keys.purchaseOrders]);
  });

  const approvedOrder = {
    id: "31000002", status: "Aprobada", quantity: 10, receivedQuantity: 0,
    materialCode: "MAT-114", materialName: "Cinta", unit: "rollo", unitCost: 100,
  };
  const receive = (quantity: number) => {
    const source = readStock().find((bin) => bin.status === "En tránsito" && bin.reference === "31000002")!;
    const newBin: StockBin = { ...source, id: "BIN-REC-1", warehouse: "Bodega Central", location: "REC-CALIDAD", status: "Bloqueado calidad", quantity, reserved: 0 };
    const movement = { id: "MOV-1", date: "", type: "Recepción OC" as const, code: "MAT-114", quantity, from: "", to: "", reference: "31000002", user: "t" };
    return receivePurchaseLine(source, quantity, newBin, movement);
  };

  test("OC creada tras el seed: recibir 4 de 10 deja pendiente 6 (sin doble descuento)", () => {
    store.set(keys.purchaseOrders, JSON.stringify([approvedOrder]));
    expect(receive(4)).toBe(true);
    const transit = readStock().find((bin) => bin.status === "En tránsito" && bin.reference === "31000002");
    expect(transit?.quantity).toBe(6);
    expect(JSON.parse(store.get(keys.purchaseOrders) ?? "[]")[0]).toMatchObject({ receivedQuantity: 4, status: "Aprobada" });
  });

  test("si falla una escritura se revierte todo lo ya escrito", () => {
    store.set(keys.purchaseOrders, JSON.stringify([approvedOrder]));
    const original = localStorage.setItem;
    localStorage.setItem = (key: string, value: string) => {
      if (key === keys.purchaseOrders) throw new DOMException("full", "QuotaExceededError");
      original(key, value);
    };
    expect(receive(4)).toBe(false);
    localStorage.setItem = original;
    expect(store.has(keys.warehouseBins)).toBe(false);
    expect(store.has(keys.warehouseMovements)).toBe(false);
    expect(readStock().find((bin) => bin.reference === "31000002")?.quantity).toBe(10);
  });
});
