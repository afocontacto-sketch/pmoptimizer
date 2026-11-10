import { useMemo, useState } from "react";
import { Alert, Autocomplete, MenuItem, Paper, Stack, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography } from "@mui/material";
import { readPlannedCalls, routeStorageKey } from "../maintenanceData";
import type { RouteTemplate } from "../maintenanceData";
import { readStoredList } from "../supplyData";
import { filterCalls } from "../supplyForecast";

const hoursOf = (route?: RouteTemplate) => (route?.operations ?? []).reduce((sum, operation) => sum + operation.durationHours, 0);

// Llamadas futuras (generateCalls vía readPlannedCalls) filtrables por planes (multi), contrato y fechas.
export default function FutureCallsTab() {
  const [calls] = useState(readPlannedCalls);
  const [routes] = useState(() => readStoredList<RouteTemplate>(routeStorageKey));
  const [planIds, setPlanIds] = useState<string[]>([]);
  const [contract, setContract] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const plans = useMemo(() => [...new Map(calls.map((call): [string, { id: string; name: string }] => [call.plan.id, { id: call.plan.id, name: call.plan.name }])).values()], [calls]);
  const contracts = useMemo(() => [...new Set(calls.map((call) => call.plan.contract).filter(Boolean))].sort(), [calls]);
  const routeById = useMemo(() => new Map(routes.map((route): [string, RouteTemplate] => [route.id, route])), [routes]);
  const shown = filterCalls(calls, { planIds, contract, from, to });

  return (
    <Paper sx={{ p: 3 }}>
      <Typography variant="h6" sx={{ mb: 2 }}>Llamadas futuras</Typography>
      <Stack direction={{ xs: "column", md: "row" }} spacing={2} sx={{ mb: 2 }}>
        <Autocomplete multiple sx={{ minWidth: 320, flex: 1 }} options={plans} value={plans.filter((plan) => planIds.includes(plan.id))}
          getOptionLabel={(plan) => `${plan.id} · ${plan.name}`} isOptionEqualToValue={(a, b) => a.id === b.id}
          onChange={(_, value) => setPlanIds(value.map((plan) => plan.id))}
          renderInput={(params) => <TextField {...params} label="Planes (vacío = todos)" />} />
        <TextField select label="Contrato" value={contract} onChange={(event) => setContract(event.target.value)} sx={{ minWidth: 180 }}>
          <MenuItem value="">Todos</MenuItem>
          {contracts.map((code) => <MenuItem key={code} value={code}>{code}</MenuItem>)}
        </TextField>
        <TextField label="Desde" type="date" value={from} onChange={(event) => setFrom(event.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
        <TextField label="Hasta" type="date" value={to} onChange={(event) => setTo(event.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
      </Stack>
      {shown.length === 0 ? (
        <Alert severity="info">No hay llamadas para los filtros elegidos.</Alert>
      ) : (
        <>
          <Table size="small">
            <TableHead><TableRow><TableCell>Fecha</TableCell><TableCell>Llamada</TableCell><TableCell>Equipo / contrato</TableCell><TableCell>Plan / WBS</TableCell><TableCell align="right">Horas</TableCell></TableRow></TableHead>
            <TableBody>{shown.slice(0, 100).map((call) => (
              <TableRow key={call.id}>
                <TableCell>{call.dueDate.slice(0, 10)}</TableCell>
                <TableCell>{call.id}</TableCell>
                <TableCell>{call.plan.equipmentId}<Typography variant="caption" sx={{ display: "block" }} color="text.secondary">{call.plan.contract || "Sin contrato"}</Typography></TableCell>
                <TableCell>{call.plan.name}<Typography variant="caption" sx={{ display: "block" }} color="text.secondary">{call.plan.wbs || "Sin WBS"}</Typography></TableCell>
                <TableCell align="right">{hoursOf(routeById.get(call.routeId)).toFixed(1)} h</TableCell>
              </TableRow>
            ))}</TableBody>
          </Table>
          <Typography variant="caption" color="text.secondary">
            {shown.length > 100 ? `Se muestran 100 de ${shown.length} llamadas.` : `${shown.length} llamada(s).`}
          </Typography>
        </>
      )}
    </Paper>
  );
}
