import { Alert, Box, Button, Paper, Stack, Table, TableBody, TableCell, TableHead, TableRow, Typography } from "@mui/material";
import { PlayArrow, Stop } from "@mui/icons-material";
import { can } from "../../app/permissions";
import type { Role } from "../../app/roles";
import { OrderStatusChip } from "../../components/OrderStatusChip";
import { durationLabel, money } from "../../data/format";
import { typeLabels } from "../../data/workOrders";
import { useFeedback, useOperations } from "../../hooks/useOperations";
import { allocatedCost } from "../operationsData";

// Bandeja del operador: cronómetro por OT y solicitud de cierre provisorio.
export default function TechnicianInbox({ role }: { user: string; role: Role }) {
  const { orders, visibleOrders, stock, updateOrder } = useOperations();
  const { message, error, setMessage, setError } = useFeedback();
  const canOperate = can(role, "order.operate");
  const activeOrder = orders.find((order) => order.timerStartedAt !== null);
  const openOrders = visibleOrders.filter((order) => order.status !== "Cerrada");

  const startTimer = (orderId: string) => {
    if (!canOperate) {
      setError("Tu rol no tiene permiso para registrar horas de trabajo.");
      return;
    }
    if (activeOrder && activeOrder.id !== orderId) {
      setError(`Detén primero el cronómetro de ${activeOrder.id}.`);
      return;
    }
    setError("");
    updateOrder(orderId, (order) => ({
      ...order,
      timerStartedAt: order.timerStartedAt ?? Date.now(),
      status: "En ejecución",
    }));
    setMessage(`Registro de tiempo iniciado en ${orderId}.`);
  };

  const stopTimer = (orderId: string) => {
    if (!canOperate) {
      setError("Tu rol no tiene permiso para registrar horas de trabajo.");
      return;
    }
    const order = orders.find((item) => item.id === orderId);
    if (!order?.timerStartedAt) return;
    const seconds = Math.max(0, Math.floor((Date.now() - order.timerStartedAt) / 1000));
    updateOrder(orderId, (item) => ({
      ...item,
      elapsedSeconds: item.elapsedSeconds + seconds,
      timerStartedAt: null,
      status: item.status === "En ejecución" ? "Asignada" : item.status,
    }));
    setMessage(`Tiempo registrado: ${durationLabel(seconds)} en ${orderId}.`);
  };

  const provisionalClose = (orderId: string) => {
    if (!canOperate) {
      setError("Tu rol no tiene permiso para solicitar el cierre provisorio.");
      return;
    }
    const order = orders.find((item) => item.id === orderId);
    if (order?.timerStartedAt) {
      setError("Detén el cronómetro antes de solicitar el cierre provisorio.");
      return;
    }
    updateOrder(orderId, (item) => ({ ...item, status: "Cierre provisorio" }));
    setMessage(`${orderId} quedó pendiente de revisión y cierre del supervisor.`);
    setError("");
  };


  return (
    <Stack spacing={3}>
      <Box>
        <Typography variant="h4" sx={{ fontWeight: 700 }}>Operaciones y órdenes de trabajo</Typography>
        <Typography color="text.secondary">Demostración con datos ficticios del contrato CT1234.</Typography>
      </Box>
      <Alert severity="warning">
        Prototipo local: estos datos de prueba se guardan en este navegador. Costos, roles, permisos e inventario requieren validación de backend antes de producción.
      </Alert>
      {message && <Alert severity="success">{message}</Alert>}
      {error && <Alert severity="error">{error}</Alert>}
      <Paper sx={{ p: 3 }}>
        <Box sx={{ mb: 2 }}>
          <Typography variant="h6">Bandeja de trabajo</Typography>
          <Typography variant="body2" color="text.secondary">
            El técnico registra su tiempo; el cierre provisorio requiere aprobación de Calidad y cierre administrativo.
          </Typography>
        </Box>
        <Table size="small">
          <TableHead><TableRow>
            <TableCell>OT / equipo</TableCell>
            <TableCell>Contrato / WBS</TableCell>
            <TableCell>Tipo / estado</TableCell>
            <TableCell>Técnico / tarifa</TableCell>
            <TableCell>Tiempo plan / real</TableCell>
            <TableCell align="right">Costo real</TableCell>
            <TableCell>Acciones</TableCell>
          </TableRow></TableHead>
          <TableBody>{openOrders.map((order) => (
            <TableRow key={order.id}>
              <TableCell>
                <Typography sx={{ fontWeight: 700 }}>{order.id}</Typography>
                <Typography variant="caption" color="text.secondary">{order.equipment}</Typography>
                <Typography sx={{ display: "block" }} variant="caption">{order.description}</Typography>
                {order.routeName && <Typography sx={{ display: "block" }} variant="caption" color="primary.main">Ruta {order.routeId} · {order.routeName}</Typography>}
                {order.materials.length > 0 && <Typography sx={{ display: "block" }} variant="caption" color="text.secondary">Materiales requeridos: {order.materials.map((item) => `${item.code} ${item.required} ${item.unit ?? ""}`).join(" · ")}</Typography>}
                {order.routeOperations?.map((operation) => (
                  <Typography key={`${order.id}-${operation.order}`} sx={{ display: "block" }} variant="caption" color="text.secondary">
                    {operation.order}. {operation.name} · {operation.durationHours} h
                  </Typography>
                ))}
              </TableCell>
              <TableCell>{order.contract}<Typography sx={{ display: "block" }} variant="caption" color="text.secondary">{order.wbs || "No imputable"}</Typography></TableCell>
              <TableCell>
                {typeLabels[order.type]}
                <Typography sx={{ display: "block", mt: 0.5 }}><OrderStatusChip status={order.status} /></Typography>
                {order.qualityApproved && <Typography variant="caption" color="success.main">Calidad OK · {order.qualityApprovedBy}</Typography>}
              </TableCell>
              <TableCell>
                {order.assignees[0]?.name || "Sin asignar"}
                <Typography sx={{ display: "block" }} variant="caption" color="text.secondary">{money(order.hourlyRate)}/h</Typography>
              </TableCell>
              <TableCell>{order.projectedHours.toFixed(1)} h / {durationLabel(order.currentSeconds)}</TableCell>
              <TableCell align="right">{money(allocatedCost(order, stock, order.currentSeconds))}</TableCell>
              <TableCell>
                <Stack direction="row" sx={{ flexWrap: "wrap", gap: 1 }}>
                  {!order.timerStartedAt && order.status !== "Cierre provisorio" && <Button size="small" startIcon={<PlayArrow />} onClick={() => startTimer(order.id)}>Iniciar</Button>}
                  {order.timerStartedAt && <Button size="small" color="warning" startIcon={<Stop />} onClick={() => stopTimer(order.id)}>Detener</Button>}
                  {order.status !== "Cierre provisorio" && <Button size="small" onClick={() => provisionalClose(order.id)}>Cierre provisorio</Button>}
                </Stack>
              </TableCell>
            </TableRow>
          ))}</TableBody>
        </Table>
        {activeOrder && <Alert severity="info" sx={{ mt: 2 }}>Cronómetro activo: {activeOrder.id} · {durationLabel(visibleOrders.find((order) => order.id === activeOrder.id)?.currentSeconds ?? 0)}.</Alert>}
        {openOrders.length === 0 && <Alert severity="info" sx={{ mt: 2 }}>No hay órdenes activas en este momento.</Alert>}
      </Paper>
      <Alert severity="info">El cierre final requiere aprobación de Calidad y luego un Administrador.</Alert>
    </Stack>
  );
}
