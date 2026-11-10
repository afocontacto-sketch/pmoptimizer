import { keys } from "../data/keys";

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
export const maintenanceCallsStorageKey = keys.maintenanceCalls;

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
