import { beforeEach, describe, expect, test } from "vitest";
import type { AuditRecord } from "../src/data/audit";
import { keys } from "../src/data/keys";
import {
  assignableEmployees, assignOrder, compareOrdersByPriority, createWorkOrder, isAssignee,
} from "../src/data/workOrders";
import type { EmployeeRef, TimeEntry, WorkOrder } from "../src/data/workOrders";
import { installStorage, readStore, store } from "./helpers/storageMock";

const employees: EmployeeRef[] = [
  { id: "EMP-002", name: "Diego", supervisorLogin: "supervisor" },
  { id: "EMP-001", name: "Camila", login: "tecnico", direct: true, supervisorId: "EMP-002" },
  { id: "EMP-004", name: "Tomás", login: "tecnico2", direct: true, supervisorId: "EMP-002" },
  { id: "EMP-009", name: "Otro", login: "otro", direct: true, supervisorId: "EMP-777" },
  { id: "EMP-010", name: "Oficina", supervisorId: "EMP-002" },
];
const supervisor = { user: "supervisor", role: "Supervisor" as const };
let orderId = "";

beforeEach(() => {
  installStorage();
  const created = createWorkOrder({
    type: "COR", contract: "CT1234", wbs: "CT1234-COR", equipment: "E", description: "D", dueDate: "2026-11-12", projectedHours: 2,
  }, supervisor);
  if (!created.ok) throw new Error(created.error);
  orderId = created.value.id;
});

const entry = (over: Partial<TimeEntry>): TimeEntry => ({
  id: "TE-1", orderId, orderType: "COR", wbs: "W", operationOrder: 10, operationName: "Op", employeeId: "EMP-001",
  employeeName: "Camila", start: "2026-11-10T08:00:00.000Z", end: null, hourlyRate: 1000, ...over,
});

describe("assignOrder (E3.2)", () => {
  test("multi-asignación: 2 técnicos quedan como assignees y la OT pasa a Asignada", () => {
    const result = assignOrder(orderId, ["EMP-001", "EMP-004"], supervisor, employees);
    expect(result.ok).toBe(true);
    const stored = readStore<WorkOrder[]>(keys.workOrders, [])[0];
    expect(stored.status).toBe("Asignada");
    expect(isAssignee(stored, "EMP-001") && isAssignee(stored, "EMP-004")).toBe(true);
    expect(readStore<AuditRecord[]>(keys.auditLog, []).some((item) => item.action === "assign")).toBe(true);
  });

  test("quitar un asignado lo saca de la OT; sin asignados vuelve a Sin asignar", () => {
    assignOrder(orderId, ["EMP-001", "EMP-004"], supervisor, employees);
    assignOrder(orderId, ["EMP-004"], supervisor, employees);
    expect(isAssignee(readStore<WorkOrder[]>(keys.workOrders, [])[0], "EMP-001")).toBe(false);
    assignOrder(orderId, [], supervisor, employees);
    expect(readStore<WorkOrder[]>(keys.workOrders, [])[0].status).toBe("Sin asignar");
  });

  test("el supervisor solo elige a su equipo con login o directos", () => {
    expect(assignableEmployees(employees, supervisor).map((item) => item.id)).toEqual(["EMP-001", "EMP-004"]);
    expect(assignOrder(orderId, ["EMP-009"], supervisor, employees).ok).toBe(false);
    expect(assignOrder(orderId, ["EMP-010"], supervisor, employees).ok).toBe(false);
    expect(assignableEmployees(employees, { user: "IJOV", role: "Administrador" })).toHaveLength(3);
  });

  test("roles sin order.assign son rechazados", () => {
    expect(assignOrder(orderId, ["EMP-001"], { user: "t", role: "Técnico" }, employees).ok).toBe(false);
    expect(assignOrder(orderId, ["EMP-001"], { user: "p", role: "Planificador" }, employees).ok).toBe(false);
  });

  test("no se puede quitar a quien tiene tiempo abierto ni asignar OT cerrada", () => {
    assignOrder(orderId, ["EMP-001", "EMP-004"], supervisor, employees);
    store.set(keys.timeEntries, JSON.stringify([entry({})]));
    expect(assignOrder(orderId, ["EMP-004"], supervisor, employees).ok).toBe(false);
    const orders = readStore<WorkOrder[]>(keys.workOrders, []);
    store.set(keys.workOrders, JSON.stringify(orders.map((item) => ({ ...item, status: "Cerrada" }))));
    expect(assignOrder(orderId, ["EMP-004"], supervisor, employees).ok).toBe(false);
  });

  test("compareOrdersByPriority ordena por prioridad y luego fecha", () => {
    const list = [
      { priority: undefined, dueDate: "2026-01-01" },
      { priority: "Baja" as const, dueDate: "2026-01-01" },
      { priority: "Alta" as const, dueDate: "2026-03-01" },
      { priority: "Alta" as const, dueDate: "2026-02-01" },
    ].sort(compareOrdersByPriority);
    expect(list.map((item) => `${item.priority}|${item.dueDate}`))
      .toEqual(["Alta|2026-02-01", "Alta|2026-03-01", "Baja|2026-01-01", "undefined|2026-01-01"]);
  });
});
