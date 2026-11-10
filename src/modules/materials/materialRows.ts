import { readMaterials } from "../../data/materials";
import type { MaterialRecord } from "../../data/materials";
import { readBins, stockByMaterial } from "../../data/stock";
import type { StockBin } from "../../data/stock";

export type MaterialRow = MaterialRecord & { available: number; quality: number; inTransit: number };

// Maestro + saldos de stock. minStock es alias de reorderPoint; el stock sin maestro se muestra como "Sin categoría".
export function getMaterialRows(bins: StockBin[] = readBins(), master: MaterialRecord[] = readMaterials()): MaterialRow[] {
  const balances = new Map(stockByMaterial(bins).map((row) => [row.code, row]));
  const known = master.map((item): MaterialRow => {
    const balance = balances.get(item.code);
    return { ...item, minStock: item.reorderPoint, available: balance?.free ?? 0, quality: balance?.quality ?? 0, inTransit: balance?.transit ?? 0 };
  });
  const codes = new Set(master.map((item) => item.code));
  const imported = [...balances.values()].filter((row) => !codes.has(row.code)).map((row): MaterialRow => ({
    code: row.code, name: row.name, unit: row.unit, category: "Sin categoría", minStock: 0, reorderPoint: 0, leadTimeDays: 0,
    requiresInspection: false, available: row.free, quality: row.quality, inTransit: row.transit,
  }));
  return [...known, ...imported];
}

export const isCritical = (row: MaterialRow): boolean => row.reorderPoint > 0 && row.available <= row.reorderPoint;
