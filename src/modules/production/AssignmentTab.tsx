import {
  Alert,
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
import type { ProductionCtx } from "./useProductionCtx";

export default function AssignmentTab({ ctx }: { ctx: ProductionCtx }) {
  const { visibleOrders, supervisorCanSeeOrder, assignableTeam, assignmentDrafts, setAssignmentDrafts, assignOrderToTeamMember } = ctx;
  return (
    <Paper sx={{ p: 3 }}>
      <Typography variant="h6" sx={{ mb: 2 }}>Órdenes de trabajo del equipo</Typography>
      {visibleOrders.filter((order) => order.status !== "Cerrada" && supervisorCanSeeOrder(order)).length === 0 ? (
        <Alert severity="info">No hay órdenes abiertas para los contratos o trabajadores de tu equipo.</Alert>
      ) : (
        <Table size="small">
          <TableHead><TableRow><TableCell>OT / equipo</TableCell><TableCell>Trabajo</TableCell><TableCell>Estado</TableCell><TableCell>Asignado a</TableCell><TableCell>Asignar trabajador</TableCell></TableRow></TableHead>
          <TableBody>{visibleOrders.filter((order) => order.status !== "Cerrada" && supervisorCanSeeOrder(order)).map((order) => (
            <TableRow key={order.id}>
              <TableCell>{order.id}<Typography variant="caption" sx={{ display: "block" }}>{order.equipment}</Typography></TableCell>
              <TableCell>{order.description}</TableCell>
              <TableCell><OrderStatusChip status={order.status} /></TableCell>
              <TableCell>{order.assignees[0]?.name || "Sin asignar"}</TableCell>
              <TableCell>
                {order.status === "Asignada" && assignableTeam.length > 0 ? (
                  <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                    <TextField select size="small" label="Trabajador" value={assignmentDrafts[order.id] ?? assignableTeam.find((employee) => employee.name === order.assignees[0]?.name)?.id ?? assignableTeam[0].id} onChange={(event) => setAssignmentDrafts((current) => ({ ...current, [order.id]: event.target.value }))}>
                      {assignableTeam.map((employee) => <MenuItem key={employee.id} value={employee.id}>{employee.name}</MenuItem>)}
                    </TextField>
                    <Button size="small" variant="contained" onClick={() => assignOrderToTeamMember(order)}>Asignar</Button>
                  </Stack>
                ) : order.status === "Asignada" ? "No hay técnicos directos configurados" : "Solo consulta"}
              </TableCell>
            </TableRow>
          ))}</TableBody>
        </Table>
      )}
    </Paper>
  );
}
