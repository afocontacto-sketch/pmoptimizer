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
    expect(read<{ id: string }[]>(keys.workOrders).map((order) => order.id))
      .toEqual(["51000001", "61000001", "71000001", "81000001", "13000001"]);
    expect(read<{ id: string }[]>(keys.purchaseOrders).map((order) => order.id)).toEqual(["31000001", "31000002"]);
    expect(read<{ id: string }[]>(keys.purchaseRequests)[0].id).toBe("21000001");
    const client = read<{ contractCode?: string; startDate?: string; endDate?: string; wbs?: string[] }[]>(keys.clients)
      .find((item) => item.contractCode === "CT1234");
    expect(client?.startDate).toBeTruthy();
    expect(client?.endDate).toBeTruthy();
    expect(client?.wbs?.some((code) => code.endsWith("-GAR"))).toBe(true);
  });

  test("contadores coherentes: el siguiente número continúa la serie", () => {
    bootstrapStorage();
    expect(nextDocNumber("61")).toBe("61000002");
    expect(nextDocNumber("31")).toBe("31000003");
    expect(nextDocNumber("21")).toBe("21000002");
    expect(nextDocNumber("13")).toBe("13000002");
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
