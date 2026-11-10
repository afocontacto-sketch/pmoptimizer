import { describe, expect, test } from "vitest";
import type { StockBin } from "../src/data/stock";
import { plannedCallRecords, samplePlans, sampleRoutes } from "../src/modules/maintenanceData";
import type { MaintenancePlan } from "../src/modules/maintenanceData";
import { filterCalls, materialForecast, stockValueByWarehouse } from "../src/modules/supplyForecast";

const planA: MaintenancePlan = { ...samplePlans[0], id: "PL-A", contract: "CT1", triggerType: "calendar", calendarInterval: 1, calendarUnit: "months", startDate: "2026-01-15", horizonMonths: 4 };
const planB: MaintenancePlan = { ...planA, id: "PL-B", contract: "CT2", calendarInterval: 2 };
const calls = plannedCallRecords([planA, planB], sampleRoutes);

describe("filterCalls", () => {
  test("1 plan reduce las llamadas; vacío = todas; contrato y fechas combinan", () => {
    expect(calls.length).toBeGreaterThan(filterCalls(calls, { planIds: ["PL-A"] }).length);
    expect(filterCalls(calls, { planIds: [] })).toHaveLength(calls.length);
    expect(filterCalls(calls, { planIds: ["PL-A", "PL-B"] })).toHaveLength(calls.length);
    expect(filterCalls(calls, { contract: "CT2" }).every((call) => call.plan.id === "PL-B")).toBe(true);
    const ranged = filterCalls(calls, { from: "2026-03-01", to: "2026-03-31" });
    expect(ranged.length).toBeGreaterThan(0);
    expect(ranged.every((call) => call.dueDate.startsWith("2026-03"))).toBe(true);
  });
});

describe("materialForecast", () => {
  test("mensual agrupa por mes y anual suma el año", () => {
    const monthly = materialForecast(calls, sampleRoutes, "month");
    const annual = materialForecast(calls, sampleRoutes, "year", "2026");
    const sum = (rows: { code: string; quantity: number }[], code: string) => rows.filter((row) => row.code === code).reduce((acc, row) => acc + row.quantity, 0);
    expect(sum(monthly, "MAT-114")).toBe(sum(annual, "MAT-114"));
    expect(sum(monthly, "MAT-114")).toBe(calls.length);
    expect(monthly.every((row) => /^\d{4}-\d{2}$/.test(row.period))).toBe(true);
    expect(annual.every((row) => row.period === "2026")).toBe(true);
  });

  test("un mes concreto solo trae ese mes", () => {
    const rows = materialForecast(calls, sampleRoutes, "month", "2026", "03");
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((row) => row.period === "2026-03")).toBe(true);
  });
});

describe("stockValueByWarehouse", () => {
  const bin = (id: string, warehouse: string, quantity: number, unitCost: number): StockBin => ({
    id, code: "M", name: "M", warehouse, location: "A", status: "Libre utilización", quantity, reserved: 0, unit: "u", unitCost,
  });
  const bins = [bin("1", "A", 2, 10), bin("2", "B", 3, 5), bin("3", "A", 1, 100), bin("4", "B", 0, 99)];

  test("la suma de las barras es el total y el filtro recalcula", () => {
    const all = stockValueByWarehouse(bins);
    expect(all.rows).toEqual([{ warehouse: "A", value: 120 }, { warehouse: "B", value: 15 }]);
    expect(all.rows.reduce((sum, row) => sum + row.value, 0)).toBe(all.total);
    const onlyB = stockValueByWarehouse(bins, "B");
    expect(onlyB.total).toBe(15);
    expect(onlyB.rows).toHaveLength(1);
  });
});
