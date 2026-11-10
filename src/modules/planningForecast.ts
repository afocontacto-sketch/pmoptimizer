import type { PlannedCall } from "./maintenanceData";

export type ForecastPeriod = { period: string; calls: number; hours: number; cost: number };
export type PlanningForecastFilter = { planIds?: string[]; mode: "month" | "year"; year?: string; month?: string };

// Forecast de mantenimiento (llamadas, horas, costo) por mes o por año; planIds vacío = todos los planes.
export function planningForecast(calls: PlannedCall[], filter: PlanningForecastFilter): ForecastPeriod[] {
  const periods = new Map<string, ForecastPeriod>();
  for (const call of calls) {
    if (filter.planIds?.length && !filter.planIds.includes(call.plan.id)) continue;
    const date = call.dueDate.toISOString().slice(0, 10);
    if (filter.year && date.slice(0, 4) !== filter.year) continue;
    if (filter.mode === "month" && filter.month && date.slice(5, 7) !== filter.month) continue;
    const period = filter.mode === "year" ? date.slice(0, 4) : date.slice(0, 7);
    const totals = periods.get(period) ?? { period, calls: 0, hours: 0, cost: 0 };
    totals.calls += 1;
    for (const operation of call.route.operations) {
      totals.hours += operation.durationHours;
      totals.cost += operation.durationHours * operation.hourlyCost
        + operation.materials.reduce((sum, material) => sum + material.quantity * material.unitCost, 0);
    }
    periods.set(period, totals);
  }
  return [...periods.values()].sort((a, b) => a.period.localeCompare(b.period));
}
