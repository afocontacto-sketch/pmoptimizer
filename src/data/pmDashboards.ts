import type { PlannedCallRecord, RouteTemplate } from "../modules/maintenanceData";
import type { TimeEntry, WorkOrder } from "./workOrders";

// PM-01/02/04/05: agregaciones puras por contrato y rango de meses (YYYY-MM). contract vacío = todos.
export type PmFilter = { contract: string; fromMonth: string; toMonth: string };
export type BacklogMonth = { month: string; planned: number; closed: number; open: number };
export type BacklogItem = { id: string; contract: string; wbs: string; dueDate: string; label: string };
export type HoursMonth = { month: string; planned: number; real: number };

const inRange = (month: string, filter: PmFilter) => month >= filter.fromMonth && month <= filter.toMonth;
const matches = (contract: string, filter: PmFilter) => !filter.contract || contract === filter.contract;

export function monthsBetween(fromMonth: string, toMonth: string): string[] {
  const result: string[] = [];
  let [year, month] = fromMonth.split("-").map(Number);
  while (`${year}-${String(month).padStart(2, "0")}` <= toMonth && result.length < 120) {
    result.push(`${year}-${String(month).padStart(2, "0")}`);
    month += 1;
    if (month === 13) { month = 1; year += 1; }
  }
  return result;
}

type Item = { id: string; contract: string; wbs: string; dueDate: string; closed: boolean; label: string; hours: number };

// Un ítem por llamada (con el estado de su OT) y uno por OT sin llamada.
function planningItems(calls: PlannedCallRecord[], orders: WorkOrder[], routes: RouteTemplate[]): Item[] {
  const routeHours = new Map(routes.map((route): [string, number] => [route.id, route.operations.reduce((sum, op) => sum + op.durationHours, 0)]));
  const orderByCall = new Map(orders.filter((order) => order.plannedCallId).map((order): [string, WorkOrder] => [order.plannedCallId as string, order]));
  const fromCalls = calls.map((call): Item => {
    const order = orderByCall.get(call.id);
    return {
      id: call.id, contract: call.plan.contract, wbs: call.plan.wbs, dueDate: call.dueDate.slice(0, 10),
      closed: order?.status === "Cerrada", label: `${call.plan.equipmentId} · ${call.plan.name}`,
      hours: order ? order.projectedHours : routeHours.get(call.routeId) ?? 0,
    };
  });
  const standalone = orders.filter((order) => !order.plannedCallId && order.type !== "ESPERA").map((order): Item => ({
    id: order.id, contract: order.contract, wbs: order.wbs, dueDate: order.dueDate.slice(0, 10),
    closed: order.status === "Cerrada", label: order.description || order.equipment, hours: order.projectedHours,
  }));
  return [...fromCalls, ...standalone];
}

export function backlogByMonth(calls: PlannedCallRecord[], orders: WorkOrder[], routes: RouteTemplate[], filter: PmFilter): BacklogMonth[] {
  const items = planningItems(calls, orders, routes).filter((item) => matches(item.contract, filter));
  return monthsBetween(filter.fromMonth, filter.toMonth).map((month) => {
    const own = items.filter((item) => item.dueDate.slice(0, 7) === month);
    const closed = own.filter((item) => item.closed).length;
    return { month, planned: own.length, closed, open: own.length - closed };
  });
}

// Pendientes con fecha vencida (anterior a hoy) dentro del rango.
export function overdueItems(calls: PlannedCallRecord[], orders: WorkOrder[], routes: RouteTemplate[], filter: PmFilter, todayIso: string): BacklogItem[] {
  return planningItems(calls, orders, routes)
    .filter((item) => matches(item.contract, filter) && !item.closed && item.dueDate < todayIso && inRange(item.dueDate.slice(0, 7), filter))
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
    .map(({ id, contract, wbs, dueDate, label }) => ({ id, contract, wbs, dueDate, label }));
}

// Horas planificadas (rutas / OT) vs reales (timeEntries) por mes.
export function hoursByMonth(
  calls: PlannedCallRecord[], orders: WorkOrder[], routes: RouteTemplate[], entries: TimeEntry[], filter: PmFilter, nowMs: number,
): HoursMonth[] {
  const items = planningItems(calls, orders, routes).filter((item) => matches(item.contract, filter));
  const contractOfOrder = new Map(orders.map((order): [string, string] => [order.id, order.contract]));
  return monthsBetween(filter.fromMonth, filter.toMonth).map((month) => {
    const planned = items.filter((item) => item.dueDate.slice(0, 7) === month).reduce((sum, item) => sum + item.hours, 0);
    const real = entries
      .filter((entry) => entry.start.slice(0, 7) === month && matches(contractOfOrder.get(entry.orderId) ?? "", filter))
      .reduce((sum, entry) => {
        const end = entry.end ? Date.parse(entry.end) : nowMs;
        return sum + Math.max(0, (end - Date.parse(entry.start)) / 3600000);
      }, 0);
    return { month, planned, real };
  });
}
