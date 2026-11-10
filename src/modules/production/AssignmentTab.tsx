import { useState } from "react";
import {
  Alert,
  Autocomplete,
  Button,
  MenuItem,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import { OrderStatusChip } from "../../components/OrderStatusChip";
import { compareOrdersByPriority, typeLabels } from "../../data/workOrders";
import type { OrderStatus, OrderType } from "../../data/workOrders";
import type { ProductionCtx } from "./useProductionCtx";

// Bandeja del equipo: asignación múltiple con filtros por estado, tipo y rango de fecha programada.
export default function AssignmentTab({ ctx }: { ctx: ProductionCtx }) {
  const { visibleOrders, supervisorCanSeeOrder, assignableTeam, assignmentDrafts, setAssignmentDrafts, assignOrderToEmployees } = ctx;
  const [status, setStatus] = useState<OrderStatus | "">("");
  const [type, setType] = useState<OrderType | "">("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const rows = visibleOrders
    .filter((order) => order.status !== "Cerrada" && supervisorCanSeeOrder(order))
    .filter((order) => (!status || order.status === status) && (!type || order.type === type))
    .filter((order) => (!from || order.dueDate >= from) && (!to || order.dueDate <= to))
    .sort(compareOrdersByPriority);
  const statusOptions: OrderStatus[] = ["Sin asignar", "Asignada", "En ejecución", "Cierre provisorio"];

  return (
    <Paper sx={{ p: 3 }}>
      <Typography variant="h6" sx={{ mb: 2 }}>Órdenes de trabajo del equipo</Typography>
      <Stack direction={{ xs: "column", md: "row" }} spacing={2} sx={{ mb: 2 }}>
        <TextField select size="small" label="Estado" value={status} onChange={(event) => setStatus(event.target.value as OrderStatus | "")} sx={{ minWidth: 170 }}>
          <MenuItem value="">Todos</MenuItem>
          {statusOptions.map((item) => <MenuItem key={item} value={item}>{item}</MenuItem>)}
        </TextField>
        <TextField select size="small" label="Tipo" value={type} onChange={(event) => setType(event.target.value as OrderType | "")} sx={{ minWidth: 170 }}>
          <MenuItem value="">Todos</MenuItem>
          {Object.entries(typeLabels).map(([code, label]) => <MenuItem key={code} value={code}>{code} · {label}</MenuItem>)}
        </TextField>
        <TextField size="small" type="date" label="Programada desde" value={from} onChange={(event) => setFrom(event.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
        <TextField size="small" type="date" label="Programada hasta" value={to} onChange={(event) => setTo(event.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
      </Stack>
      {rows.length === 0 ? (
        <Alert severity="info">No hay órdenes abiertas para los contratos o trabajadores de tu equipo con estos filtros.</Alert>
      ) : (
        <Table size="small">
          <TableHead><TableRow><TableCell>OT / equipo</TableCell><TableCell>Trabajo</TableCell><TableCell>Prioridad / programada</TableCell><TableCell>Estado</TableCell><TableCell>Asignados</TableCell><TableCell>Asignar trabajadores</TableCell></TableRow></TableHead>
          <TableBody>{rows.map((order) => {
            const draft = assignmentDrafts[order.id] ?? order.assignees.map((assignee) => assignee.employeeId);
            const editable = order.status === "Sin asignar" || order.status === "Asignada" || order.status === "En ejecución";
            return (
              <TableRow key={order.id}>
                <TableCell>{order.id}<Typography variant="caption" sx={{ display: "block" }}>{order.equipment}</Typography></TableCell>
                <TableCell>{order.description}</TableCell>
                <TableCell>{order.priority ?? "—"}<Typography variant="caption" sx={{ display: "block" }}>{order.dueDate}</Typography></TableCell>
                <TableCell><OrderStatusChip status={order.status} /></TableCell>
                <TableCell>{order.assignees.map((assignee) => assignee.name).join(", ") || "Sin asignar"}</TableCell>
                <TableCell>
                  {editable && assignableTeam.length > 0 ? (
                    <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                      <Autocomplete
                        multiple size="small" sx={{ minWidth: 260 }}
                        options={assignableTeam}
                        getOptionLabel={(employee) => employee.name}
                        isOptionEqualToValue={(option, value) => option.id === value.id}
                        value={assignableTeam.filter((employee) => draft.includes(employee.id))}
                        onChange={(_, selected) => setAssignmentDrafts((current) => ({ ...current, [order.id]: selected.map((employee) => employee.id) }))}
                        renderInput={(params) => <TextField {...params} label="Trabajadores" />}
                      />
                      <Button size="small" variant="contained" onClick={() => assignOrderToEmployees(order.id, draft)}>Asignar</Button>
                    </Stack>
                  ) : editable ? "No hay trabajadores asignables" : "Solo consulta"}
                </TableCell>
              </TableRow>
            );
          })}</TableBody>
        </Table>
      )}
    </Paper>
  );
}
