import { useCallback } from "react";
import { Alert } from "@mui/material";
import { keys } from "../../data/keys";
import { demandByMaterial } from "../../data/stock";
import { useStoredValue } from "../../hooks/useStore";
import { BarChartCard } from "./BarChartCard";

export type StockDemandChartProps = { from: string; to: string; warehouse?: string; height?: number };

// Disponible (libre pickable) vs requerido (pendiente de picking de OT abiertas); rojo si hay bajo stock.
export function StockDemandChart({ from, to, warehouse, height = 300 }: StockDemandChartProps) {
  const read = useCallback(() => demandByMaterial(from, to, { warehouse }), [from, to, warehouse]);
  const rows = useStoredValue(keys.workOrders, read, [keys.warehouseBins, keys.materialMaster]);
  if (rows.length === 0) return <Alert severity="info">Sin demanda de materiales para el período seleccionado.</Alert>;
  const categories = rows.map((row) => row.code);
  return (
    <BarChartCard
      title={`Stock disponible vs requerido (${from} a ${to})`}
      categories={categories}
      height={height}
      series={[
        { label: "Disponible", data: rows.map((row) => row.low ? null : row.available), color: "#16a34a", stack: "disponible" },
        { label: "Disponible (bajo stock)", data: rows.map((row) => row.low ? row.available : null), color: "#dc2626", stack: "disponible" },
        { label: "Requerido", data: rows.map((row) => row.required), color: "#94a3b8", stack: "requerido" },
      ]}
    />
  );
}
