import type { RouteOperation } from "../modules/maintenanceData";
import { keys } from "./keys";
import { readJson } from "./storage";
import type { OrderType } from "./docNumbering";

export type { OrderType } from "./docNumbering";

export type OrderStatus = "Sin asignar" | "Asignada" | "En ejecución" | "Cierre provisorio" | "Cerrada";
export type OrderPriority = "Alta" | "Media" | "Baja";
export type PickingStatus = "Sin picking" | "Picking parcial" | "Picking completo";

export type OrderAssignee = { employeeId: string; name: string };

// required = cantidad pedida; picked = cantidad ya entregada por picking.
export type OrderLine = {
  code: string;
  name?: string;
  unit?: string;
  required: number;
  picked: number;
  unitCostAvg?: number;
};

export type StatusChangeRecord = {
  date: string;
  previousStatus: OrderStatus;
  newStatus: OrderStatus;
  user: string;
  reason?: string;
};

export type WorkOrder = {
  id: string;
  type: OrderType;
  contract: string;
  wbs: string;
  planId?: string;
  plannedCallId?: string;
  routeId?: string;
  routeName?: string;
  routeOperations?: RouteOperation[];
  equipment: string;
  description: string;
  dueDate: string;
  priority?: OrderPriority;
  assignees: OrderAssignee[];
  projectedHours: number;
  projectedLaborCost?: number;
  status: OrderStatus;
  materials: OrderLine[];
  pickingStatus: PickingStatus;
  qualityChecklist?: Record<string, boolean>;
  qualityApproved?: boolean;
  qualityApprovedBy?: string | null;
  qualityApprovedAt?: string;
  closedAt?: string;
  closedBy?: string;
  statusHistory: StatusChangeRecord[];
  createdAt: string;
  createdBy: string;
};

// Regla (Q7, se implementa en E3.3): un técnico no puede tener dos operaciones con tiempo abierto.
// Al iniciar otra, la entrada abierta se cierra sola (pausa) en lugar de fallar.
export type TimeEntry = {
  id: string;
  orderId: string;
  orderType: OrderType;
  wbs: string;
  operationOrder: number;
  operationName: string;
  employeeId: string;
  employeeName: string;
  start: string;
  end: string | null;
  hourlyRate: number;
};

export const typeLabels: Record<OrderType, string> = {
  PRE: "Preventivo",
  OVH: "Overhaul",
  COR: "Correctivo",
  GAR: "Garantía",
  REP: "Reparaciones",
  ESPERA: "Espera / no productiva",
};

export const orderTypeColors: Record<OrderType, string> = {
  PRE: "#16a34a",
  COR: "#dc2626",
  OVH: "#2563eb",
  GAR: "#9333ea",
  REP: "#ea580c",
  ESPERA: "#64748b",
};

export function readWorkOrders(): WorkOrder[] {
  return readJson<WorkOrder[]>(keys.workOrders, []);
}

export function readTimeEntries(): TimeEntry[] {
  return readJson<TimeEntry[]>(keys.timeEntries, []);
}

export function entryDurationHours(entry: TimeEntry, nowMs: number): number {
  const end = entry.end ? Date.parse(entry.end) : nowMs;
  return Math.max(0, (end - Date.parse(entry.start)) / 3600000);
}

// Costo imputado = mano de obra (timeEntries x tarifa) + material entregado x costo medio.
export function allocatedCost(order: WorkOrder, entries: TimeEntry[], nowMs: number): number {
  const labor = entries
    .filter((entry) => entry.orderId === order.id)
    .reduce((sum, entry) => sum + entryDurationHours(entry, nowMs) * entry.hourlyRate, 0);
  const material = order.materials.reduce((sum, line) => sum + line.picked * (line.unitCostAvg ?? 0), 0);
  return labor + material;
}
