import type { StockBin } from "../data/stock";
import type { PlannedCallRecord, RouteTemplate } from "./maintenanceData";

export type CallFilter = { planIds?: string[]; contract?: string; from?: string; to?: string };

// Llamadas futuras filtradas: planes (multi), contrato y rango de fechas (YYYY-MM-DD, inclusivo).
export function filterCalls(calls: PlannedCallRecord[], filter: CallFilter): PlannedCallRecord[] {
  return calls.filter((call) => {
    const date = call.dueDate.slice(0, 10);
    return (!filter.planIds?.length || filter.planIds.includes(call.plan.id)) &&
      (!filter.contract || call.plan.contract === filter.contract) &&
      (!filter.from || date >= filter.from) &&
      (!filter.to || date <= filter.to);
  });
}

export type ForecastRow = { period: string; code: string; name: string; unit: string; quantity: number };

// Forecast de materiales por mes ("2026-03") o por año ("2026") a partir de las llamadas y sus hojas de ruta.
export function materialForecast(
  calls: PlannedCallRecord[],
  routes: RouteTemplate[],
  mode: "month" | "year",
  year?: string,
  month?: string,
): ForecastRow[] {
  const routeById = new Map(routes.map((route): [string, RouteTemplate] => [route.id, route]));
  const rows = new Map<string, ForecastRow>();
  for (const call of calls) {
    const date = call.dueDate.slice(0, 10);
    if (year && date.slice(0, 4) !== year) continue;
    if (mode === "month" && month && date.slice(5, 7) !== month) continue;
    const period = mode === "year" ? date.slice(0, 4) : date.slice(0, 7);
    for (const operation of routeById.get(call.routeId)?.operations ?? []) {
      for (const material of operation.materials) {
        const key = `${period}|${material.code}`;
        const row = rows.get(key) ?? { period, code: material.code, name: material.name, unit: material.unit, quantity: 0 };
        row.quantity += material.quantity;
        rows.set(key, row);
      }
    }
  }
  return [...rows.values()].sort((a, b) => a.period.localeCompare(b.period) || a.code.localeCompare(b.code));
}

export type WarehouseValue = { warehouse: string; value: number };

// Valor de inventario por almacén (cantidad x costo unitario del bin); la suma de las barras es exactamente el total.
export function stockValueByWarehouse(bins: StockBin[], warehouse?: string): { rows: WarehouseValue[]; total: number } {
  const totals = new Map<string, number>();
  for (const bin of bins) {
    if (bin.quantity <= 0 || (warehouse && bin.warehouse !== warehouse)) continue;
    totals.set(bin.warehouse, (totals.get(bin.warehouse) ?? 0) + bin.quantity * bin.unitCost);
  }
  const rows = [...totals.entries()].map(([name, value]) => ({ warehouse: name, value })).sort((a, b) => a.warehouse.localeCompare(b.warehouse));
  return { rows, total: rows.reduce((sum, row) => sum + row.value, 0) };
}
