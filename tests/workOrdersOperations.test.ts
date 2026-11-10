import { beforeEach, describe, expect, test } from "vitest";
import { keys } from "../src/data/keys";
import {
  assignOrder, createWorkOrder, openEntryOf, operationHours, orderOperations, orderTimeTotals, readTimeEntries,
  requestProvisionalClose, startOperation, stopOperation,
} from "../src/data/workOrders";
import type { EmployeeRef, OperationEnv, TimeEntry, WorkOrder } from "../src/data/workOrders";
import { installStorage, readStore } from "./helpers/storageMock";

const employees: EmployeeRef[] = [
  { id: "EMP-002", name: "Diego", supervisorLogin: "supervisor" },
  { id: "EMP-001", name: "Camila", login: "tecnico", direct: true, supervisorId: "EMP-002" },
  { id: "EMP-004", name: "Tomás", login: "tecnico2", direct: true, supervisorId: "EMP-002" },
];
const supervisor = { user: "supervisor", role: "Supervisor" as const };
const camila = { user: "tecnico", role: "Técnico" as const };
const tomas = { user: "tecnico2", role: "Técnico" as const };
const at = (hour: number, minute = 0) => new Date(Date.UTC(2026, 10, 10, hour, minute));
const env = (now: Date): OperationEnv => ({ employees, rateOf: (name) => name === "Camila" ? 18000 : 20000, now });
let orderA = "";
let orderB = "";

const routeOps = [
  { order: 10, name: "Diagnóstico", durationHours: 1 },
  { order: 20, name: "Reparación", durationHours: 2 },
] as unknown as WorkOrder["routeOperations"];

function makeOrder(description: string): string {
  const created = createWorkOrder({
    type: "COR", contract: "CT1234", wbs: "CT1234-COR", equipment: "E", description, dueDate: "2026-11-12",
    projectedHours: 3, routeOperations: routeOps,
  }, supervisor);
  if (!created.ok) throw new Error(created.error);
  const assigned = assignOrder(created.value.id, ["EMP-001", "EMP-004"], supervisor, employees);
  if (!assigned.ok) throw new Error(assigned.error);
  return created.value.id;
}

const statusOf = (id: string) => readStore<WorkOrder[]>(keys.workOrders, []).find((item) => item.id === id)?.status;

beforeEach(() => {
  installStorage();
  orderA = makeOrder("A");
  orderB = makeOrder("B");
});

describe("operaciones y timeEntries (E3.3)", () => {
  test("iniciar crea entrada abierta con tarifa y pasa la OT a En ejecución", () => {
    const result = startOperation({ orderId: orderA, operationOrder: 10 }, camila, env(at(8)));
    expect(result.ok).toBe(true);
    const [entry] = readTimeEntries();
    expect(entry).toMatchObject({ orderId: orderA, operationOrder: 10, employeeId: "EMP-001", end: null, hourlyRate: 18000 });
    expect(statusOf(orderA)).toBe("En ejecución");
  });

  test("detener cierra la entrada y la OT vuelve a Asignada; costo = horas x tarifa", () => {
    startOperation({ orderId: orderA, operationOrder: 10 }, camila, env(at(8)));
    expect(stopOperation(orderA, camila, env(at(10))).ok).toBe(true);
    const [entry] = readTimeEntries();
    expect(entry.end).toBe(at(10).toISOString());
    expect(statusOf(orderA)).toBe("Asignada");
    expect(orderTimeTotals(orderA, readTimeEntries(), at(12).getTime())).toEqual({ seconds: 7200, laborCost: 36000 });
    expect(operationHours(orderA, 10, readTimeEntries(), at(12).getTime())).toBe(2);
  });

  test("Q7: iniciar otra operación en la MISMA OT pausa la abierta sin error", () => {
    startOperation({ orderId: orderA, operationOrder: 10 }, camila, env(at(8)));
    const second = startOperation({ orderId: orderA, operationOrder: 20 }, camila, env(at(9)));
    expect(second.ok && second.value.paused?.operationOrder).toBe(10);
    const entries = readTimeEntries();
    expect(entries).toHaveLength(2);
    expect(entries.find((item) => item.operationOrder === 10)?.end).toBe(at(9).toISOString());
    expect(entries.filter((item) => item.end === null)).toHaveLength(1);
    expect(statusOf(orderA)).toBe("En ejecución");
  });

  test("Q7: iniciar en OTRA OT pausa la anterior; la OT anterior vuelve a Asignada", () => {
    startOperation({ orderId: orderA, operationOrder: 10 }, camila, env(at(8)));
    const result = startOperation({ orderId: orderB, operationOrder: 10 }, camila, env(at(9, 30)));
    expect(result.ok).toBe(true);
    const open = openEntryOf(readTimeEntries(), "EMP-001");
    expect(open?.orderId).toBe(orderB);
    expect(readTimeEntries().find((item) => item.orderId === orderA)?.end).toBe(at(9, 30).toISOString());
    expect(statusOf(orderA)).toBe("Asignada");
    expect(statusOf(orderB)).toBe("En ejecución");
  });

  test("la OT pausada sigue En ejecución si otro técnico trabaja en ella", () => {
    startOperation({ orderId: orderA, operationOrder: 10 }, camila, env(at(8)));
    startOperation({ orderId: orderA, operationOrder: 20 }, tomas, env(at(8, 30)));
    startOperation({ orderId: orderB, operationOrder: 10 }, camila, env(at(9)));
    expect(statusOf(orderA)).toBe("En ejecución");
  });

  test("la misma operación ya en curso devuelve error y no duplica", () => {
    startOperation({ orderId: orderA, operationOrder: 10 }, camila, env(at(8)));
    expect(startOperation({ orderId: orderA, operationOrder: 10 }, camila, env(at(9))).ok).toBe(false);
    expect(readTimeEntries()).toHaveLength(1);
  });

  test("validaciones: rol, asignación, operación inexistente, sin empleado y OT en cierre", () => {
    expect(startOperation({ orderId: orderA, operationOrder: 10 }, supervisor, env(at(8))).ok).toBe(false);
    expect(startOperation({ orderId: orderA, operationOrder: 99 }, camila, env(at(8))).ok).toBe(false);
    expect(startOperation({ orderId: orderA, operationOrder: 10 }, { user: "huerfano", role: "Técnico" }, env(at(8))).ok).toBe(false);
    assignOrder(orderB, ["EMP-004"], supervisor, employees);
    expect(startOperation({ orderId: orderB, operationOrder: 10 }, camila, env(at(8))).ok).toBe(false);
    expect(requestProvisionalClose(orderA, camila, env(at(9))).ok).toBe(true);
    expect(startOperation({ orderId: orderA, operationOrder: 10 }, camila, env(at(10))).ok).toBe(false);
    expect(readTimeEntries()).toHaveLength(0);
  });

  test("detener sin operación abierta devuelve error", () => {
    expect(stopOperation(orderA, camila, env(at(8))).ok).toBe(false);
  });

  test("cierre provisorio exige entradas cerradas y deja la OT en Cierre provisorio", () => {
    startOperation({ orderId: orderA, operationOrder: 10 }, camila, env(at(8)));
    expect(requestProvisionalClose(orderA, camila, env(at(9))).ok).toBe(false);
    stopOperation(orderA, camila, env(at(9)));
    expect(requestProvisionalClose(orderA, camila, env(at(9, 5))).ok).toBe(true);
    expect(statusOf(orderA)).toBe("Cierre provisorio");
  });

  test("orderOperations: sin ruta usa una operación general (ESPERA = Espera)", () => {
    expect(orderOperations({ type: "COR", projectedHours: 2 })).toEqual([{ order: 0, name: "Trabajo general", durationHours: 2 }]);
    expect(orderOperations({ type: "ESPERA", projectedHours: 0 })[0].name).toBe("Espera");
  });

  test("el cronómetro se deriva del start: recargar no pierde el tiempo", () => {
    startOperation({ orderId: orderA, operationOrder: 10 }, camila, env(at(8)));
    const entries = readStore<TimeEntry[]>(keys.timeEntries, []);
    expect(orderTimeTotals(orderA, entries, at(8, 30).getTime()).seconds).toBe(1800);
  });
});
