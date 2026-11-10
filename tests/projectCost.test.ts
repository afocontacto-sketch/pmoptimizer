import { beforeEach, describe, expect, test } from "vitest";
import { computeEac, formatScaled, indirectPayrollCosts, mergeSnapshots, nextBudgetVersions, snapshotsFromRows } from "../src/data/projectCost";
import type { EacInput } from "../src/data/projectCost";
import { closeMonth, readApprovedBudgets, readEacSnapshots, saveBudgetVersion } from "../src/data/projectCostStore";
import type { Contract } from "../src/data/contracts";
import { installStorage, store } from "./helpers/storageMock";
import { keys } from "../src/data/keys";

const contract: Contract = {
  code: "CT1", customer: "Cli", description: "", startDate: "2026-01-01", endDate: "2026-12-31",
  wbs: [
    { code: "CT1-PRE", type: "PRE", description: "", budget: 0 },
    { code: "CT1-REP", type: "REP", description: "", budget: 0 },
  ],
};

const base = (): EacInput => ({
  contracts: [contract], orders: [], timeEntries: [], movements: [], invoices: [], purchaseOrders: [], requests: [],
  calls: [], routes: [], bins: [], indirectPayroll: [], budgets: [], snapshots: [], year: 2026, month: 3, nowMs: Date.parse("2026-03-20T00:00:00Z"),
});

const withData = (): EacInput => ({
  ...base(),
  movements: [{ id: "M1", date: "2026-03-05T10:00:00Z", type: "Salida picking OT", code: "A", quantity: 10, from: "", to: "", reference: "", user: "u", wbs: "CT1-PRE", unitCost: 100 }],
  timeEntries: [{ id: "T1", orderId: "O1", orderType: "PRE", wbs: "CT1-PRE", operationOrder: 10, operationName: "", employeeId: "e", employeeName: "e",
    start: "2026-03-02T08:00:00Z", end: "2026-03-02T10:00:00Z", hourlyRate: 5000 }],
  invoices: [{ id: "F1", kind: "Compra", issueDate: "2026-03-10", exchangeRate: 1, netAmount: 3000, wbs: "CT1-PRE", status: "Contabilizada" },
    { id: "F2", kind: "Compra", issueDate: "2026-03-10", exchangeRate: 1, netAmount: 9999, wbs: "CT1-PRE", purchaseOrder: "31000001", status: "Contabilizada" },
    { id: "F3", kind: "Compra", issueDate: "2026-03-10", exchangeRate: 1, netAmount: 700, wbs: "OTRO", status: "Contabilizada" }] as EacInput["invoices"],
  purchaseOrders: [
    { id: "31000001", requestId: "S1", materialCode: "A", quantity: 10, receivedQuantity: 4, unitCost: 200, wbs: "CT1-PRE", status: "Aprobada" },
    { id: "31000002", requestId: "S2", materialCode: "A", quantity: 50, unitCost: 1000, wbs: "CT1-PRE", status: "Aprobada" },
  ] as EacInput["purchaseOrders"],
  requests: [
    { id: "S1", callIds: [], status: "OC aprobada", quantity: 10 },
    { id: "S2", callIds: ["C1"], status: "OC aprobada", quantity: 50 },
  ] as EacInput["requests"],
  orders: [{ id: "O2", type: "REP", wbs: "CT1-REP", status: "Asignada", projectedHours: 4, materials: [{ code: "A", required: 5, picked: 1 }] }] as EacInput["orders"],
  bins: [{ id: "B", code: "A", quantity: 10, unitCost: 100 }] as EacInput["bins"],
});

type Rows = ReturnType<typeof computeEac>;
const row = (rows: Rows, key: string) => rows.find((item) => item.key === key)!;
const categorySum = (rows: Rows, code: string) =>
  rows.filter((item) => item.kind === "category" && item.contract === code).reduce((acc, item) => acc + item.eac, 0);

describe("computeEac", () => {
  test("Real + ETC = EAC en cada fila", () => {
    const rows = computeEac(withData());
    for (const item of rows) expect(item.eac).toBeCloseTo(item.real + item.etc, 6);
    const pre = row(rows, "CT1|PRE");
    expect(pre.real).toBe(10 * 100 + 2 * 5000);
    expect(pre.etc).toBe(6 * 200);
    expect(row(rows, "CT1|Otros").etc).toBe(4 * 100);
  });

  test("una OC con callIds no suma a Comprometido y la factura con OC no es costo", () => {
    const rows = computeEac(withData());
    expect(row(rows, "CT1|PRE").etcDetail.materials).toBe(1200);
    expect(row(rows, "CT1|Otros").realDetail.services).toBe(3000);
    expect(row(rows, "Fuera de contrato").real).toBe(700);
  });

  test("Resultado total = suma de Resultados y Fuera de contrato", () => {
    const second: Contract = { ...contract, code: "CT2", wbs: [{ code: "CT2-COR", type: "COR", description: "", budget: 0 }] };
    const rows = computeEac({ ...withData(), contracts: [contract, second] });
    const sum = rows.filter((item) => item.kind === "result" || item.kind === "outside").reduce((acc, item) => acc + item.eac, 0);
    expect(row(rows, "TOTAL").eac).toBe(sum);
    expect(row(rows, "CT1|Resultado").eac).toBe(categorySum(rows, "CT1"));
  });

  test("sin snapshot previo la columna da null; con snapshot, variación", () => {
    const rows = computeEac(withData());
    expect(row(rows, "CT1|PRE").previousEac).toBeNull();
    expect(row(rows, "CT1|PRE").variation).toBeNull();
    expect(row(rows, "TOTAL").previousEac).toBeNull();
    const snaps = [
      { contract: "CT1", period: "2026-02", category: "PRE", real: 0, etc: 0, eac: 1000, savedAt: "", closed: false },
      { contract: "CT1", period: "2026-02", category: "PRE", real: 0, etc: 0, eac: 2000, savedAt: "", closed: true },
    ];
    const again = computeEac({ ...withData(), snapshots: snaps });
    expect(row(again, "CT1|PRE").previousEac).toBe(2000);
    expect(row(again, "CT1|PRE").variation).toBe(row(again, "CT1|PRE").eac - 2000);
    expect(row(again, "CT1|OVH").previousEac).toBeNull();
  });

  test("la escala solo cambia la presentación", () => {
    expect(computeEac(withData())).toEqual(computeEac(withData()));
    expect(formatScaled(null, 100)).toBe("-");
    expect(formatScaled(1230000, 1)).not.toBe(formatScaled(1230000, 100));
    expect(formatScaled(1230000, 10000)).toBe("123");
  });

  test("presupuesto: última versión y variación", () => {
    const budgets = [
      { contract: "CT1", category: "PRE", amount: 100, version: 1, approvedBy: "a", approvedAt: "" },
      { contract: "CT1", category: "PRE", amount: 5000, version: 2, approvedBy: "a", approvedAt: "" },
    ];
    const pre = row(computeEac({ ...withData(), budgets }), "CT1|PRE");
    expect(pre.budget).toBe(5000);
    expect(pre.varBudget).toBe(pre.eac - 5000);
  });

  test("nómina indirecta va a Otros; el filtro de contratos oculta Fuera de contrato", () => {
    const runs = [{ period: "2026-03", lines: [
      { employeeId: "i", allocations: [{ contract: "CT1", amount: 800 }] },
      { employeeId: "d", allocations: [{ contract: "CT1", amount: 5 }] },
    ] }];
    const indirect = indirectPayrollCosts(runs, new Set(["d"]));
    expect(indirect).toHaveLength(1);
    const rows = computeEac({ ...base(), indirectPayroll: indirect, contractCodes: ["CT1"] });
    expect(row(rows, "CT1|Otros").real).toBe(800);
    expect(rows.some((item) => item.kind === "outside")).toBe(false);
  });
});

describe("presupuesto versionado y snapshots", () => {
  beforeEach(() => installStorage());
  const actor = { user: "pm", role: "PM Proyecto" as const };

  test("nueva versión por categoría cambiada, con audit; otros roles no", () => {
    store.set(keys.approvedBudget, JSON.stringify([{ contract: "CT1", category: "PRE", amount: 10, version: 1, approvedBy: "a", approvedAt: "" }]));
    expect(saveBudgetVersion("CT1", [{ category: "PRE", amount: 10 }], actor).ok).toBe(false);
    expect(saveBudgetVersion("CT1", [{ category: "PRE", amount: 20 }], { user: "t", role: "Técnico" }).ok).toBe(false);
    expect(saveBudgetVersion("CT1", [{ category: "PRE", amount: 20 }, { category: "COR", amount: 5 }], actor).ok).toBe(true);
    const list = readApprovedBudgets();
    expect(list.filter((item) => item.category === "PRE").map((item) => item.version)).toEqual([1, 2]);
    expect(list.find((item) => item.category === "COR")?.version).toBe(1);
    expect(JSON.parse(store.get(keys.auditLog) ?? "[]")).toHaveLength(1);
    expect(nextBudgetVersions(list, "CT1", [{ category: "PRE", amount: 20 }], "x", "")).toHaveLength(0);
  });

  test("Cerrar mes guarda closed y no se sobreescribe; el mes siguiente ve el EAC anterior", () => {
    const rows = computeEac(withData());
    expect(closeMonth(rows, "2026-03", { user: "t", role: "Técnico" }).ok).toBe(false);
    expect(closeMonth(rows, "2026-03", actor).ok).toBe(true);
    expect(closeMonth(rows, "2026-03", actor).ok).toBe(false);
    const snaps = readEacSnapshots();
    expect(snaps.every((item) => item.closed && item.closedBy === "pm")).toBe(true);
    const april = computeEac({ ...withData(), month: 4, snapshots: snaps });
    expect(row(april, "CT1|PRE").previousEac).toBe(row(rows, "CT1|PRE").eac);
    const merged = mergeSnapshots(snaps, snapshotsFromRows(rows, "2026-03", "later"), false);
    expect(merged.every((item) => item.closed)).toBe(true);
  });
});
