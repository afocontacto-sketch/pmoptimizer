import type { StockBin } from "../../data/stock";
import type { WorkOrder } from "../../data/workOrders";

export type QualityMonthStats = {
  inspectedOrders: number;
  pendingOrders: number;
  releasedBins: number;
  blockedBins: number;
};

export const currentMonth = (now: Date = new Date()) => `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

const inMonth = (iso: string | undefined, month: string) => Boolean(iso) && (iso as string).slice(0, 7) === month;

// CAL-01: OT aprobadas por Calidad en el mes vs OT en cierre provisorio sin aprobación (estado actual).
// CAL-02: lotes liberados en el mes vs lotes aún bloqueados por Calidad (estado actual).
export function qualityMonthStats(orders: WorkOrder[], stock: StockBin[], month: string): QualityMonthStats {
  return {
    inspectedOrders: orders.filter((order) => inMonth(order.qualityApprovedAt, month)).length,
    pendingOrders: orders.filter((order) => order.status === "Cierre provisorio" && !order.qualityApproved).length,
    releasedBins: stock.filter((bin) => inMonth(bin.releasedAt, month)).length,
    blockedBins: stock.filter((bin) => bin.status === "Bloqueado calidad").length,
  };
}
