import { defaultAccounts } from "../modules/financeData";
import type { FinanceAccount, FinanceInvoice, JournalEntry } from "../modules/financeData";
import type { PayrollRun } from "../modules/HumanResourcesPage";
import { samplePlans, sampleRoutes } from "../modules/maintenanceData";
import type { MaintenancePlan } from "../modules/maintenanceData";
import type { AwardHistory, PurchaseOrder, PurchaseQuote, PurchaseRequest, QuotationStatus, SupplierMaster } from "../modules/supplyData";
import { approvedBudgetFromContract, demoContract } from "./contracts";
import type { ApprovedBudget, ClientRecord, EacSnapshot } from "./contracts";
import { formatDocNumber } from "./docNumbering";
import { keys } from "./keys";
import { demoMaterials } from "./materials";
import type { MaterialRecord } from "./materials";
import type { StockBin, StockMovement, TransferOrder } from "./stock";
import { writeJson } from "./storage";
import type { OrderLine, TimeEntry, WorkOrder } from "./workOrders";

type SeedResult = { ok: boolean };

type OrderSeed = Pick<WorkOrder, "id" | "type" | "wbs" | "equipment" | "description" | "status" | "projectedHours" | "dueDate"> &
  Partial<WorkOrder>;

function buildOrder(partial: OrderSeed, now: string): WorkOrder {
  const materials: OrderLine[] = partial.materials ?? [];
  return {
    contract: demoContract.code,
    assignees: [{ employeeId: "EMP-001", name: "Camila Rojas" }],
    materials,
    pickingStatus: "Sin picking",
    qualityChecklist: {},
    qualityApproved: false,
    qualityApprovedBy: null,
    statusHistory: [],
    createdAt: now,
    createdBy: "Administrador",
    ...partial,
  };
}

// Genera TODOS los datos demo con numeración nueva; los contadores quedan en el último número usado de cada serie.
// Se invoca desde bootstrapStorage tras un reset de esquema.
export function seedDemoData(now: Date = new Date()): SeedResult {
  const iso = now.toISOString();
  const today = iso.slice(0, 10);
  const plus = (days: number) => new Date(now.getTime() + days * 86400000).toISOString().slice(0, 10);
  const at = (hour: number, minute = 0) => {
    const date = new Date(now);
    date.setHours(hour, minute, 0, 0);
    return date.toISOString();
  };

  const ago = (days: number, hour: number, minute = 0) => {
    const date = new Date(now);
    date.setDate(date.getDate() - days);
    date.setHours(hour, minute, 0, 0);
    return date.toISOString();
  };
  const minutesAgo = (minutes: number) => new Date(now.getTime() - minutes * 60000).toISOString();
  const wbsOf = (code: string, type: string) => `${code}-${type}`;
  const minera = { code: "CT2050", client: "Minera Sur Ltda." };
  const repWbs = "CT1234-CL-B2N4-REP";
  const closedHistory = (date: string) => [{ date, previousStatus: "Cierre provisorio" as const, newStatus: "Cerrada" as const, user: "Supervisor" }];
  const tecnico = { employeeId: "EMP-001", name: "Camila Rojas" };
  const tecnico2 = { employeeId: "EMP-004", name: "Tomás Vera" };
  const diego = { employeeId: "EMP-002", name: "Diego Muñoz" };

  // OT de todos los tipos y estados; contrato CT1234 (Fiat Chile) y CT2050 (Minera Sur).
  const orders: WorkOrder[] = [
    buildOrder({
      id: formatDocNumber("51", 1), type: "PRE", wbs: "CT1234-CL-B2N4-PRE", equipment: "VEH-001 · Camioneta Fiat Ducato",
      description: "Preventivo de 10.000 km · originada por plan PM-VEH-001", planId: "PL-VEH-001", routeId: "HR-VEH-001",
      routeName: "Mantención preventiva vehículo", routeOperations: sampleRoutes[0].operations, projectedHours: 3.5,
      status: "Asignada", dueDate: plus(2), priority: "Media",
      materials: [{ code: "MAT-114", required: 1, picked: 0 }, { code: "MAT-422", required: 1, picked: 0 }],
    }, iso),
    buildOrder({
      id: formatDocNumber("51", 2), type: "PRE", contract: minera.code, wbs: wbsOf(minera.code, "PRE"), equipment: "CAM-010 · Camión tolva Volvo",
      description: "Preventivo de 250 horas de camión tolva", projectedHours: 4, status: "Sin asignar", dueDate: plus(7), priority: "Media",
      assignees: [], materials: [{ code: "MAT-205", required: 2, picked: 0 }],
    }, iso),
    buildOrder({
      id: formatDocNumber("51", 3), type: "PRE", wbs: "CT1234-CL-B2N4-PRE", equipment: "VEH-002 · Fiat Fiorino",
      description: "Preventivo de 5.000 km", projectedHours: 3, status: "Cerrada", dueDate: plus(-20), priority: "Baja",
      pickingStatus: "Picking completo", qualityApproved: true, qualityApprovedBy: "Calidad", qualityApprovedAt: ago(20, 15),
      closedAt: ago(20, 16), closedBy: "Supervisor", statusHistory: closedHistory(ago(20, 16)), createdAt: ago(30, 9),
      materials: [{ code: "MAT-114", required: 2, picked: 2, unitCostAvg: 3500 }],
    }, iso),
    buildOrder({
      id: formatDocNumber("61", 1), type: "COR", wbs: "CT1234-CL-B2N4-COR", equipment: "VEH-002 · Fiat Fiorino",
      description: "Reparación sistema de frenos", projectedHours: 5, status: "Cierre provisorio", dueDate: today, priority: "Alta",
      assignees: [diego], pickingStatus: "Picking parcial",
      materials: [{ code: "MAT-422", required: 2, picked: 1, unitCostAvg: 7800 }],
    }, iso),
    buildOrder({
      id: formatDocNumber("61", 2), type: "COR", wbs: "CT1234-CL-B2N4-COR", equipment: "VEH-003 · Fiat Ducato",
      description: "Cambio de motor eléctrico del compresor (faltante de stock)", projectedHours: 8, status: "En ejecución", dueDate: plus(1),
      priority: "Alta", assignees: [tecnico2], materials: [{ code: "MAT-301", required: 30, picked: 0 }],
    }, iso),
    buildOrder({
      id: formatDocNumber("61", 3), type: "COR", contract: minera.code, wbs: wbsOf(minera.code, "COR"), equipment: "CAM-011 · Camión tolva Volvo",
      description: "Falla de sistema eléctrico (vencida)", projectedHours: 6, status: "Asignada", dueDate: plus(-3), priority: "Alta",
      pickingStatus: "Picking parcial", materials: [{ code: "MAT-114", required: 6, picked: 2, unitCostAvg: 3500 }],
    }, iso),
    buildOrder({
      id: formatDocNumber("61", 4), type: "COR", contract: minera.code, wbs: wbsOf(minera.code, "COR"), equipment: "CAM-010 · Camión tolva Volvo",
      description: "Cambio de rodamiento de rueda", projectedHours: 4, status: "Cerrada", dueDate: plus(-9), priority: "Media",
      pickingStatus: "Picking completo", qualityApproved: true, qualityApprovedBy: "Calidad", qualityApprovedAt: ago(7, 16),
      closedAt: ago(7, 17), closedBy: "Supervisor", statusHistory: closedHistory(ago(7, 17)), createdAt: ago(12, 9),
      materials: [{ code: "MAT-422", required: 1, picked: 1, unitCostAvg: 7800 }],
    }, iso),
    buildOrder({
      id: formatDocNumber("71", 1), type: "OVH", wbs: "CT1234-CL-B2N4-OVH", equipment: "VEH-003 · Fiat Ducato",
      description: "Overhaul de conjunto de transmisión", projectedHours: 16, status: "Asignada", dueDate: plus(3), priority: "Media",
      materials: [{ code: "MAT-301", required: 1, picked: 0 }],
    }, iso),
    buildOrder({
      id: formatDocNumber("71", 2), type: "OVH", wbs: "CT1234-CL-B2N4-OVH", equipment: "VEH-001 · Camioneta Fiat Ducato",
      description: "Overhaul de motor diésel", projectedHours: 40, status: "En ejecución", dueDate: plus(10), priority: "Media",
      assignees: [tecnico2], pickingStatus: "Picking parcial", materials: [{ code: "MAT-422", required: 6, picked: 3, unitCostAvg: 7800 }],
    }, iso),
    buildOrder({
      id: formatDocNumber("81", 1), type: "GAR", wbs: "CT1234-CL-B2N4-GAR", equipment: "VEH-001 · Camioneta Fiat Ducato",
      description: "Reclamo de garantía por falla de alternador", projectedHours: 2, status: "Asignada", dueDate: plus(5), priority: "Baja",
    }, iso),
    buildOrder({
      id: formatDocNumber("81", 2), type: "GAR", contract: minera.code, wbs: wbsOf(minera.code, "GAR"), equipment: "CAM-011 · Camión tolva Volvo",
      description: "Garantía de bomba hidráulica", projectedHours: 3, status: "Sin asignar", dueDate: plus(4), priority: "Media", assignees: [],
    }, iso),
    buildOrder({
      id: formatDocNumber("91", 1), type: "REP", wbs: repWbs, equipment: "VEH-002 · Fiat Fiorino",
      description: "Reparación de carrocería y sistema eléctrico (material por ubicar)", projectedHours: 6, status: "Asignada", dueDate: plus(2),
      priority: "Media", assignees: [tecnico], materials: [{ code: "MAT-114", required: 12, picked: 0 }],
    }, iso),
    buildOrder({
      // Q2: ESPERA usa la serie 13.
      id: formatDocNumber("13", 1), type: "ESPERA", wbs: "CT1234-CL-B2N4-IND", equipment: "Centro de trabajo · Taller",
      description: "Orden de espera para registrar tiempo no productivo", projectedHours: 0, status: "Asignada", dueDate: today,
    }, iso),
    buildOrder({
      id: formatDocNumber("13", 2), type: "ESPERA", contract: minera.code, wbs: wbsOf(minera.code, "IND"), equipment: "Faena · Minera Sur",
      description: "Espera por permiso de ingreso a faena", projectedHours: 0, status: "En ejecución", dueDate: today, assignees: [tecnico2],
    }, iso),
  ];
  const orderById = (id: string) => orders.find((order) => order.id === id) as WorkOrder;
  const entry = (n: number, orderId: string, who: { employeeId: string; name: string }, op: number, name: string,
    start: string, end: string | null, rate: number): TimeEntry => {
    const order = orderById(orderId);
    return { id: `TE-DEMO-${n}`, orderId, orderType: order.type, wbs: order.wbs, operationOrder: op, operationName: name,
      employeeId: who.employeeId, employeeName: who.name, start, end, hourlyRate: rate };
  };
  const timeEntries: TimeEntry[] = [
    // Hoy
    entry(1, formatDocNumber("51", 1), tecnico, 10, "Inspección de cableado y aislación", at(8), at(10), 18000),
    entry(2, formatDocNumber("61", 1), diego, 10, "Diagnóstico de frenos", at(9, 30), at(12), 20500),
    entry(3, formatDocNumber("13", 1), tecnico, 0, "Espera", at(10, 30), at(11, 15), 18000),
    entry(4, formatDocNumber("61", 2), tecnico2, 10, "Desmontaje de motor", minutesAgo(90), null, 16500),
    entry(5, formatDocNumber("71", 2), tecnico2, 10, "Desarme de culata", at(6, 0), at(7, 30), 16500),
    // Días anteriores
    entry(6, formatDocNumber("61", 3), tecnico, 10, "Diagnóstico eléctrico", ago(1, 8), ago(1, 12), 18000),
    entry(7, formatDocNumber("71", 2), tecnico2, 20, "Medición de tolerancias", ago(1, 9), ago(1, 13, 30), 16500),
    entry(8, formatDocNumber("13", 1), tecnico, 0, "Espera", ago(1, 14), ago(1, 14, 45), 18000),
    entry(9, formatDocNumber("71", 2), tecnico2, 10, "Desarme de bloque", ago(2, 8), ago(2, 17), 16500),
    entry(10, formatDocNumber("61", 3), tecnico, 20, "Reemplazo de cableado", ago(2, 8, 30), ago(2, 15), 18000),
    entry(11, formatDocNumber("13", 2), tecnico2, 0, "Espera", ago(3, 10), ago(3, 11, 30), 16500),
    entry(12, formatDocNumber("71", 2), tecnico2, 10, "Limpieza de piezas", ago(3, 8), ago(3, 16), 16500),
    entry(13, formatDocNumber("61", 4), tecnico, 10, "Cambio de rodamiento", ago(9, 8), ago(9, 12), 18000),
    entry(14, formatDocNumber("61", 4), tecnico2, 20, "Prueba de rodaje", ago(8, 9), ago(8, 13), 16500),
    entry(15, formatDocNumber("51", 3), tecnico, 10, "Servicio preventivo", ago(23, 8), ago(23, 11), 18000),
  ];

  const po = (n: number) => formatDocNumber("31", n);
  const sp = (n: number) => formatDocNumber("21", n);
  const tr1 = formatDocNumber("32", 1);
  const tr2 = formatDocNumber("32", 2);
  const [po1, po2, po3, po4, po5, po6] = [po(1), po(2), po(3), po(4), po(5), po(6)];
  const [sp1, sp2, sp3, sp4, sp5, sp6, sp7] = [sp(1), sp(2), sp(3), sp(4), sp(5), sp(6), sp(7)];
  const ctFiat = demoContract.code;

  // Materiales con y sin inspección; MAT-205 y MAT-310 quedan bajo el punto de reorden.
  const extraMaterials: MaterialRecord[] = [
    { code: "MAT-205", name: "Filtro de aceite", unit: "unidad", category: "Mecánico", minStock: 20, reorderPoint: 30, leadTimeDays: 10, incoterm: "DAP", minLot: 10, requiresInspection: false },
    { code: "MAT-310", name: "Contactor tripolar 40A", unit: "unidad", category: "Eléctrico", minStock: 5, reorderPoint: 8, leadTimeDays: 20, incoterm: "FCA", minLot: 2, requiresInspection: true },
  ];
  const bin = (id: string, code: string, name: string, unit: string, unitCost: number, warehouse: string, location: string,
    status: StockBin["status"], quantity: number, reference?: string): StockBin =>
    ({ id, code, name, warehouse, location, status, quantity, reserved: 0, unit, unitCost, ...(reference ? { reference } : {}) });

  const bins: StockBin[] = [
    { id: "BIN-01", code: "MAT-114", name: "Cinta aislante 3M", warehouse: "Bodega Central", location: "A-01-02", status: "Libre utilización", quantity: 9, reserved: 0, unit: "rollo", unitCost: 3500 },
    { id: "BIN-02", code: "MAT-114", name: "Cinta aislante 3M", warehouse: "Bodega Central", location: "A-02-01", status: "Bloqueado calidad", quantity: 5, reserved: 0, unit: "rollo", unitCost: 3500 },
    { id: "BIN-03", code: "MAT-114", name: "Cinta aislante 3M", warehouse: "Recepciones", location: "TRANSITO", status: "En tránsito", quantity: 12, reserved: 0, unit: "rollo", unitCost: 3500, reference: po1 },
    { id: "BIN-04", code: "MAT-422", name: "Rodamiento SKF 6205", warehouse: "Bodega Central", location: "B-01-01", status: "Libre utilización", quantity: 42, reserved: 0, unit: "unidad", unitCost: 7800 },
    { id: "BIN-05", code: "MAT-301", name: "Motor eléctrico 7.5HP", warehouse: "Bodega Central", location: "C-01-03", status: "Libre utilización", quantity: 18, reserved: 0, unit: "unidad", unitCost: 285000 },
    { id: "BIN-06", code: "MAT-422", name: "Rodamiento SKF 6205", warehouse: "Bodega Taller", location: "B-02-01", status: "Libre utilización", quantity: 12, reserved: 0, unit: "unidad", unitCost: 7800 },
    { id: "BIN-07", code: "MAT-422", name: "Rodamiento SKF 6205", warehouse: "Recepciones", location: "TRANSITO", status: "En tránsito", quantity: 8, reserved: 0, unit: "unidad", unitCost: 7800, reference: po2 },
    { id: "BIN-08", code: "MAT-114", name: "Cinta aislante 3M", warehouse: "Bodega Taller", location: "TRANSITO", status: "En tránsito", quantity: 4, reserved: 0, unit: "rollo", unitCost: 3500, reference: tr1 },
    bin("BIN-09", "MAT-114", "Cinta aislante 3M", "rollo", 3500, "Bodega Central", "REC-UBICAR", "Libre utilización", 6),
    bin("BIN-10", "MAT-422", "Rodamiento SKF 6205", "unidad", 7800, "Bodega Central", "REC-CALIDAD", "Bloqueado calidad", 10),
    bin("BIN-11", "MAT-205", "Filtro de aceite", "unidad", 9500, "Bodega Taller", "D-01-01", "Libre utilización", 14),
    bin("BIN-12", "MAT-205", "Filtro de aceite", "unidad", 9500, "Bodega Central", "REC-UBICAR", "Libre utilización", 12),
    bin("BIN-13", "MAT-205", "Filtro de aceite", "unidad", 9500, "Recepciones", "TRANSITO", "En tránsito", 18, po5),
    bin("BIN-14", "MAT-310", "Contactor tripolar 40A", "unidad", 42000, "Bodega Central", "C-02-01", "Libre utilización", 3),
    bin("BIN-15", "MAT-422", "Rodamiento SKF 6205", "unidad", 7800, "Bodega Mina Sur", "M-01-01", "Libre utilización", 6),
    bin("BIN-16", "MAT-301", "Motor eléctrico 7.5HP", "unidad", 285000, "Bodega Mina Sur", "M-01-02", "Libre utilización", 2),
  ];

  const mov = (n: number, date: string, type: StockMovement["type"], code: string, quantity: number, from: string, to: string,
    reference: string, extra: Partial<StockMovement> = {}): StockMovement =>
    ({ id: `MOV-DEMO-${n}`, date, type, code, quantity, from, to, reference, user: "Almacén", ...extra });
  const pick = (n: number, date: string, orderId: string, code: string, quantity: number, unitCost: number): StockMovement =>
    mov(n, date, "Salida picking OT", code, quantity, "Bodega Central", "OT", orderId,
      { orderId, orderType: orderById(orderId).type, wbs: orderById(orderId).wbs, unitCost });
  const movements: StockMovement[] = [
    pick(1, ago(20, 10), formatDocNumber("51", 3), "MAT-114", 2, 3500),
    pick(2, ago(7, 11), formatDocNumber("61", 4), "MAT-422", 1, 7800),
    pick(3, ago(1, 9), formatDocNumber("61", 3), "MAT-114", 2, 3500),
    pick(4, ago(1, 10), formatDocNumber("71", 2), "MAT-422", 3, 7800),
    pick(5, minutesAgo(180), formatDocNumber("61", 1), "MAT-422", 1, 7800),
    mov(6, ago(2, 9), "Recepción OC", "MAT-205", 12, "Proveedor", "REC-UBICAR", po5),
    mov(7, ago(5, 10), "Traspaso emitido", "MAT-422", 10, "Bodega Central", "TRANSITO", tr2, { transferId: tr2, unitCost: 7800 }),
    mov(8, ago(4, 10), "Traspaso recibido", "MAT-422", 8, "TRANSITO", "Bodega Taller", tr2, { transferId: tr2, unitCost: 7800 }),
    mov(9, ago(4, 10, 5), "Diferencia traspaso", "MAT-422", 2, "TRANSITO", "Ajuste", tr2, { transferId: tr2, unitCost: 7800 }),
  ];
  const transfers: TransferOrder[] = [{
    id: tr1, createdAt: iso, createdBy: "Almacén", fromWarehouse: "Bodega Central", toWarehouse: "Bodega Taller", status: "En tránsito", toQuality: false,
    lines: [{ code: "MAT-114", name: "Cinta aislante 3M", unit: "rollo", unitCost: 3500, sent: 4 }],
  }, {
    id: tr2, createdAt: ago(5, 10), createdBy: "Almacén", fromWarehouse: "Bodega Central", toWarehouse: "Bodega Taller", status: "Recibido con diferencia",
    toQuality: false, receivedAt: ago(4, 10), receivedBy: "Almacén",
    lines: [{ code: "MAT-422", name: "Rodamiento SKF 6205", unit: "unidad", unitCost: 7800, sent: 10, received: 8 }],
  }];

  const quote = (id: string, supplier: string, unitCost: number, expectedDate: string, status: QuotationStatus): PurchaseQuote =>
    ({ id, supplier, unitCost, expectedDate, status, paymentTerms: "30 días" });
  const suppliers: SupplierMaster[] = ["Proveedor Demo", "Rodamientos del Pacífico", "Eléctrica Santiago Ltda.", "Lubricantes Andes S.A."]
    .map((name, index) => ({ id: `PROV-DEMO-${index + 1}`, name }));
  const order = (id: string, requestId: string, code: string, name: string, unit: string, quantity: number, supplier: string, unitCost: number,
    expectedDate: string, contract: string, wbs: string, status: PurchaseOrder["status"], extra: Partial<PurchaseOrder> = {}): PurchaseOrder =>
    ({ id, requestId, materialCode: code, materialName: name, unit, quantity, supplier, unitCost, expectedDate, contract, wbs, status, ...extra });
  const purchaseOrders: PurchaseOrder[] = [
    order(po1, sp1, "MAT-114", "Cinta aislante 3M", "rollo", 12, "Proveedor Demo", 3500, plus(4), ctFiat, "CT1234-CL-B2N4-COR", "Aprobada", { approvedBy: "PM Proyecto" }),
    order(po2, sp1, "MAT-422", "Rodamiento SKF 6205", "unidad", 8, "Proveedor Demo", 7800, plus(6), ctFiat, "CT1234-CL-B2N4-COR", "Aprobada", { approvedBy: "PM Proyecto" }),
    order(po3, sp2, "MAT-310", "Contactor tripolar 40A", "unidad", 4, "Eléctrica Santiago Ltda.", 42000, plus(15), ctFiat, "CT1234-CL-B2N4-OVH", "Pendiente aprobación",
      { createdBy: "Compras", selectedQuoteId: "COT-DEMO-1", winningQuoteId: "COT-DEMO-1" }),
    order(po4, sp3, "MAT-205", "Filtro de aceite", "unidad", 20, "Lubricantes Andes S.A.", 9900, plus(12), minera.code, wbsOf(minera.code, "COR"), "Rechazada",
      { createdBy: "Compras", approvedBy: "PM Proyecto" }),
    order(po5, sp4, "MAT-205", "Filtro de aceite", "unidad", 30, "Lubricantes Andes S.A.", 9500, plus(3), minera.code, wbsOf(minera.code, "PRE"), "Aprobada",
      { receivedQuantity: 12, approvedBy: "PM Proyecto", createdBy: "Compras" }),
    order(po6, sp5, "MAT-422", "Rodamiento SKF 6205", "unidad", 10, "Rodamientos del Pacífico", 7600, plus(-6), minera.code, wbsOf(minera.code, "PRE"), "Recepcionada",
      { receivedQuantity: 10, approvedBy: "PM Proyecto", createdBy: "Compras" }),
  ];
  const request = (id: string, code: string, name: string, unit: string, quantity: number, needDate: string, status: PurchaseRequest["status"],
    extra: Partial<PurchaseRequest> = {}): PurchaseRequest =>
    ({ id, materialCode: code, materialName: name, unit, quantity, needDate, callIds: [], status, createdBy: "Planificador", ...extra });
  const purchaseRequests: PurchaseRequest[] = [
    request(sp1, "MAT-114", "Cinta aislante 3M", "rollo", 12, plus(7), "OC aprobada", { purchaseOrderId: po1, contract: ctFiat, wbs: "CT1234-CL-B2N4-COR" }),
    request(sp2, "MAT-310", "Contactor tripolar 40A", "unidad", 4, plus(20), "OC pendiente aprobación", {
      purchaseOrderId: po3, contract: ctFiat, wbs: "CT1234-CL-B2N4-OVH", supplier: "Eléctrica Santiago Ltda.", quotedUnitCost: 42000,
      quotes: [quote("COT-DEMO-1", "Eléctrica Santiago Ltda.", 42000, plus(15), "Ganadora"), quote("COT-DEMO-2", "Proveedor Demo", 44500, plus(18), "Rechazada"),
        quote("COT-DEMO-3", "Rodamientos del Pacífico", 46000, plus(25), "Rechazada")],
    }),
    request(sp3, "MAT-205", "Filtro de aceite", "unidad", 20, plus(14), "Cotización en curso", {
      contract: minera.code, wbs: wbsOf(minera.code, "COR"),
      quotes: [quote("COT-DEMO-4", "Lubricantes Andes S.A.", 9900, plus(12), "Pendiente"), quote("COT-DEMO-5", "Proveedor Demo", 10400, plus(10), "Pendiente"),
        quote("COT-DEMO-6", "Rodamientos del Pacífico", 11000, plus(9), "Pendiente")],
    }),
    request(sp4, "MAT-205", "Filtro de aceite", "unidad", 30, plus(5), "OC aprobada", { purchaseOrderId: po5, contract: minera.code, wbs: wbsOf(minera.code, "PRE") }),
    request(sp5, "MAT-422", "Rodamiento SKF 6205", "unidad", 10, plus(-8), "Cerrada", { purchaseOrderId: po6, contract: minera.code, wbs: wbsOf(minera.code, "PRE") }),
    request(sp6, "MAT-114", "Cinta aislante 3M", "rollo", 20, plus(10), "Pendiente cotización", { contract: ctFiat, wbs: "CT1234-CL-B2N4-PRE" }),
    request(sp7, "MAT-422", "Rodamiento SKF 6205", "unidad", 30, plus(12), "Cotización en curso", { contract: ctFiat, wbs: "CT1234-CL-B2N4-OVH" }),
  ];
  const awards: AwardHistory[] = [{
    id: "ADJ-DEMO-1", requestId: sp2, materialCode: "MAT-310", materialName: "Contactor tripolar 40A", quantity: 4, unit: "unidad",
    winningQuoteId: "COT-DEMO-1", supplier: "Eléctrica Santiago Ltda.", unitCost: 42000, awardedDate: today, expectedDate: plus(15), purchaseOrderId: po3,
  }];

  // Contratos: CT1234 (Fiat Chile, demo) y CT2050 (Minera Sur); WBS únicos globales con formato contrato-tipo.
  const budgets: ApprovedBudget[] = [
    ...approvedBudgetFromContract(demoContract, iso),
    ...(["PRE", "COR", "GAR"] as const).map((category, index): ApprovedBudget =>
      ({ contract: minera.code, category, amount: [1200000, 2000000, 600000][index], version: 1, approvedBy: "PM Proyecto", approvedAt: iso })),
  ];
  const baseClient = (index: number, name: string, sector: string): ClientRecord =>
    ({ id: `CLI-demo-${index}`, code: `CLI-00000${index}`, name, sector, status: "Activo", contracts: [], createdAt: iso });
  const demoClient = baseClient(4, demoContract.customer, "Transporte");
  demoClient.contracts = [{
    id: "CTR-demo-1", code: demoContract.code, name: demoContract.description, clientId: demoClient.id,
    startDate: demoContract.startDate ?? "", endDate: demoContract.endDate ?? "",
    budget: demoContract.wbs.reduce((sum, element) => sum + element.budget, 0), createdAt: iso,
    wbs: demoContract.wbs.map((element, position) => ({
      id: `WBS-demo-${position}`, code: element.code, type: element.type, description: element.description,
    })),
  }];
  const mineraClient = baseClient(2, minera.client, "Minería");
  mineraClient.contracts = [{
    id: "CTR-demo-2", code: minera.code, name: "Mantenimiento de flota minera", clientId: mineraClient.id,
    startDate: plus(-300), endDate: plus(400), budget: 3800000, createdAt: iso,
    wbs: (["PRE", "COR", "GAR", "IND"] as const).map((type, position) => ({
      id: `WBS-demo-m${position}`, code: wbsOf(minera.code, type), type,
      description: { PRE: "Preventivo", COR: "Correctivo", GAR: "Garantías", IND: "Tiempo improductivo" }[type],
    })),
  }];
  const clients: ClientRecord[] = [
    baseClient(1, "Comercial Aconcagua", "Retail"),
    mineraClient,
    baseClient(3, "Maderas del Valle", "Manufactura"),
    demoClient,
  ];

  // Facturas con WBS (compra), una con OC (no cuenta doble en el EAC) y una de venta.
  const invoice = (id: string, kind: FinanceInvoice["kind"], number: string, counterparty: string, daysAgo: number, net: number,
    status: FinanceInvoice["status"], extra: Partial<FinanceInvoice> = {}): FinanceInvoice => ({
    id, kind, documentType: kind === "Compra" ? "Factura afecta" : "Factura de venta", number, counterparty,
    issueDate: ago(daysAgo, 12).slice(0, 10), dueDate: ago(daysAgo - 30, 12).slice(0, 10), currency: "CLP", exchangeRate: 1,
    netAmount: net, vatAmount: Math.round(net * 0.19), totalAmount: Math.round(net * 1.19), totalClp: Math.round(net * 1.19),
    accountCode: kind === "Compra" ? "510201" : "410101", status, ...extra,
  });
  const invoices: FinanceInvoice[] = [
    invoice("FAC-DEMO-1", "Compra", "10045", "Grúas y Transportes Ltda.", 12, 450000, "Contabilizada", { contract: ctFiat, wbs: "CT1234-CL-B2N4-COR" }),
    invoice("FAC-DEMO-2", "Compra", "20311", "Soldaduras del Sur", 18, 280000, "Pagada",
      { contract: minera.code, wbs: wbsOf(minera.code, "COR"), paymentDate: ago(5, 12).slice(0, 10), paymentReference: "TRF-0455" }),
    invoice("FAC-DEMO-3", "Compra", "30977", "Rodamientos del Pacífico", 6, 76000, "Contabilizada",
      { contract: minera.code, wbs: wbsOf(minera.code, "PRE"), purchaseOrder: po6 }),
    invoice("FAC-DEMO-4", "Compra", "10102", "Servicios de Pintura Austral", 2, 190000, "Borrador", { contract: ctFiat, wbs: repWbs }),
    invoice("FAC-DEMO-5", "Venta", "1001", "Fiat Chile", 10, 3200000, "Emitida (demo)", { contract: ctFiat }),
  ];
  const payrollAccounts: FinanceAccount[] = [
    { code: "510301", name: "Gastos de remuneraciones", type: "Gasto" },
    { code: "210301", name: "Remuneraciones por pagar", type: "Pasivo" },
    { code: "210302", name: "Descuentos previsionales por pagar", type: "Pasivo" },
  ];
  const accounts = [...defaultAccounts, ...payrollAccounts];
  const jl = (code: string, debit: number, credit: number) => ({ accountCode: code, accountName: accounts.find((item) => item.code === code)?.name ?? code, debit, credit });
  const entries: JournalEntry[] = [];
  const post = (date: string, description: string, sourceId: string, lines: JournalEntry["lines"]) =>
    entries.push({ id: `ASI-DEMO-${entries.length + 1}`, date, description, sourceId, lines });
  for (const item of invoices.filter((value) => value.status !== "Borrador")) {
    if (item.kind === "Venta") {
      post(item.issueDate, `Factura de venta ${item.number}`, item.id, [jl("110201", item.totalAmount, 0), jl("410101", 0, item.netAmount), jl("210201", 0, item.vatAmount)]);
      continue;
    }
    post(item.issueDate, `Factura de compra ${item.number}`, item.id, [jl("510201", item.netAmount, 0), jl("110301", item.vatAmount, 0), jl("210101", 0, item.totalAmount)]);
    if (item.status === "Pagada") post(item.paymentDate ?? today, `Pago factura ${item.number}`, item.id, [jl("210101", item.totalAmount, 0), jl("110101", 0, item.totalAmount)]);
  }

  // Nómina: mes anterior pagada y mes en curso pendiente de pago.
  const monthOf = (offset: number) => {
    const date = new Date(now.getFullYear(), now.getMonth() + offset, 1);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
  };
  const staff: [string, string, number, boolean][] = [["EMP-001", "Camila Rojas", 1100000, true], ["EMP-002", "Diego Muñoz", 1450000, false],
    ["EMP-004", "Tomás Vera", 1050000, true], ["EMP-003", "Paula Soto", 1250000, false]];
  const payrollLines = (): PayrollRun["lines"] => staff.map(([employeeId, employee, gross, direct]) => ({
    employeeId, employee, gross, deductions: Math.round(gross * 0.2), net: gross - Math.round(gross * 0.2),
    allocations: direct ? [{ contract: ctFiat, amount: gross }] : [{ contract: ctFiat, amount: Math.round(gross / 2) }, { contract: minera.code, amount: gross - Math.round(gross / 2) }],
  }));
  const payrollRun = (period: string, status: PayrollRun["status"], createdAt: string): PayrollRun => {
    const lines = payrollLines();
    const sum = (value: (item: PayrollRun["lines"][number]) => number) => lines.reduce((total, item) => total + value(item), 0);
    return { id: `NOM-${period}`, period, createdAt, status, lines, gross: sum((item) => item.gross), deductions: sum((item) => item.deductions), net: sum((item) => item.net) };
  };
  const paidRun = payrollRun(monthOf(-1), "Pagada", ago(15, 10));
  const pendingRun = payrollRun(monthOf(0), "Pendiente de pago", iso);
  for (const run of [paidRun, pendingRun]) {
    post(run.createdAt.slice(0, 10), `Devengo de remuneraciones ${run.period}`, run.id, [jl("510301", run.gross, 0), jl("210302", 0, run.deductions), jl("210301", 0, run.net)]);
  }
  const payDate = ago(10, 12).slice(0, 10);
  post(payDate, `Pago de nómina ${paidRun.period} · TRF-NOM-01`, paidRun.id, [jl("210301", paidRun.net, 0), jl("110101", 0, paidRun.net)]);
  const payrollPayments = [{ runId: paidRun.id, period: paidRun.period, date: payDate, amount: paidRun.net, reference: "TRF-NOM-01" }];

  // Snapshot cerrado del mes anterior para que el EAC muestre la variación.
  const snap = (contract: string, category: string, real: number, etc: number): EacSnapshot =>
    ({ contract, period: monthOf(-1), category, real, etc, eac: real + etc, savedAt: ago(8, 18), closed: true, closedBy: "PM Proyecto" });
  const snapshots: EacSnapshot[] = [
    snap(ctFiat, "OVH", 3200000, 3000000), snap(ctFiat, "PRE", 1100000, 800000), snap(ctFiat, "COR", 1400000, 1200000),
    snap(ctFiat, "GAR", 300000, 400000), snap(ctFiat, "Otros", 600000, 900000),
    snap(minera.code, "OVH", 0, 0), snap(minera.code, "PRE", 350000, 550000), snap(minera.code, "COR", 700000, 800000),
    snap(minera.code, "GAR", 0, 150000), snap(minera.code, "Otros", 120000, 0),
    snap("Fuera de contrato", "Otros", 0, 0),
  ];

  // Planes con llamadas futuras (el Planificador las ve en Planning y Supply).
  const plans: MaintenancePlan[] = [
    { ...samplePlans[0], startDate: today },
    { ...samplePlans[0], id: "PL-MIN-001", name: "Preventivo mensual camión tolva", equipmentId: "CAM-010", contract: minera.code,
      wbs: wbsOf(minera.code, "PRE"), triggerType: "calendar", calendarInterval: 1, calendarUnit: "months", startDate: today, horizonMonths: 6 },
  ];

  const writes: [string, unknown][] = [
    [keys.materialMaster, [...demoMaterials, ...extraMaterials]],
    [keys.workOrders, orders],
    [keys.timeEntries, timeEntries],
    [keys.warehouseBins, bins],
    [keys.warehouseMovements, movements],
    [keys.transferOrders, transfers],
    [keys.purchaseOrders, purchaseOrders],
    [keys.purchaseRequests, purchaseRequests],
    [keys.suppliers, suppliers],
    [keys.quotations, awards],
    [keys.clients, clients],
    [keys.approvedBudget, budgets],
    [keys.eacSnapshots, snapshots],
    [keys.maintenanceRoutes, sampleRoutes],
    [keys.maintenancePlans, plans],
    [keys.financeState, { invoices, entries, accounts }],
    [keys.payrollRuns, [paidRun, pendingRun]],
    [keys.payrollPayments, payrollPayments],
    [keys.docCounters, { "51": 3, "61": 4, "71": 2, "81": 2, "91": 1, "13": 2, "21": 7, "31": 6, "32": 2 }],
  ];
  return { ok: writes.every(([key, value]) => writeJson(key, value)) };
}
