import { useCallback, useMemo, useState } from "react";
import { Grid, MenuItem, Paper, Stack, TextField, Typography } from "@mui/material";
import { BarChartCard } from "../../components/charts/BarChartCard";
import { StockDemandChart } from "../../components/charts/StockDemandChart";
import { money } from "../../data/format";
import { keys } from "../../data/keys";
import { readBins } from "../../data/stock";
import type { StockBin } from "../../data/stock";
import { useStoredValue } from "../../hooks/useStore";
import { stockValueByWarehouse } from "../supplyForecast";

const isoDay = (offset: number) => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);

// KPI de valor de inventario, barras por almacén (suma = total) y demanda vs stock del almacén elegido.
export default function SupplyDashboard() {
  const bins = useStoredValue<StockBin[]>(keys.warehouseBins, useCallback(() => readBins(), []));
  const [warehouse, setWarehouse] = useState("");
  const warehouses = useMemo(() => [...new Set(bins.map((bin) => bin.warehouse))].sort(), [bins]);
  const { rows, total } = stockValueByWarehouse(bins, warehouse || undefined);
  const [from] = useState(() => isoDay(0));
  const [to] = useState(() => isoDay(30));

  return (
    <Stack spacing={2}>
      <TextField select label="Almacén" value={warehouse} onChange={(event) => setWarehouse(event.target.value)} sx={{ maxWidth: 260 }}>
        <MenuItem value="">Todos</MenuItem>
        {warehouses.map((name) => <MenuItem key={name} value={name}>{name}</MenuItem>)}
      </TextField>
      <Grid container spacing={2}>
        <Grid size={{ xs: 12, md: 4 }}>
          <Paper sx={{ p: 2 }}>
            <Typography variant="body2" color="text.secondary">Valor total de inventario{warehouse ? ` · ${warehouse}` : ""}</Typography>
            <Typography variant="h5" sx={{ mt: 1, fontWeight: 700 }}>{money(total)}</Typography>
          </Paper>
        </Grid>
        <Grid size={{ xs: 12, md: 8 }}>
          <BarChartCard title="Valor de inventario por almacén" categories={rows.map((row) => row.warehouse)}
            series={[{ label: "Valor", data: rows.map((row) => row.value), color: "#2563eb" }]} valueFormatter={(value) => money(value ?? 0)} />
        </Grid>
      </Grid>
      <StockDemandChart from={from} to={to} warehouse={warehouse || undefined} />
    </Stack>
  );
}
