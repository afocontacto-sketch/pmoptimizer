import { beforeEach, describe, expect, test } from "vitest";
import { resetDemoData } from "../src/data/backup";
import { deleteClient, deleteContract, readClients, readContracts, resolveWbs, saveContract } from "../src/data/contracts";
import type { ClientContract } from "../src/data/contracts";
import { keys } from "../src/data/keys";
import { computeEac } from "../src/data/projectCost";
import type { EacInput } from "../src/data/projectCost";
import { closeMonth } from "../src/data/projectCostStore";
import { dispatchBoard, dispatchOverdue } from "../src/data/stock";
import type { StockBin } from "../src/data/stock";
import type { WorkOrder } from "../src/data/workOrders";
import { decidePurchaseOrder } from "../src/modules/supplyData";
import type { PurchaseOrder, PurchaseRequest } from "../src/modules/supplyData";
import { installStorage, store } from "./helpers/storageMock";

const admin = { user: "admin", role: "Administrador" as const };
const draft = (code: string, wbs: string[] = [""]): ClientContract => ({
  id: `CTR-${code}`, code, name: "Servicio", clientId: "", startDate: "2026-01-01", endDate: "2026-12-31", budget: 1, createdAt: "2026-01-01",
  wbs: wbs.map((value, index) => ({ id: `W${index}`, code: value, type: "PRE", description: "" })),
});

describe("A1 · contrato y WBS únicos", () => {
  beforeEach(() => { installStorage(); resetDemoData("Administrador"); });
  const client = () => readClients().find((item) => item.id === "CLI-demo-1")!.id;

  test("WBS por defecto contrato-tipo y dos contratos nuevos no colisionan", () => {
    expect(resolveWbs("CT9", draft("CT9").wbs)[0].code).toBe("CT9-PRE");
    expect(saveContract(client(), draft("CT9"), admin).ok).toBe(true);
    expect(saveContract(client(), draft("CT10"), admin).ok).toBe(true);
    const codes = readContracts().flatMap((contract) => contract.wbs.map((element) => element.code));
    expect(new Set(codes).size).toBe(codes.length);
  });

  test("rechaza código de contrato repetido (incluido el demo) y WBS repetido", () => {
    const first = saveContract(client(), draft("CT1234"), admin);
    expect(first.ok === false && first.error).toMatch(/ya existe/);
    expect(saveContract(client(), draft("CT9"), admin).ok).toBe(true);
    const dup = saveContract(client(), { ...draft("CT11", ["CT9-PRE"]), id: "otro" }, admin);
    expect(dup.ok === false && dup.error).toMatch(/otro contrato/);
    const same = saveContract(client(), draft("CT12", ["X-PRE", "x-pre"]), admin);
    expect(same.ok === false && same.error).toMatch(/repetido/);
  });

  test("editar el mismo contrato no choca consigo mismo y exige permiso", () => {
    expect(saveContract(client(), draft("CT9"), admin).ok).toBe(true);
    expect(saveContract(client(), { ...draft("CT9"), name: "Editado" }, admin).ok).toBe(true);
    expect(saveContract(client(), draft("CT13"), { user: "t", role: "Técnico" }).ok).toBe(false);
  });

  test("M2 · no se borra cliente ni contrato con OT/OC/facturas asociadas", () => {
    const blocked = deleteClient("CLI-demo-4", admin);
    expect(blocked.ok === false && blocked.error).toMatch(/órdenes de trabajo/);
    const contract = deleteContract("CLI-demo-4", "CTR-demo-1", admin);
    expect(contract.ok).toBe(false);
    expect(saveContract(client(), draft("CT9"), admin).ok).toBe(true);
    expect(deleteContract(client(), "CTR-CT9", admin).ok).toBe(true);
    expect(deleteClient("CLI-demo-1", admin).ok).toBe(true);
    expect(store.has(keys.clients)).toBe(true);
  });
});

describe("A2 · EAC con datos al corte y cierre de mes", () => {
  const contract = { code: "CT1", customer: "C", description: "", wbs: [{ code: "CT1-PRE", type: "PRE" as const, description: "", budget: 0 }] };
  const order = { id: "O1", type: "PRE", wbs: "CT1-PRE", status: "Cerrada", projectedHours: 10, projectedLaborCost: 100000, materials: [],
    closedAt: "2026-04-10T10:00:00Z", createdAt: "2026-02-01T00:00:00Z" } as unknown as WorkOrder;
  const input = (month: number): EacInput => ({
    contracts: [contract], orders: [order], movements: [], invoices: [], purchaseOrders: [], requests: [], calls: [], routes: [], bins: [],
    indirectPayroll: [], budgets: [], snapshots: [], year: 2026, month, nowMs: Date.parse("2026-05-01T00:00:00Z"),
    timeEntries: [
      { id: "T1", orderId: "O1", orderType: "PRE", wbs: "CT1-PRE", operationOrder: 10, operationName: "", employeeId: "e", employeeName: "e",
        start: "2026-03-02T08:00:00Z", end: "2026-03-02T10:00:00Z", hourlyRate: 10000 },
      { id: "T2", orderId: "O1", orderType: "PRE", wbs: "CT1-PRE", operationOrder: 10, operationName: "", employeeId: "e", employeeName: "e",
        start: "2026-04-05T08:00:00Z", end: "2026-04-05T13:00:00Z", hourlyRate: 10000 },
    ],
  });
  const pre = (rows: ReturnType<typeof computeEac>) => rows.find((item) => item.key === "CT1|PRE")!;

  test("ETC al corte de marzo usa solo horas <= corte y mantiene abierta la OT cerrada después", () => {
    const march = pre(computeEac(input(3)));
    expect(march.real).toBe(20000);
    expect(march.etc).toBe(80000);
    expect(pre(computeEac(input(4))).etc).toBe(0);
  });

  test("closeMonth rechaza meses futuros", () => {
    installStorage();
    const rows = computeEac(input(3));
    const result = closeMonth(rows, "2026-12", { user: "pm", role: "PM Proyecto" }, new Date("2026-05-01T00:00:00Z"));
    expect(result.ok).toBe(false);
    expect(closeMonth(rows, "2026-04", { user: "pm", role: "PM Proyecto" }, new Date("2026-05-01T00:00:00Z")).ok).toBe(true);
  });
});

describe("A3 · aprobar OC solo desde Pendiente aprobación", () => {
  const orders = (status: PurchaseOrder["status"]) => [{ id: "31000001", requestId: "S1", status }] as PurchaseOrder[];
  const requests = [{ id: "S1", status: "OC pendiente aprobación" }] as PurchaseRequest[];

  test("rechaza Rechazada, Recepcionada y Aprobada; acepta Pendiente", () => {
    for (const status of ["Rechazada", "Recepcionada", "Aprobada"] as const) {
      expect(decidePurchaseOrder(orders(status), requests, "31000001", true, "pm").ok).toBe(false);
    }
    const done = decidePurchaseOrder(orders("Pendiente aprobación"), requests, "31000001", true, "pm");
    expect(done.ok && done.value.orders[0].status).toBe("Aprobada");
    expect(done.ok && done.value.requests[0].status).toBe("OC aprobada");
  });
});

describe("M3/M4 · tablero de despacho", () => {
  const bin = (status: StockBin["status"], location: string, quantity: number): StockBin =>
    ({ id: `${status}${location}`, code: "M1", name: "M", warehouse: "B", location, status, quantity, reserved: 0, unit: "u", unitCost: 1 });
  const ot = (dueDate: string): WorkOrder => ({ id: "O", type: "COR", status: "Asignada", dueDate, materials: [{ code: "M1", required: 10, picked: 0 }] }) as unknown as WorkOrder;

  test("OT vencida aparece en Vencidas y no en los días", () => {
    const bins = [bin("Libre utilización", "A-01", 10)];
    expect(dispatchOverdue("2026-11-10", [ot("2026-11-05")], bins)).toHaveLength(1);
    expect(dispatchBoard("2026-11-10", 3, [ot("2026-11-05")], bins).every((day) => day.orders.length === 0)).toBe(true);
    expect(dispatchOverdue("2026-11-10", [ot("2026-11-10")], bins)).toHaveLength(0);
  });

  test("stock Por ubicar cuenta como ámbar", () => {
    const bins = [bin("Libre utilización", "A-01", 4), bin("Libre utilización", "REC-UBICAR", 6)];
    expect(dispatchBoard("2026-11-10", 3, [ot("2026-11-10")], bins)[0].orders[0].light).toBe("ambar");
  });
});
