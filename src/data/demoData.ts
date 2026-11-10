import { sampleRoutes } from "../modules/maintenanceData";
import type { PurchaseOrder, PurchaseRequest } from "../modules/supplyData";
import { approvedBudgetFromContract, demoContract } from "./contracts";
import type { ApprovedBudget } from "./contracts";
import { formatDocNumber } from "./docNumbering";
import { keys } from "./keys";
import { demoMaterials } from "./materials";
import type { StockBin, TransferOrder } from "./stock";
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

  const orders: WorkOrder[] = [
    buildOrder({
      id: formatDocNumber("51", 1), type: "PRE", wbs: "CT1234-CL-B2N4-PRE", equipment: "VEH-001 · Camioneta Fiat Ducato",
      description: "Preventivo de 10.000 km · originada por plan PM-VEH-001", planId: "PL-VEH-001", routeId: "HR-VEH-001",
      routeName: "Mantención preventiva vehículo", routeOperations: sampleRoutes[0].operations, projectedHours: 3.5,
      status: "Asignada", dueDate: plus(2), priority: "Media",
      materials: [{ code: "MAT-114", required: 1, picked: 0 }, { code: "MAT-422", required: 1, picked: 0 }],
    }, iso),
    buildOrder({
      id: formatDocNumber("61", 1), type: "COR", wbs: "CT1234-CL-B2N4-COR", equipment: "VEH-002 · Fiat Fiorino",
      description: "Reparación sistema de frenos", projectedHours: 5, status: "Cierre provisorio", dueDate: today, priority: "Alta",
      assignees: [{ employeeId: "EMP-002", name: "Diego Muñoz" }], pickingStatus: "Picking parcial",
      materials: [{ code: "MAT-422", required: 2, picked: 1, unitCostAvg: 7800 }],
    }, iso),
    buildOrder({
      id: formatDocNumber("71", 1), type: "OVH", wbs: "CT1234-CL-B2N4-OVH", equipment: "VEH-003 · Fiat Ducato",
      description: "Overhaul de conjunto de transmisión", projectedHours: 16, status: "Asignada", dueDate: plus(3), priority: "Media",
      materials: [{ code: "MAT-301", required: 1, picked: 0 }],
    }, iso),
    buildOrder({
      id: formatDocNumber("81", 1), type: "GAR", wbs: "CT1234-CL-B2N4-GAR", equipment: "VEH-001 · Camioneta Fiat Ducato",
      description: "Reclamo de garantía por falla de alternador", projectedHours: 2, status: "Asignada", dueDate: plus(5), priority: "Baja",
    }, iso),
    buildOrder({
      // Q2: ESPERA usa la serie 13.
      id: formatDocNumber("13", 1), type: "ESPERA", wbs: "CT1234-CL-B2N4-IND", equipment: "Centro de trabajo · Taller",
      description: "Orden de espera para registrar tiempo no productivo", projectedHours: 0, status: "Asignada", dueDate: today,
    }, iso),
  ];

  const timeEntries: TimeEntry[] = [
    { id: "TE-DEMO-1", orderId: orders[0].id, orderType: "PRE", wbs: orders[0].wbs, operationOrder: 10, operationName: "Inspección de cableado y aislación", employeeId: "EMP-001", employeeName: "Camila Rojas", start: at(8), end: at(10), hourlyRate: 18000 },
    { id: "TE-DEMO-2", orderId: orders[1].id, orderType: "COR", wbs: orders[1].wbs, operationOrder: 10, operationName: "Diagnóstico de frenos", employeeId: "EMP-002", employeeName: "Diego Muñoz", start: at(9, 30), end: at(12), hourlyRate: 20500 },
    { id: "TE-DEMO-3", orderId: orders[4].id, orderType: "ESPERA", wbs: orders[4].wbs, operationOrder: 0, operationName: "Espera", employeeId: "EMP-001", employeeName: "Camila Rojas", start: at(10, 30), end: at(11, 15), hourlyRate: 18000 },
  ];

  const po1 = formatDocNumber("31", 1);
  const po2 = formatDocNumber("31", 2);
  const sp1 = formatDocNumber("21", 1);
  const tr1 = formatDocNumber("32", 1);

  const bins: StockBin[] = [
    { id: "BIN-01", code: "MAT-114", name: "Cinta aislante 3M", warehouse: "Bodega Central", location: "A-01-02", status: "Libre utilización", quantity: 9, reserved: 0, unit: "rollo", unitCost: 3500 },
    { id: "BIN-02", code: "MAT-114", name: "Cinta aislante 3M", warehouse: "Bodega Central", location: "A-02-01", status: "Bloqueado calidad", quantity: 5, reserved: 0, unit: "rollo", unitCost: 3500 },
    { id: "BIN-03", code: "MAT-114", name: "Cinta aislante 3M", warehouse: "Recepciones", location: "TRANSITO", status: "En tránsito", quantity: 12, reserved: 0, unit: "rollo", unitCost: 3500, reference: po1 },
    { id: "BIN-04", code: "MAT-422", name: "Rodamiento SKF 6205", warehouse: "Bodega Central", location: "B-01-01", status: "Libre utilización", quantity: 42, reserved: 0, unit: "unidad", unitCost: 7800 },
    { id: "BIN-05", code: "MAT-301", name: "Motor eléctrico 7.5HP", warehouse: "Bodega Central", location: "C-01-03", status: "Libre utilización", quantity: 18, reserved: 0, unit: "unidad", unitCost: 285000 },
    { id: "BIN-06", code: "MAT-422", name: "Rodamiento SKF 6205", warehouse: "Bodega Taller", location: "B-02-01", status: "Libre utilización", quantity: 12, reserved: 0, unit: "unidad", unitCost: 7800 },
    { id: "BIN-07", code: "MAT-422", name: "Rodamiento SKF 6205", warehouse: "Recepciones", location: "TRANSITO", status: "En tránsito", quantity: 8, reserved: 0, unit: "unidad", unitCost: 7800, reference: po2 },
    { id: "BIN-08", code: "MAT-114", name: "Cinta aislante 3M", warehouse: "Bodega Taller", location: "TRANSITO", status: "En tránsito", quantity: 4, reserved: 0, unit: "rollo", unitCost: 3500, reference: tr1 },
  ];

  const purchaseOrders: PurchaseOrder[] = [
    { id: po1, requestId: sp1, materialCode: "MAT-114", materialName: "Cinta aislante 3M", unit: "rollo", quantity: 12, supplier: "Proveedor Demo", unitCost: 3500, expectedDate: plus(4), status: "Aprobada", approvedBy: "PM Proyecto" },
    { id: po2, requestId: sp1, materialCode: "MAT-422", materialName: "Rodamiento SKF 6205", unit: "unidad", quantity: 8, supplier: "Proveedor Demo", unitCost: 7800, expectedDate: plus(6), status: "Aprobada", approvedBy: "PM Proyecto" },
  ];
  const purchaseRequests: PurchaseRequest[] = [
    { id: sp1, materialCode: "MAT-114", materialName: "Cinta aislante 3M", unit: "rollo", quantity: 12, needDate: plus(7), callIds: [], status: "OC aprobada", purchaseOrderId: po1 },
  ];
  const transfers: TransferOrder[] = [{
    id: tr1, createdAt: iso, createdBy: "Almacén", fromWarehouse: "Bodega Central", toWarehouse: "Bodega Taller", status: "En tránsito", toQuality: false,
    lines: [{ code: "MAT-114", name: "Cinta aislante 3M", unit: "rollo", unitCost: 3500, sent: 4 }],
  }];
  const budgets: ApprovedBudget[] = approvedBudgetFromContract(demoContract, iso);
  // Contrato CT1234 con vigencia y WBS (incluye -GAR); el resto son clientes sin contrato.
  const clients = [
    { name: "Comercial Aconcagua" },
    { name: "Minera Sur Ltda." },
    { name: "Maderas del Valle" },
    {
      name: demoContract.customer, contractCode: demoContract.code, startDate: demoContract.startDate,
      endDate: demoContract.endDate, wbs: demoContract.wbs.map((element) => element.code),
    },
  ];

  const writes: [string, unknown][] = [
    [keys.materialMaster, demoMaterials],
    [keys.workOrders, orders],
    [keys.timeEntries, timeEntries],
    [keys.warehouseBins, bins],
    [keys.warehouseMovements, []],
    [keys.transferOrders, transfers],
    [keys.purchaseOrders, purchaseOrders],
    [keys.purchaseRequests, purchaseRequests],
    [keys.clients, clients],
    [keys.approvedBudget, budgets],
    [keys.docCounters, { "51": 1, "61": 1, "71": 1, "81": 1, "13": 1, "21": 1, "31": 2, "32": 1 }],
  ];
  return { ok: writes.every(([key, value]) => writeJson(key, value)) };
}
