import { keys } from "../data/keys";
import { readJson } from "../data/storage";

export type CalendarUnit = "days" | "months" | "years";
export type TriggerType = "calendar" | "kilometers" | "hours" | "first";
export type MeterUnit = "kilometers" | "hours";

export type RouteMaterial = {
  code: string;
  name: string;
  quantity: number;
  unit: string;
  unitCost: number;
};

export type RouteOperation = {
  order: number;
  name: string;
  durationHours: number;
  hourlyCost: number;
  technician?: string;
  materials: RouteMaterial[];
};

export type RouteTemplate = {
  id: string;
  name: string;
  operations: RouteOperation[];
};

export type MaintenancePlan = {
  id: string;
  name: string;
  equipmentId: string;
  contract: string;
  wbs: string;
  routeId: string;
  triggerType: "calendar" | "kilometers" | "hours" | "first";
  calendarInterval: number;
  calendarUnit: "days" | "months" | "years";
  meterUnit: "kilometers" | "hours";
  meterInterval: number;
  lastExecutionMeter: number;
  currentMeterReading: number;
  averageUsagePerDay: number;
  startDate: string;
  horizonMonths: number;
  customFields?: Record<string, string>;
};

export const routeStorageKey = keys.maintenanceRoutes;
export const planStorageKey = keys.maintenancePlans;

export const sampleRoutes: RouteTemplate[] = [{
  id: "HR-VEH-001",
  name: "Mantención preventiva vehículo",
  operations: [
    {
      order: 10,
      name: "Inspección de cableado y aislación",
      durationHours: 1.5,
      hourlyCost: 18000,
      materials: [
        { code: "MAT-114", name: "Cinta aislante 3M", quantity: 1, unit: "rollo", unitCost: 3500 },
      ],
    },
    {
      order: 20,
      name: "Inspección y lubricación de rodamiento",
      durationHours: 2,
      hourlyCost: 18000,
      materials: [
        { code: "MAT-422", name: "Rodamiento SKF 6205", quantity: 1, unit: "unidad", unitCost: 7800 },
      ],
    },
  ],
}];

export const samplePlans: MaintenancePlan[] = [{
  id: "PL-VEH-001",
  name: "Preventivo cada 3 meses o 10.000 km",
  equipmentId: "VEH-001",
  contract: "CT1234",
  wbs: "CT1234-CL-B2N4-PRE",
  routeId: "HR-VEH-001",
  triggerType: "first",
  calendarInterval: 3,
  calendarUnit: "months",
  meterUnit: "kilometers",
  meterInterval: 10000,
  lastExecutionMeter: 0,
  currentMeterReading: 0,
  averageUsagePerDay: 120,
  startDate: new Date().toISOString().slice(0, 10),
  horizonMonths: 12,
  customFields: {},
}];

export type PlannedCall = {
  id: string;
  plan: MaintenancePlan;
  dueDate: Date;
  route: RouteTemplate;
};

export function addCalendarInterval(date: Date, amount: number, unit: CalendarUnit): Date {
  const result = new Date(date);
  if (unit === "days") result.setDate(result.getDate() + amount);
  if (unit === "months") {
    const day = result.getDate();
    result.setDate(1);
    result.setMonth(result.getMonth() + amount);
    const lastDay = new Date(result.getFullYear(), result.getMonth() + 1, 0).getDate();
    result.setDate(Math.min(day, lastDay));
  }
  if (unit === "years") {
    const month = result.getMonth();
    const day = result.getDate();
    result.setFullYear(result.getFullYear() + amount);
    if (result.getMonth() !== month) {
      result.setDate(0);
    } else {
      const lastDay = new Date(result.getFullYear(), month + 1, 0).getDate();
      result.setDate(Math.min(day, lastDay));
    }
  }
  return result;
}

export function generateCalls(plan: MaintenancePlan, route: RouteTemplate): PlannedCall[] {
  if (
    !isValidDateOnly(plan.startDate) ||
    !Number.isInteger(plan.horizonMonths) ||
    plan.horizonMonths < 1
  ) return [];
  const start = new Date(`${plan.startDate}T12:00:00`);
  const end = addCalendarInterval(start, plan.horizonMonths, "months");
  const calendarEnabled = plan.triggerType === "calendar" || plan.triggerType === "first";
  const meterEnabled = plan.triggerType !== "calendar";
  if (
    (calendarEnabled && (!Number.isFinite(plan.calendarInterval) || plan.calendarInterval < 1)) ||
    (meterEnabled && (!Number.isFinite(plan.meterInterval) || plan.meterInterval < 1 ||
      !Number.isFinite(plan.averageUsagePerDay) || plan.averageUsagePerDay <= 0))
  ) return [];
  const meterDays = plan.averageUsagePerDay > 0
    ? plan.meterInterval / plan.averageUsagePerDay
    : Number.POSITIVE_INFINITY;
  const lastExecutionMeter = plan.lastExecutionMeter ?? 0;
  const currentMeterReading = plan.currentMeterReading ?? lastExecutionMeter;
  const meterUsedSinceExecution = Math.max(0, currentMeterReading - lastExecutionMeter);
  const meterDaysRemaining = plan.averageUsagePerDay > 0
    ? Math.max(0, plan.meterInterval - meterUsedSinceExecution) / plan.averageUsagePerDay
    : Number.POSITIVE_INFINITY;
  let calendarDue = calendarEnabled
    ? addCalendarInterval(start, plan.calendarInterval, plan.calendarUnit)
    : null;
  let meterDue = meterEnabled && Number.isFinite(meterDays) && Number.isFinite(meterDaysRemaining)
    ? new Date(start.getTime() + meterDaysRemaining * 86400000)
    : null;
  const calls: PlannedCall[] = [];

  while (calls.length < 120) {
    const nextDue = calendarDue && meterDue
      ? (calendarDue <= meterDue ? calendarDue : meterDue)
      : calendarDue ?? meterDue;
    if (!nextDue || nextDue > end) break;
    calls.push({ id: `${plan.id}-${calls.length + 1}`, plan, dueDate: nextDue, route });
    if (calendarEnabled) {
      calendarDue = addCalendarInterval(nextDue, plan.calendarInterval, plan.calendarUnit);
    }
    if (meterEnabled && Number.isFinite(meterDays)) {
      meterDue = new Date(nextDue.getTime() + meterDays * 86400000);
    }
  }
  return calls;
}

export function isValidDateOnly(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export type PlannedCallRecord = {
  id: string;
  plan: MaintenancePlan;
  routeId: string;
  dueDate: string;
};

// Llamadas derivadas de planes y rutas (sin persistir): función pura.
export function plannedCallRecords(plans: MaintenancePlan[], routes: RouteTemplate[]): PlannedCallRecord[] {
  const routeById = new Map(routes.map((route): [string, RouteTemplate] => [route.id, route]));
  return plans
    .flatMap((plan) => {
      const route = routeById.get(plan.routeId);
      return route ? generateCalls(plan, route) : [];
    })
    .sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime())
    .map((call) => ({ id: call.id, plan: call.plan, routeId: call.route.id, dueDate: call.dueDate.toISOString() }));
}

export function readPlannedCalls(): PlannedCallRecord[] {
  return plannedCallRecords(
    readJson<MaintenancePlan[]>(planStorageKey, samplePlans),
    readJson<RouteTemplate[]>(routeStorageKey, sampleRoutes),
  );
}
