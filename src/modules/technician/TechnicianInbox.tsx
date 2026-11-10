import { useMemo } from "react";
import { Alert, Box, Button, Chip, Paper, Stack, Table, TableBody, TableCell, TableHead, TableRow, Typography } from "@mui/material";
import { PlayArrow, Stop } from "@mui/icons-material";
import { can } from "../../app/permissions";
import type { Role } from "../../app/roles";
import { OrderStatusChip } from "../../components/OrderStatusChip";
import { durationLabel, money } from "../../data/format";
import {
  employeeForLogin, isAssignee, openEntryOf, operationHours, orderOperations, requestProvisionalClose,
  startOperation, stopOperation, typeLabels,
} from "../../data/workOrders";
import type { OperationEnv } from "../../data/workOrders";
import { useFeedback, useOperations } from "../../hooks/useOperations";
import { getEmployeeHourlyRate, readHrEmployees } from "../HumanResourcesPage";
import { allocatedCost } from "../operationsData";

// Bandeja del técnico: solo las OT donde es asignado; inicia/detiene operaciones y solicita el cierre provisorio.
export default function TechnicianInbox({ user, role }: { user: string; role: Role }) {
  const { entries, visibleOrders, stock, nowMs } = useOperations();
  const { message, error, setMessage, setError } = useFeedback();
  const canOperate = can(role, "order.operate");
  const showCosts = role !== "Técnico";
  const employees = useMemo(() => readHrEmployees(), []);
  const employee = employeeForLogin(employees, user);
  const env: OperationEnv = { employees, rateOf: (name) => getEmployeeHourlyRate(name, 0) };
  const openOrders = visibleOrders.filter((order) => order.status !== "Cerrada");
  // Un rol que no opera (consulta) sin empleado vinculado ve todas las OT; quien opera solo ve las suyas.
  const myOrders = employee ? openOrders.filter((order) => isAssignee(order, employee.id)) : canOperate && role === "Técnico" ? [] : openOrders;
  const myOpenEntry = employee ? openEntryOf(entries, employee.id) : undefined;

  const report = (outcome: { ok: true; value: unknown } | { ok: false; error: string }, success: string) => {
    if (outcome.ok) {
      setError("");
      setMessage(success);
    } else {
      setMessage("");
      setError(outcome.error);
    }
  };

  const start = (orderId: string, operationOrder: number) => {
    const paused = myOpenEntry && !(myOpenEntry.orderId === orderId && myOpenEntry.operationOrder === operationOrder)
      ? ` La operación anterior (${myOpenEntry.orderId} · ${myOpenEntry.operationName}) quedó en pausa.` : "";
    report(startOperation({ orderId, operationOrder }, { user, role }, env), `Operación iniciada en ${orderId}.${paused}`);
  };

  return (
    <Stack spacing={3}>
      <Box>
        <Typography variant="h4" sx={{ fontWeight: 700 }}>Bandeja de trabajo</Typography>
        <Typography color="text.secondary">Órdenes asignadas a ti. Registra el tiempo por operación; iniciar otra operación pausa la actual.</Typography>
      </Box>
      {message && <Alert severity="success">{message}</Alert>}
      {error && <Alert severity="error">{error}</Alert>}
      {!employee && <Alert severity="warning">
        Tu usuario ({user}) no está vinculado a un empleado en Recursos Humanos, por lo que no hay órdenes asignables ni registro de horas.
        Pide al administrador que vincule el usuario al colaborador.
      </Alert>}
      {myOpenEntry && <Alert severity="info">
        En curso: {myOpenEntry.orderId} · {myOpenEntry.operationName} · {durationLabel(Math.max(0, (nowMs - Date.parse(myOpenEntry.start)) / 1000))}
      </Alert>}
      {myOrders.length === 0 && <Alert severity="info">No tienes órdenes activas asignadas en este momento.</Alert>}
      {myOrders.map((order) => {
        const closed = order.status === "Cierre provisorio";
        return (
          <Paper key={order.id} sx={{ p: 3 }}>
            <Stack direction={{ xs: "column", md: "row" }} sx={{ justifyContent: "space-between", gap: 2, mb: 2 }}>
              <Box>
                <Typography variant="h6">{order.id} · {order.equipment}</Typography>
                <Typography variant="body2" color="text.secondary">{order.description}</Typography>
                <Typography variant="caption" color="text.secondary">
                  {typeLabels[order.type]} · {order.contract} · {order.wbs} · Programada {order.dueDate}
                  {order.assignees.length > 1 ? ` · Equipo: ${order.assignees.map((assignee) => assignee.name).join(", ")}` : ""}
                </Typography>
                {order.materials.length > 0 && <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
                  Materiales: {order.materials.map((item) => `${item.code} ${item.picked}/${item.required} ${item.unit ?? ""}`).join(" · ")}
                </Typography>}
              </Box>
              <Stack spacing={1} sx={{ alignItems: { md: "flex-end" } }}>
                <OrderStatusChip status={order.status} />
                <Typography variant="body2">Plan {order.projectedHours.toFixed(1)} h / real {durationLabel(order.currentSeconds)}</Typography>
                {showCosts && <Typography variant="body2">Costo real {money(allocatedCost(order, stock))}</Typography>}
              </Stack>
            </Stack>
            <Table size="small">
              <TableHead><TableRow>
                <TableCell>Operación</TableCell>
                <TableCell>Plan (h)</TableCell>
                <TableCell>Acumulado (h)</TableCell>
                <TableCell>Acciones</TableCell>
              </TableRow></TableHead>
              <TableBody>{orderOperations(order).map((operation) => {
                const running = myOpenEntry?.orderId === order.id && myOpenEntry.operationOrder === operation.order;
                return (
                  <TableRow key={`${order.id}-${operation.order}`}>
                    <TableCell>{operation.order ? `${operation.order}. ` : ""}{operation.name} {running && <Chip size="small" color="info" label="En curso" />}</TableCell>
                    <TableCell>{operation.durationHours.toFixed(1)}</TableCell>
                    <TableCell>{operationHours(order.id, operation.order, entries, nowMs).toFixed(2)}</TableCell>
                    <TableCell>
                      {canOperate && employee && !closed && (running
                        ? <Button size="small" color="warning" startIcon={<Stop />} onClick={() => report(stopOperation(order.id, { user, role }, env), `Operación detenida en ${order.id}.`)}>Detener</Button>
                        : <Button size="small" startIcon={<PlayArrow />} onClick={() => start(order.id, operation.order)}>Iniciar</Button>)}
                    </TableCell>
                  </TableRow>
                );
              })}</TableBody>
            </Table>
            {canOperate && employee && !closed && (
              <Button sx={{ mt: 2 }} size="small" variant="outlined" onClick={() => report(requestProvisionalClose(order.id, { user, role }, env), `${order.id} quedó pendiente de revisión y cierre del supervisor.`)}>
                Solicitar cierre provisorio
              </Button>
            )}
            {closed && <Typography variant="caption" color="text.secondary">Cierre provisorio solicitado; pendiente de Calidad y del supervisor.</Typography>}
          </Paper>
        );
      })}
    </Stack>
  );
}
