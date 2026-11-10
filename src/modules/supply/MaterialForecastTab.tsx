import { useMemo, useState } from "react";
import { Alert, MenuItem, Paper, Stack, Table, TableBody, TableCell, TableHead, TableRow, TextField, ToggleButton, ToggleButtonGroup, Typography } from "@mui/material";
import { readPlannedCalls, routeStorageKey } from "../maintenanceData";
import type { RouteTemplate } from "../maintenanceData";
import { readStoredList } from "../supplyData";
import { materialForecast } from "../supplyForecast";

const months = ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12"];

// Forecast de materiales (mensual o anual) calculado desde las llamadas futuras y sus hojas de ruta.
export default function MaterialForecastTab() {
  const [calls] = useState(readPlannedCalls);
  const [routes] = useState(() => readStoredList<RouteTemplate>(routeStorageKey));
  const [mode, setMode] = useState<"month" | "year">("month");
  const [year, setYear] = useState("");
  const [month, setMonth] = useState("");
  const years = useMemo(() => [...new Set(calls.map((call) => call.dueDate.slice(0, 4)))].sort(), [calls]);
  const rows = materialForecast(calls, routes, mode, year, month);

  return (
    <Paper sx={{ p: 3 }}>
      <Typography variant="h6" sx={{ mb: 2 }}>Forecast de materiales</Typography>
      <Stack direction={{ xs: "column", md: "row" }} spacing={2} sx={{ mb: 2 }}>
        <ToggleButtonGroup exclusive size="small" value={mode} onChange={(_, value: "month" | "year" | null) => value && setMode(value)}>
          <ToggleButton value="month">Mensual</ToggleButton>
          <ToggleButton value="year">Anual</ToggleButton>
        </ToggleButtonGroup>
        <TextField select size="small" label="Año" value={year} onChange={(event) => setYear(event.target.value)} sx={{ minWidth: 120 }}>
          <MenuItem value="">Todos</MenuItem>
          {years.map((item) => <MenuItem key={item} value={item}>{item}</MenuItem>)}
        </TextField>
        {mode === "month" && (
          <TextField select size="small" label="Mes" value={month} onChange={(event) => setMonth(event.target.value)} sx={{ minWidth: 120 }}>
            <MenuItem value="">Todos</MenuItem>
            {months.map((item) => <MenuItem key={item} value={item}>{item}</MenuItem>)}
          </TextField>
        )}
      </Stack>
      {rows.length === 0 ? (
        <Alert severity="info">No hay necesidades de materiales para el período elegido.</Alert>
      ) : (
        <Table size="small">
          <TableHead><TableRow><TableCell>Período</TableCell><TableCell>Material</TableCell><TableCell align="right">Cantidad</TableCell></TableRow></TableHead>
          <TableBody>{rows.map((row) => (
            <TableRow key={`${row.period}-${row.code}`}>
              <TableCell>{row.period}</TableCell>
              <TableCell>{row.code} · {row.name}</TableCell>
              <TableCell align="right">{row.quantity} {row.unit}</TableCell>
            </TableRow>
          ))}</TableBody>
        </Table>
      )}
    </Paper>
  );
}
