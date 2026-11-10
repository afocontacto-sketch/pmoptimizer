import { describe, expect, test } from "vitest";
import { purchaseInvoiceWbsError, requestCostAssignment } from "../src/modules/supplyData";
import { plannedLaborCost } from "../src/modules/operationsData";
import type { WorkOrder } from "../src/modules/operationsData";
import { invoiceDoc } from "../src/components/print/templates/invoiceDoc";
import { purchaseOrderDoc } from "../src/components/print/templates/purchaseOrderDoc";

const base = {
  id: "51000001", type: "PRE", contract: "CT1234", wbs: "CT1234-PRE", equipment: "EQ", description: "",
  dueDate: "2026-01-01", assignees: [], projectedHours: 5, status: "Asignada", materials: [],
  pickingStatus: "Sin picking", statusHistory: [], createdAt: "", createdBy: "u", supervisorClosedBy: null,
} as unknown as WorkOrder;

describe("WBS obligatorio en facturas de compra", () => {
  test("compra sin OC y sin WBS es rechazada", () => {
    expect(purchaseInvoiceWbsError({ kind: "Compra", purchaseOrder: "", wbs: "" })).toMatch(/WBS/);
    expect(purchaseInvoiceWbsError({ kind: "Compra", wbs: "  " })).not.toBeNull();
  });
  test("compra con WBS, compra con OC y venta pasan", () => {
    expect(purchaseInvoiceWbsError({ kind: "Compra", wbs: "CT1234-PRE" })).toBeNull();
    expect(purchaseInvoiceWbsError({ kind: "Compra", purchaseOrder: "31000001" })).toBeNull();
    expect(purchaseInvoiceWbsError({ kind: "Venta" })).toBeNull();
  });
});

describe("WBS de solicitudes", () => {
  const calls = [{ id: "C1", plan: { contract: "CT1", wbs: "CT1-PRE" } }];
  test("desde MRP toma el plan de la llamada", () => {
    expect(requestCostAssignment({ callIds: ["C1"] }, calls)).toEqual({ contract: "CT1", wbs: "CT1-PRE" });
  });
  test("el WBS guardado en la solicitud tiene prioridad y sin datos devuelve null", () => {
    expect(requestCostAssignment({ callIds: ["C1"], contract: "CT9", wbs: "CT9-OVH" }, calls)).toEqual({ contract: "CT9", wbs: "CT9-OVH" });
    expect(requestCostAssignment({ callIds: ["X"] }, calls)).toBeNull();
  });
});

describe("plannedLaborCost", () => {
  test("usa projectedLaborCost cuando existe", () => {
    expect(plannedLaborCost({ ...base, projectedLaborCost: 1234 })).toBe(1234);
  });
  test("sin projectedLaborCost calcula horas x tarifa indicada", () => {
    expect(plannedLaborCost(base, 20000)).toBe(100000);
  });
  test("sin tarifa usa el promedio ponderado de la ruta", () => {
    const routed = { ...base, routeOperations: [
      { order: 1, name: "a", durationHours: 1, hourlyCost: 10000, materials: [] },
      { order: 2, name: "b", durationHours: 3, hourlyCost: 20000, materials: [] },
    ] };
    expect(plannedLaborCost(routed)).toBe(5 * 17500);
  });
  test("sin datos devuelve 0", () => {
    expect(plannedLaborCost(base)).toBe(0);
  });
});

describe("plantillas de impresión", () => {
  test("la OC incluye WBS y escapa HTML", () => {
    const doc = purchaseOrderDoc({
      id: "31000001", requestId: "21000001", materialCode: "M", materialName: "<b>x</b>", unit: "un", quantity: 2,
      supplier: "P", unitCost: 100, expectedDate: "2026-02-01", wbs: "CT1-PRE", contract: "CT1", status: "Aprobada",
    });
    expect(doc.docNumber).toBe("31000001");
    expect(doc.meta).toContainEqual(["WBS", "CT1-PRE"]);
    expect(doc.bodyHtml).not.toContain("<b>x</b>");
  });
  test("la factura de venta se marca como prueba", () => {
    const doc = invoiceDoc({
      id: "FV-1", kind: "Venta", documentType: "Factura afecta", number: "1", counterparty: "C", issueDate: "2026-01-01",
      dueDate: "2026-01-02", currency: "CLP", exchangeRate: 1, netAmount: 100, vatAmount: 19, totalAmount: 119,
      totalClp: 119, accountCode: "410101", status: "Emitida (demo)",
    });
    expect(doc.title).toContain("sin validez");
  });
});
