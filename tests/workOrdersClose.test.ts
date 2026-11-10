import { beforeEach, describe, expect, test } from "vitest";
import { workOrderDoc } from "../src/components/print/printTemplates";
import type { AuditRecord } from "../src/data/audit";
import { keys } from "../src/data/keys";
import {
  assignOrder, closeOrder, createWorkOrder, orderTimeTotals, readTimeEntries, reopenOrder, requestProvisionalClose,
  startOperation, stopOperation,
} from "../src/data/workOrders";
import type { EmployeeRef, OperationEnv, WorkOrder } from "../src/data/workOrders";
import { installStorage, readStore, store } from "./helpers/storageMock";

const employees: EmployeeRef[] = [
  { id: "EMP-002", name: "Diego", supervisorLogin: "supervisor" },
  { id: "EMP-001", name: "Camila", login: "tecnico", direct: true, supervisorId: "EMP-002" },
];
const supervisor = { user: "supervisor", role: "Supervisor" as const };
const admin = { user: "IJOV", role: "Administrador" as const };
const camila = { user: "tecnico", role: "Técnico" as const };
const at = (hour: number) => new Date(Date.UTC(2026, 10, 10, hour));
const env = (now: Date): OperationEnv => ({ employees, rateOf: () => 18000, now });
let id = "";

const stored = () => readStore<WorkOrder[]>(keys.workOrders, [])[0];
const audit = () => readStore<AuditRecord[]>(keys.auditLog, []);

function toProvisional(type: "COR" | "ESPERA" = "COR") {
  const created = createWorkOrder({
    type, contract: "CT1234", wbs: "CT1234-W", equipment: "E", description: "D", dueDate: "2026-11-12", projectedHours: 2,
  }, supervisor);
  if (!created.ok) throw new Error(created.error);
  id = created.value.id;
  assignOrder(id, ["EMP-001"], supervisor, employees);
  startOperation({ orderId: id, operationOrder: 0 }, camila, env(at(8)));
  stopOperation(id, camila, env(at(10)));
  requestProvisionalClose(id, camila, env(at(10)));
}

beforeEach(() => {
  installStorage();
  toProvisional();
});

function approveQuality() {
  store.set(keys.workOrders, JSON.stringify([{ ...stored(), qualityApproved: true, qualityApprovedBy: "calidad" }]));
}

describe("cierre y reapertura (E3.4)", () => {
  test("cerrar exige Calidad aprobada (salvo ESPERA) y estado Cierre provisorio", () => {
    expect(closeOrder(id, supervisor).ok).toBe(false);
    approveQuality();
    const result = closeOrder(id, supervisor, at(11));
    expect(result.ok).toBe(true);
    expect(stored()).toMatchObject({ status: "Cerrada", closedBy: "supervisor", closedAt: at(11).toISOString() });
    expect(closeOrder(id, supervisor).ok).toBe(false);
  });

  test("ESPERA se cierra sin aprobación de Calidad", () => {
    installStorage();
    toProvisional("ESPERA");
    expect(closeOrder(id, admin).ok).toBe(true);
  });

  test("solo Supervisor y Administrador cierran y reabren", () => {
    approveQuality();
    expect(closeOrder(id, camila).ok).toBe(false);
    expect(closeOrder(id, { user: "pl", role: "Planificador" }).ok).toBe(false);
    expect(closeOrder(id, admin).ok).toBe(true);
    expect(reopenOrder(id, "motivo", camila).ok).toBe(false);
    expect(reopenOrder(id, "motivo", { user: "ca", role: "Calidad" }).ok).toBe(false);
    expect(reopenOrder(id, "motivo", admin).ok).toBe(true);
  });

  test("no cierra con operaciones abiertas", () => {
    approveQuality();
    store.set(keys.timeEntries, JSON.stringify([{ ...readTimeEntries()[0], id: "TE-X", end: null }]));
    expect(closeOrder(id, supervisor).ok).toBe(false);
  });

  test("reabrir exige motivo, vuelve a Asignada, limpia calidad y registra audit con motivo", () => {
    approveQuality();
    closeOrder(id, supervisor, at(11));
    expect(reopenOrder(id, "   ", supervisor).ok).toBe(false);
    expect(stored().status).toBe("Cerrada");
    expect(reopenOrder(id, "  Defecto en prueba  ", supervisor, at(12)).ok).toBe(true);
    expect(stored()).toMatchObject({ status: "Asignada", qualityApproved: false, qualityApprovedBy: null });
    expect(stored().closedBy).toBeUndefined();
    const last = stored().statusHistory.at(-1);
    expect(last).toMatchObject({ previousStatus: "Cerrada", newStatus: "Asignada", reason: "Defecto en prueba" });
    expect(audit().at(-1)).toMatchObject({ entity: "order", entityId: id, action: "reopen", reason: "Defecto en prueba", user: "supervisor", role: "Supervisor" });
  });

  test("reabrir solo aplica a OT Cerrada", () => {
    expect(reopenOrder(id, "x", supervisor).ok).toBe(false);
  });

  test("el costo real no cambia al reabrir hasta registrar nuevas horas", () => {
    approveQuality();
    closeOrder(id, supervisor, at(11));
    const before = orderTimeTotals(id, readTimeEntries(), at(20).getTime());
    reopenOrder(id, "Retrabajo", supervisor, at(12));
    expect(orderTimeTotals(id, readTimeEntries(), at(20).getTime())).toEqual(before);
    startOperation({ orderId: id, operationOrder: 0 }, camila, env(at(13)));
    stopOperation(id, camila, env(at(14)));
    expect(orderTimeTotals(id, readTimeEntries(), at(20).getTime()).laborCost).toBe(before.laborCost + 18000);
  });
});

describe("workOrderDoc", () => {
  test("incluye operaciones y tiempos; las tarifas solo con showCosts", () => {
    const order = stored();
    const withCosts = workOrderDoc(order, readTimeEntries(), { showCosts: true, nowMs: at(12).getTime() });
    const withoutCosts = workOrderDoc(order, readTimeEntries(), { showCosts: false, nowMs: at(12).getTime() });
    expect(withCosts.docNumber).toBe(id);
    expect(withCosts.bodyHtml).toContain("Camila");
    expect(withCosts.bodyHtml).toContain("Tarifa/h");
    expect(withCosts.bodyHtml).toContain("36000");
    expect(withoutCosts.bodyHtml).not.toContain("Tarifa/h");
    expect(withoutCosts.bodyHtml).not.toContain("18000");
  });
});
