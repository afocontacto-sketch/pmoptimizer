import { useEffect, useMemo, useRef, useState } from "react";
import { Alert, Button, Grid, MenuItem, Paper, Stack, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography } from "@mui/material";
import { BarChartCard } from "../../components/charts/BarChartCard";
import { KpiCard } from "../../components/KpiCard";
import { printElement } from "../../components/print/printDocument";
import { downloadCsv } from "../../data/csv";
import { backlogByMonth, hoursByMonth, overdueItems } from "../../data/pmDashboards";
import type { PmFilter } from "../../data/pmDashboards";
import { STORE_EVENT } from "../../data/storage";
import { loadPmData } from "./pmData";

const hoursText = (value: number | null) => `${(value ?? 0).toFixed(1)} h`;

// PM-01/02/04/05: dashboards filtrados por contrato y rango de meses (cambiar el contrato recalcula todo).
export default function PmDashboards() {
  const [data, setData] = useState(loadPmData);
  const [nowMs] = useState(() => Date.now());
  const year = new Date(nowMs).getFullYear();
  const [filter, setFilter] = useState<PmFilter>({ contract: "", fromMonth: `${year}-01`, toMonth: `${year}-12` });
  const [error, setError] = useState("");
  const printable = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const refresh = () => setData(loadPmData());
    window.addEventListener(STORE_EVENT, refresh);
    return () => window.removeEventListener(STORE_EVENT, refresh);
  }, []);

  const todayIso = new Date(nowMs).toISOString().slice(0, 10);
  const backlog = useMemo(() => backlogByMonth(data.calls, data.orders, data.routes, filter), [data, filter]);
  const overdue = useMemo(() => overdueItems(data.calls, data.orders, data.routes, filter, todayIso), [data, filter, todayIso]);
  const hours = useMemo(() => hoursByMonth(data.calls, data.orders, data.routes, data.timeEntries, filter, nowMs), [data, filter, nowMs]);
  const totalPlanned = backlog.reduce((sum, item) => sum + item.planned, 0);
  const totalClosed = backlog.reduce((sum, item) => sum + item.closed, 0);
  const plannedHours = hours.reduce((sum, item) => sum + item.planned, 0);
  const realHours = hours.reduce((sum, item) => sum + item.real, 0);
  const categories = backlog.map((item) => item.month);

  const exportPdf = () => {
    if (!printable.current) return;
    printElement(printable.current, `Dashboards PM${filter.contract ? ` · ${filter.contract}` : ""}`).catch(() => setError("No se pudo preparar la impresión."));
  };
  const exportCsv = () => downloadCsv("dashboards-pm.csv",
    ["Mes", "Planificadas", "Cerradas", "Pendientes", "Horas planificadas", "Horas reales"],
    backlog.map((item, index) => [item.month, item.planned, item.closed, item.open, hours[index].planned.toFixed(2), hours[index].real.toFixed(2)]));

  return (
    <Paper sx={{ p: 3 }}>
      <Stack spacing={2}>
        <Typography variant="h6">Dashboards del proyecto</Typography>
        <Stack direction={{ xs: "column", md: "row" }} spacing={2} sx={{ alignItems: { md: "center" } }}>
          <TextField select size="small" label="Contrato" value={filter.contract} sx={{ minWidth: 220 }}
            onChange={(event) => setFilter({ ...filter, contract: event.target.value })}>
            <MenuItem value="">Todos los contratos</MenuItem>
            {data.contracts.map((contract) => <MenuItem key={contract.code} value={contract.code}>{contract.code} · {contract.customer}</MenuItem>)}
          </TextField>
          <TextField size="small" type="month" label="Desde" value={filter.fromMonth} slotProps={{ inputLabel: { shrink: true } }}
            onChange={(event) => event.target.value && setFilter({ ...filter, fromMonth: event.target.value })} />
          <TextField size="small" type="month" label="Hasta" value={filter.toMonth} slotProps={{ inputLabel: { shrink: true } }}
            onChange={(event) => event.target.value && setFilter({ ...filter, toMonth: event.target.value })} />
          <Button variant="outlined" onClick={exportCsv}>CSV</Button>
          <Button variant="outlined" onClick={exportPdf}>PDF</Button>
        </Stack>
        {error && <Alert severity="error" onClose={() => setError("")}>{error}</Alert>}
        <div ref={printable}>
          <Stack spacing={2}>
            <Grid container spacing={2}>
              <Grid size={{ xs: 6, md: 3 }}><KpiCard label="Mantenimientos planificados" value={String(totalPlanned)} /></Grid>
              <Grid size={{ xs: 6, md: 3 }}><KpiCard label="Cerrados" value={String(totalClosed)} /></Grid>
              <Grid size={{ xs: 6, md: 3 }}><KpiCard label="Horas planificadas" value={hoursText(plannedHours)} /></Grid>
              <Grid size={{ xs: 6, md: 3 }}><KpiCard label="Horas reales" value={hoursText(realHours)} /></Grid>
            </Grid>
            <Grid container spacing={2}>
              <Grid size={{ xs: 12, md: 6 }}>
                <BarChartCard title="Backlog: cerrado vs pendiente por mes" categories={categories} series={[
                  { label: "Cerrados", data: backlog.map((item) => item.closed), color: "#16a34a", stack: "backlog" },
                  { label: "Pendientes", data: backlog.map((item) => item.open), color: "#f59e0b", stack: "backlog" },
                ]} />
              </Grid>
              <Grid size={{ xs: 12, md: 6 }}>
                <BarChartCard title="Horas planificadas vs reales por mes" categories={categories} valueFormatter={hoursText} series={[
                  { label: "Planificadas", data: hours.map((item) => Number(item.planned.toFixed(2))), color: "#2563eb" },
                  { label: "Reales", data: hours.map((item) => Number(item.real.toFixed(2))), color: "#9333ea" },
                ]} />
              </Grid>
            </Grid>
            <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>Mantenimientos vencidos sin cerrar</Typography>
            {overdue.length === 0 ? <Alert severity="success">No hay mantenimientos vencidos en el rango.</Alert> : (
              <Table size="small">
                <TableHead><TableRow><TableCell>Fecha</TableCell><TableCell>Llamada / OT</TableCell><TableCell>Detalle</TableCell><TableCell>Contrato / WBS</TableCell></TableRow></TableHead>
                <TableBody>{overdue.map((item) => (
                  <TableRow key={item.id}><TableCell>{item.dueDate}</TableCell><TableCell>{item.id}</TableCell><TableCell>{item.label}</TableCell><TableCell>{item.contract} · {item.wbs}</TableCell></TableRow>
                ))}</TableBody>
              </Table>
            )}
          </Stack>
        </div>
        <Typography variant="caption" color="text.secondary">
          Horas planificadas = horas de la hoja de ruta (o de la OT si ya existe) según su fecha; horas reales = tiempos registrados por técnicos.
        </Typography>
      </Stack>
    </Paper>
  );
}
