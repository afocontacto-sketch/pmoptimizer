import { describe, expect, test } from "vitest";
import { backlogByMonth, hoursByMonth, overdueItems } from "../src/data/pmDashboards";
import { eacMatrix, eacTableDoc } from "../src/components/print/templates/eacTableDoc";
import { computeEac } from "../src/data/projectCost";
import type { PlannedCallRecord, RouteTemplate } from "../src/modules/maintenanceData";
import type { TimeEntry, WorkOrder } from "../src/data/workOrders";

const route = { id: "R", name: "R", operations: [{ order: 10, name: "a", durationHours: 3, hourlyCost: 1, materials: [] }] } as RouteTemplate;
const call = (id: string, contract: string, due: string) =>
  ({ id, routeId: "R", dueDate: `${due}T12:00:00.000Z`, plan: { contract, wbs: `${contract}-PRE`, equipmentId: "E", name: "P" } }) as PlannedCallRecord;
const calls = [call("C1", "CT1", "2026-01-10"), call("C2", "CT1", "2026-01-20"), call("C3", "CT2", "2026-02-05")];
const orders = [{ id: "O1", plannedCallId: "C1", contract: "CT1", status: "Cerrada", projectedHours: 4, type: "PRE", wbs: "CT1-PRE", dueDate: "2026-01-10" }] as WorkOrder[];
const entries = [{ id: "T", orderId: "O1", start: "2026-01-11T08:00:00Z", end: "2026-01-11T10:00:00Z" }] as TimeEntry[];
const filter = { contract: "CT1", fromMonth: "2026-01", toMonth: "2026-02" };

describe("dashboards PM", () => {
  test("backlog cambia con el contrato", () => {
    expect(backlogByMonth(calls, orders, [route], filter)).toEqual([
      { month: "2026-01", planned: 2, closed: 1, open: 1 }, { month: "2026-02", planned: 0, closed: 0, open: 0 },
    ]);
    expect(backlogByMonth(calls, orders, [route], { ...filter, contract: "" })[1].planned).toBe(1);
  });
  test("vencidas y horas planificadas vs reales", () => {
    expect(overdueItems(calls, orders, [route], filter, "2026-03-01").map((item) => item.id)).toEqual(["C2"]);
    const hours = hoursByMonth(calls, orders, [route], entries, filter, Date.now());
    expect(hours[0]).toEqual({ month: "2026-01", planned: 4 + 3, real: 2 });
  });
  test("plantilla EAC: logo vía printDocument, tabla completa y escala", () => {
    const rows = computeEac({ contracts: [{ code: "CT1", customer: "", description: "", wbs: [] }], orders: [], timeEntries: [], movements: [], invoices: [], purchaseOrders: [],
      requests: [], calls: [], routes: [], bins: [], indirectPayroll: [], budgets: [], snapshots: [], year: 2026, month: 3, nowMs: 0 });
    const doc = eacTableDoc(rows, { period: "2026-03", scale: 100, contracts: [] });
    expect(doc.bodyHtml).toContain("Resultado total");
    expect(doc.bodyHtml).toContain("EAC mes anterior");
    expect(eacMatrix(rows, 1, true)[0][5]).toBe("");
  });
});
