import { useState } from "react";
import { Grid, Stack, TextField } from "@mui/material";
import { BarChartCard } from "../../components/charts/BarChartCard";
import { PieChartCard } from "../../components/charts/PieChartCard";
import { KpiCard } from "../../components/KpiCard";
import { useOperations } from "../../hooks/useOperations";
import { currentMonth, qualityMonthStats } from "./qualityStats";

export default function QualityDashboards() {
  const { orders, stock } = useOperations();
  const [month, setMonth] = useState(currentMonth());
  const stats = qualityMonthStats(orders, stock, month || currentMonth());
  return (
    <Stack spacing={2}>
      <TextField type="month" label="Mes" value={month} onChange={(event) => setMonth(event.target.value)} slotProps={{ inputLabel: { shrink: true } }} sx={{ maxWidth: 200 }} />
      <Grid container spacing={2}>
        <Grid size={{ xs: 6, md: 3 }}><KpiCard label="OT inspeccionadas del mes" value={String(stats.inspectedOrders)} /></Grid>
        <Grid size={{ xs: 6, md: 3 }}><KpiCard label="OT pendientes de inspección" value={String(stats.pendingOrders)} /></Grid>
        <Grid size={{ xs: 6, md: 3 }}><KpiCard label="Materiales inspeccionados del mes" value={String(stats.releasedBins)} /></Grid>
        <Grid size={{ xs: 6, md: 3 }}><KpiCard label="Materiales por inspeccionar" value={String(stats.blockedBins)} /></Grid>
      </Grid>
      <Grid container spacing={2}>
        <Grid size={{ xs: 12, md: 6 }}>
          <PieChartCard title="OT inspeccionadas vs pendientes" data={[
            { label: "Inspeccionadas", value: stats.inspectedOrders, color: "#16a34a" },
            { label: "Pendientes", value: stats.pendingOrders, color: "#f59e0b" },
          ]} />
        </Grid>
        <Grid size={{ xs: 12, md: 6 }}>
          <BarChartCard title="Materiales inspeccionados vs por inspeccionar" categories={["Inspeccionados", "Por inspeccionar"]}
            series={[{ label: "Lotes", data: [stats.releasedBins, stats.blockedBins] }]} />
        </Grid>
      </Grid>
    </Stack>
  );
}
