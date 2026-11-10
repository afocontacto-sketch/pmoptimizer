import { beforeEach, describe, expect, test } from "vitest";
import { keys, schemaKey } from "../src/data/keys";
import { bootstrapStorage } from "../src/data/storage";
import { nextDocNumber } from "../src/data/docNumbering";
import { generateCalls, plannedCallRecords, samplePlans, sampleRoutes } from "../src/modules/maintenanceData";

const store = new Map<string, string>();

function installLocalStorage() {
  store.clear();
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
}

const read = <T>(key: string): T => JSON.parse(store.get(key) ?? "null") as T;

describe("bootstrapStorage + seedDemoData", () => {
  beforeEach(installLocalStorage);

  test("siembra OT, OC, SP y contrato con numeración nueva", () => {
    bootstrapStorage();
    const orders = read<{ id: string; type: string; status: string }[]>(keys.workOrders);
    expect(orders.map((order) => order.id).slice(0, 1)).toEqual(["51000001"]);
    expect(new Set(orders.map((order) => order.type))).toEqual(new Set(["PRE", "COR", "OVH", "GAR", "REP", "ESPERA"]));
    expect(new Set(orders.map((order) => order.status)))
      .toEqual(new Set(["Sin asignar", "Asignada", "En ejecución", "Cierre provisorio", "Cerrada"]));
    expect(new Set(orders.map((order) => order.id)).size).toBe(orders.length);
    expect(read<{ id: string; status: string }[]>(keys.purchaseOrders).map((order) => order.status))
      .toEqual(expect.arrayContaining(["Pendiente aprobación", "Aprobada", "Rechazada", "Recepcionada"]));
    expect(read<{ id: string }[]>(keys.purchaseRequests)[0].id).toBe("21000001");
    const client = read<{ contracts: { code: string; startDate?: string; endDate?: string; wbs: { code: string }[] }[] }[]>(keys.clients)
      .flatMap((item) => item.contracts).find((item) => item.code === "CT1234");
    expect(client?.startDate).toBeTruthy();
    expect(client?.endDate).toBeTruthy();
    expect(client?.wbs.some((element) => element.code.endsWith("-GAR"))).toBe(true);
  });

  test("contadores coherentes: el siguiente número continúa la serie", () => {
    bootstrapStorage();
    expect(nextDocNumber("61")).toBe("61000005");
    expect(nextDocNumber("31")).toBe("31000007");
    expect(nextDocNumber("21")).toBe("21000008");
    expect(nextDocNumber("13")).toBe("13000003");
    expect(nextDocNumber("91")).toBe("91000002");
    expect(nextDocNumber("32")).toBe("32000003");
  });

  test("código de contrato y WBS únicos en todo el seed", () => {
    bootstrapStorage();
    const contracts = read<{ contracts: { code: string; wbs: { code: string }[] }[] }[]>(keys.clients).flatMap((item) => item.contracts);
    expect(contracts.length).toBeGreaterThanOrEqual(2);
    const wbs = contracts.flatMap((item) => item.wbs.map((element) => element.code));
    expect(new Set(wbs).size).toBe(wbs.length);
    expect(new Set(contracts.map((item) => item.code)).size).toBe(contracts.length);
  });

  test("no vuelve a sembrar si el esquema ya está vigente", () => {
    bootstrapStorage();
    store.set(keys.workOrders, "[]");
    bootstrapStorage();
    expect(store.get(schemaKey)).toBeTruthy();
    expect(store.get(keys.workOrders)).toBe("[]");
  });
});

describe("generateCalls (puro)", () => {
  test("genera llamadas sin tocar el almacenamiento", () => {
    installLocalStorage();
    const calls = generateCalls(samplePlans[0], sampleRoutes[0]);
    expect(calls.length).toBeGreaterThan(0);
    expect(plannedCallRecords(samplePlans, sampleRoutes)).toHaveLength(
      samplePlans.reduce((sum, plan) => sum + generateCalls(plan, sampleRoutes.find((r) => r.id === plan.routeId) ?? sampleRoutes[0]).length, 0),
    );
    expect(store.size).toBe(0);
  });
});
