import { beforeEach, describe, expect, test } from "vitest";
import { keys } from "../src/data/keys";
import { createWorkOrder } from "../src/data/workOrders";
import type { NewWorkOrderInput, WorkOrder } from "../src/data/workOrders";
import type { AuditRecord } from "../src/data/audit";
import { installStorage, readStore, store } from "./helpers/storageMock";

beforeEach(installStorage);

const input = (over: Partial<NewWorkOrderInput> = {}): NewWorkOrderInput => ({
  type: "COR", contract: "CT1234", wbs: "CT1234-CL-B2N4-COR", equipment: "VEH-002", description: "Frenos",
  dueDate: "2026-11-12", projectedHours: 4, ...over,
});

describe("createWorkOrder (E3.1)", () => {
  test("Supervisor crea COR con serie 61, estado Sin asignar y audit", () => {
    const result = createWorkOrder(input(), { user: "supervisor", role: "Supervisor" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.id).toBe("61000001");
    expect(result.value.status).toBe("Sin asignar");
    expect(readStore<WorkOrder[]>(keys.workOrders, [])).toHaveLength(1);
    const audit = readStore<AuditRecord[]>(keys.auditLog, []);
    expect(audit[0]).toMatchObject({ entity: "order", entityId: "61000001", action: "create", user: "supervisor" });
  });

  test("con asignados queda Asignada y la numeración avanza", () => {
    const actor = { user: "supervisor", role: "Supervisor" as const };
    createWorkOrder(input(), actor);
    const second = createWorkOrder(input({ assignees: [{ employeeId: "EMP-001", name: "Camila" }] }), actor);
    expect(second.ok && second.value.id).toBe("61000002");
    expect(second.ok && second.value.status).toBe("Asignada");
  });

  test("Planificador no puede crear COR; Supervisor no puede crear PRE", () => {
    const planner = createWorkOrder(input(), { user: "p", role: "Planificador" });
    expect(planner).toEqual({ ok: false, error: expect.stringContaining("COR") });
    const supervisor = createWorkOrder(input({ type: "PRE", wbs: "CT1234-PRE" }), { user: "s", role: "Supervisor" });
    expect(supervisor.ok).toBe(false);
    expect(store.has(keys.workOrders)).toBe(false);
  });

  test("roles sin order.create son rechazados", () => {
    expect(createWorkOrder(input(), { user: "t", role: "Técnico" }).ok).toBe(false);
  });

  test("GAR exige WBS -GAR; con WBS correcto crea 81xxxxxx", () => {
    const actor = { user: "pl", role: "Planificador" as const };
    expect(createWorkOrder(input({ type: "GAR", wbs: "CT1234-CL-B2N4-PRE" }), actor).ok).toBe(false);
    const created = createWorkOrder(input({ type: "GAR", wbs: "CT1234-CL-B2N4-GAR" }), actor);
    expect(created.ok && created.value.id).toBe("81000001");
  });

  test("dueDate obligatoria, WBS obligatorio y llamada duplicada", () => {
    const actor = { user: "pl", role: "Planificador" as const };
    const base = { type: "PRE" as const, wbs: "CT1234-PRE" };
    expect(createWorkOrder(input({ ...base, dueDate: "" }), actor).ok).toBe(false);
    expect(createWorkOrder(input({ ...base, wbs: " " }), actor).ok).toBe(false);
    expect(createWorkOrder(input({ ...base, plannedCallId: "C1" }), actor).ok).toBe(true);
    expect(createWorkOrder(input({ ...base, plannedCallId: "C1" }), actor).ok).toBe(false);
  });
});
