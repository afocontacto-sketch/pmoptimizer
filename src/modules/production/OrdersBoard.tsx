import { useState } from "react";
import {
  Alert,
  Box,
  Button,
  Paper,
  Stack,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Tabs,
  Typography,
} from "@mui/material";
import { Download, Print } from "@mui/icons-material";
import { downloadTemplate } from "../../data/csv";
import { durationLabel, money } from "../../data/format";
import { typeLabels } from "../../data/workOrders";
import { OrderStatusChip } from "../../components/OrderStatusChip";
import { allocatedCost } from "../operationsData";
import type { ProductionCtx } from "./useProductionCtx";

export default function OrdersBoard({ ctx }: { ctx: ProductionCtx }) {
  const {
    role, stock, isSupervisor, canCloseOrders, openOrders, closedOrders,
    canReopenOrders, printOrder, supervisorClose, setReopenOrderId, setReopenModalOpen, setReopenReason,
  } = ctx;
  const [operationsTab, setOperationsTab] = useState(0);
  const exportOrderTemplate = () => downloadTemplate("plantilla_ordenes_trabajo.csv",
    ["contract", "type", "equipment", "description", "technician", "projectedHours"],
    ["CT1234", "PRE", "VEH-004", "Servicio preventivo", "Camila Rojas", 3.5]);

  return (
    <>
      <Paper sx={{ p: 3 }}>
        <Stack direction={{ xs: "column", md: "row" }} sx={{ justifyContent: "space-between", alignItems: { xs: "flex-start", md: "center" }, gap: 2, mb: 2 }}>
          <Box>
            <Typography variant="h6">Bandeja de trabajo</Typography>
            <Typography variant="body2" color="text.secondary">
              {isSupervisor
                ? "Revisa las órdenes asignadas a tu equipo y asígnalas a los trabajadores a tu cargo."
                : "El técnico registra su tiempo; el cierre provisorio requiere aprobación de Calidad y cierre administrativo."}
            </Typography>
          </Box>
          {!isSupervisor && <Button startIcon={<Download />} onClick={exportOrderTemplate}>Plantilla CSV de OT</Button>}
        </Stack>
        <Box sx={{ borderBottom: 1, borderColor: "divider", mb: 2 }}>
          <Tabs value={operationsTab} onChange={(_, value: number) => setOperationsTab(value)}>
            <Tab label={`Órdenes Activas (${openOrders.length})`} value={0} />
            {(isSupervisor || role === "Administrador") && <Tab label={`Órdenes Cerradas (${closedOrders.length})`} value={1} />}
          </Tabs>
        </Box>
        {operationsTab === 0 && (
        <>
        <Table size="small">
          <TableHead><TableRow>
            <TableCell>OT / equipo</TableCell>
            {!isSupervisor && <TableCell>Contrato / WBS</TableCell>}
            <TableCell>Tipo / estado</TableCell>
            <TableCell>{isSupervisor ? "Trabajador asignado" : "Técnico / tarifa"}</TableCell>
            {!isSupervisor && <><TableCell>Tiempo plan / real</TableCell><TableCell align="right">Costo real</TableCell></>}
            <TableCell>Acciones</TableCell>
          </TableRow></TableHead>
          <TableBody>{openOrders.map((order) => (
            <TableRow key={order.id}>
              <TableCell>
                <Typography sx={{ fontWeight: 700 }}>{order.id}</Typography>
                <Typography variant="caption" color="text.secondary">{order.equipment}</Typography>
                <Typography sx={{ display: "block" }} variant="caption">{order.description}</Typography>
                {!isSupervisor && order.routeName && <Typography sx={{ display: "block" }} variant="caption" color="primary.main">Ruta {order.routeId} · {order.routeName}</Typography>}
                {order.materials.length > 0 && <Typography sx={{ display: "block" }} variant="caption" color="text.secondary">Materiales requeridos: {order.materials.map((item) => `${item.code} ${item.required} ${item.unit ?? ""}`).join(" · ")}</Typography>}
                {!isSupervisor && order.routeOperations?.map((operation) => (
                  <Typography key={`${order.id}-${operation.order}`} sx={{ display: "block" }} variant="caption" color="text.secondary">
                    {operation.order}. {operation.name} · {operation.durationHours} h
                  </Typography>
                ))}
              </TableCell>
              {!isSupervisor && <TableCell>{order.contract}<Typography sx={{ display: "block" }} variant="caption" color="text.secondary">{order.wbs || "No imputable"}</Typography></TableCell>}
              <TableCell>
                {typeLabels[order.type]}
                <Typography sx={{ display: "block", mt: 0.5 }}><OrderStatusChip status={order.status} /></Typography>
                {!isSupervisor && order.qualityApproved && <Typography variant="caption" color="success.main">Calidad OK · {order.qualityApprovedBy}</Typography>}
              </TableCell>
              <TableCell>
                {order.assignees.map((assignee) => assignee.name).join(", ") || "Sin asignar"}
              </TableCell>
              {!isSupervisor && <><TableCell>{order.projectedHours.toFixed(1)} h / {durationLabel(order.currentSeconds)}</TableCell><TableCell align="right">{money(allocatedCost(order, stock))}</TableCell></>}
              <TableCell>
                <Stack direction="row" sx={{ flexWrap: "wrap", gap: 1 }}>
                  {canCloseOrders && order.status === "Cierre provisorio" && <Button size="small" variant="contained" color="success" onClick={() => supervisorClose(order.id)}>Cerrar OT</Button>}
                  <Button size="small" startIcon={<Print />} onClick={() => printOrder(order)}>Imprimir OT</Button>
                </Stack>
                {!isSupervisor && order.closedBy && <Typography variant="caption">Cerró: {order.closedBy}</Typography>}
              </TableCell>
            </TableRow>
          ))}</TableBody>
        </Table>
        {openOrders.length === 0 && <Alert severity="info" sx={{ mt: 2 }}>No hay órdenes activas en este momento.</Alert>}
        </>
        )}
        
        {operationsTab === 1 && (isSupervisor || role === "Administrador") && (
        <Box>
          {closedOrders.length === 0 ? (
            <Alert severity="info">No hay órdenes cerradas.</Alert>
          ) : (
            <Table size="small">
              <TableHead><TableRow><TableCell>OT</TableCell><TableCell>Equipo / trabajo</TableCell><TableCell>Contrato / WBS</TableCell><TableCell>Técnico</TableCell><TableCell>Costos reales</TableCell><TableCell>Cerrado por</TableCell><TableCell>Fecha/Hora</TableCell><TableCell>Historial</TableCell><TableCell>Acción</TableCell></TableRow></TableHead>
              <TableBody>{closedOrders.map((order) => (
                <TableRow key={order.id} sx={{ opacity: 0.7, backgroundColor: "#f5f5f5" }}>
                  <TableCell>{order.id}</TableCell>
                  <TableCell>{order.equipment}<Typography variant="caption" sx={{ display: "block" }}>{order.description}</Typography></TableCell>
                  <TableCell>{order.contract}<Typography variant="caption" sx={{ display: "block" }}>{order.wbs}</Typography></TableCell>
                  <TableCell>{order.assignees.map((assignee) => assignee.name).join(", ")}</TableCell>
                  <TableCell>{money(allocatedCost(order, stock))}</TableCell>
                  <TableCell>{order.closedBy ?? "—"}</TableCell>
                  <TableCell>{order.closedAt ? new Intl.DateTimeFormat("es-CL", { dateStyle: "short", timeStyle: "short" }).format(new Date(order.closedAt)) : "—"}</TableCell>
                  <TableCell>
                    {order.statusHistory && order.statusHistory.length > 0 ? (
                      <Stack spacing={0.5}>
                        {order.statusHistory.map((record, idx) => (
                          <Typography key={idx} variant="caption" sx={{ display: "block" }}>
                            {record.previousStatus} → {record.newStatus}
                            {record.reason && ` (${record.reason})`}
                          </Typography>
                        ))}
                      </Stack>
                    ) : "—"}
                  </TableCell>
                  <TableCell>
                    <Button size="small" startIcon={<Print />} onClick={() => printOrder(order)}>Imprimir OT</Button>
                    {canReopenOrders && (
                      <Button size="small" variant="outlined" onClick={() => {
                        setReopenOrderId(order.id);
                        setReopenModalOpen(true);
                        setReopenReason("");
                      }}>
                        Reabrir
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}</TableBody>
            </Table>
          )}
        </Box>
        )}
      </Paper>
      {!isSupervisor && operationsTab === 0 && <Alert severity="info">El cierre final requiere aprobación de Calidad y luego un Administrador.</Alert>}
    </>
  );
}
