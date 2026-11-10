import { describe, expect, test } from "vitest";
import { can } from "../src/app/permissions";
import { generateCalls, samplePlans, sampleRoutes } from "../src/modules/maintenanceData";
import type { MaintenancePlan } from "../src/modules/maintenanceData";
import { planningForecast } from "../src/modules/planningForecast";

const base: MaintenancePlan = { ...samplePlans[0], triggerType: "calendar", calendarInterval: 1, calendarUnit: "months", startDate: "2026-01-15", horizonMonths: 6 };
const planA = { ...base, id: "PL-A" };
const planB = { ...base, id: "PL-B", calendarInterval: 2 };
const calls = [...generateCalls(planA, sampleRoutes[0]), ...generateCalls(planB, sampleRoutes[0])];
const total = (rows: { calls: number; cost: number }[]) => ({ calls: rows.reduce((s, r) => s + r.calls, 0), cost: rows.reduce((s, r) => s + r.cost, 0) });

describe("planningForecast", () => {
  test("2 planes elegidos suman ambos; vacío = todos", () => {
    const a = total(planningForecast(calls, { planIds: ["PL-A"], mode: "month" }));
    const b = total(planningForecast(calls, { planIds: ["PL-B"], mode: "month" }));
    const both = total(planningForecast(calls, { planIds: ["PL-A", "PL-B"], mode: "month" }));
    expect(both.calls).toBe(a.calls + b.calls);
    expect(both.cost).toBeCloseTo(a.cost + b.cost);
    expect(planningForecast(calls, { planIds: [], mode: "month" })).toEqual(planningForecast(calls, { mode: "month" }));
    expect(total(planningForecast(calls, { mode: "month" })).calls).toBe(both.calls);
  });

  test("anual agrupa por año y mensual filtra por mes", () => {
    const annual = planningForecast(calls, { mode: "year", year: "2026" });
    expect(annual).toHaveLength(1);
    expect(annual[0].calls).toBe(calls.length);
    const march = planningForecast(calls, { mode: "month", year: "2026", month: "03" });
    expect(march.every((row) => row.period === "2026-03")).toBe(true);
    expect(march.length).toBe(1);
  });
});

describe("permiso plan.edit", () => {
  test("solo Planificador y Administrador editan planes; PM no", () => {
    expect(can("Planificador", "plan.edit")).toBe(true);
    expect(can("Administrador", "plan.edit")).toBe(true);
    expect(can("PM Proyecto", "plan.edit")).toBe(false);
    expect(can("Ingeniería e Industrial", "plan.edit")).toBe(false);
  });
});
