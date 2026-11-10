import { useState } from "react";
import {
  Alert,
  Box,
  Button,
  Checkbox,
  FormControlLabel,
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
import { can } from "../../app/permissions";
import type { Role } from "../../app/roles";
import { OrderStatusChip } from "../../components/OrderStatusChip";
import { useFeedback, useOperations } from "../../hooks/useOperations";
import type { Feedback } from "../../hooks/useOperations";
import { qualityCheckItems, releaseQualityLot } from "../operationsData";
import type { WorkOrder } from "../operationsData";
import QualityRecordsTab from "./QualityRecordsTab";

type QualityProps = { user: string; role: Role } & Feedback;

function InspectionTab({ user, role, setMessage, setError }: QualityProps) {
  const { orders, updateOrder } = useOperations();
  const [selectedQualityOrderId, setSelectedQualityOrderId] = useState("");
  const canInspect = can(role, "quality.inspect");
  const qualityOrders = orders.filter((order) => order.type !== "ESPERA" && order.status !== "Cerrada");
  const selectedQualityOrder = qualityOrders.find((order) => order.id === selectedQualityOrderId) ?? qualityOrders[0];

  const updateQualityCheck = (orderId: string, item: string, checked: boolean) => {
    if (!canInspect) {
      setError("Solo Calidad o Administrador puede modificar el checklist.");
      return;
    }
    updateOrder(orderId, (order) => ({
      ...order,
      qualityChecklist: { ...(order.qualityChecklist ?? {}), [item]: checked },
      qualityApproved: false,
      qualityApprovedBy: null,
    }));
    setError("");
  };

  const approveQuality = (order: WorkOrder) => {
    if (!canInspect) {
      setError("Solo Calidad o Administrador puede aprobar la inspección.");
      return;
    }
    if (order.status !== "Cierre provisorio") {
      setError("La OT debe estar en cierre provisorio antes de solicitar aprobación de Calidad.");
      return;
    }
    if (!qualityCheckItems.every((item) => order.qualityChecklist?.[item])) {
      setError(`Completa todos los puntos del checklist para ${order.id}.`);
      return;
    }
    updateOrder(order.id, (current) => ({
      ...current,
      qualityApproved: true,
      qualityApprovedBy: user,
    }));
    setMessage(`Checklist de ${order.id} aprobado por ${user}; queda habilitado para cierre de Supervisor.`);
    setError("");
  };

  return (
    <Paper sx={{ p: 3 }}>
      <Typography variant="h6" sx={{ mb: 2 }}>Lista de inspecciones</Typography>
      {qualityOrders.length === 0 ? <Alert severity="success">No hay órdenes pendientes de inspección.</Alert> : (
        <Table size="small">
          <TableHead><TableRow><TableCell>OT</TableCell><TableCell>Equipo</TableCell><TableCell>Contrato</TableCell><TableCell>Estado</TableCell><TableCell>Checklist</TableCell><TableCell /></TableRow></TableHead>
          <TableBody>{qualityOrders.map((order) => (
            <TableRow key={order.id} selected={selectedQualityOrder?.id === order.id}>
              <TableCell>{order.id}</TableCell><TableCell>{order.equipment}</TableCell><TableCell>{order.contract}</TableCell>
              <TableCell><OrderStatusChip status={order.status} /></TableCell>
              <TableCell>{qualityCheckItems.filter((item) => order.qualityChecklist?.[item]).length}/{qualityCheckItems.length}</TableCell>
              <TableCell><Button size="small" onClick={() => setSelectedQualityOrderId(order.id)}>Abrir</Button></TableCell>
            </TableRow>
          ))}</TableBody>
        </Table>
      )}
      {selectedQualityOrder && (
        <Paper variant="outlined" sx={{ p: 2, mt: 2 }}>
          <Typography sx={{ fontWeight: 700 }}>{selectedQualityOrder.id} · {selectedQualityOrder.equipment}</Typography>
          <Typography variant="caption" color="text.secondary">{selectedQualityOrder.contract} / {selectedQualityOrder.wbs}</Typography>
          {qualityCheckItems.map((item) => (
            <FormControlLabel key={`${selectedQualityOrder.id}-${item}`} control={<Checkbox checked={Boolean(selectedQualityOrder.qualityChecklist?.[item])} disabled={!canInspect} onChange={(event) => updateQualityCheck(selectedQualityOrder.id, item, event.target.checked)} />} label={item} />
          ))}
          <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "center", mt: 1 }}>
            <Typography variant="caption" color={selectedQualityOrder.qualityApproved ? "success.main" : "text.secondary"}>
              {selectedQualityOrder.qualityApproved ? `Aprobada por ${selectedQualityOrder.qualityApprovedBy}` : "Pendiente de aprobación"}
            </Typography>
            <Button variant="contained" size="small" disabled={!canInspect || selectedQualityOrder.status !== "Cierre provisorio" || selectedQualityOrder.qualityApproved || !qualityCheckItems.every((item) => selectedQualityOrder.qualityChecklist?.[item])} onClick={() => approveQuality(selectedQualityOrder)}>Aprobar checklist</Button>
          </Stack>
        </Paper>
      )}
    </Paper>
  );
}

function MaterialReleaseTab({ user, role, setMessage, setError }: QualityProps) {
  const { stock } = useOperations();
  const canInspect = can(role, "quality.inspect");

  const releaseQualityStock = (binId: string) => {
    const result = releaseQualityLot(binId, role, user);
    if (!result) return;
    if (result.ok) {
      setMessage(result.message);
      setError("");
    } else {
      setError(result.error);
    }
  };

  return (
    <Paper sx={{ p: 3 }}>
      <Typography variant="h6" sx={{ mb: 1 }}>Materiales en espera de Calidad</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>La liberación cambia su estado a libre utilización, pero permanece fuera de picking hasta asignar ubicación física.</Typography>
      <Table size="small">
        <TableHead><TableRow><TableCell>Material</TableCell><TableCell>Ubicación</TableCell><TableCell>OC / referencia</TableCell><TableCell align="right">Cantidad</TableCell><TableCell>Acción</TableCell></TableRow></TableHead>
        <TableBody>{stock.filter((bin) => bin.status === "Bloqueado calidad").map((bin) => (
          <TableRow key={bin.id}>
            <TableCell>{bin.code} · {bin.name}</TableCell>
            <TableCell>{bin.warehouse} · {bin.location}</TableCell>
            <TableCell>{bin.reference ?? bin.id}</TableCell>
            <TableCell align="right">{bin.quantity} {bin.unit}</TableCell>
            <TableCell>{canInspect
              ? <Button size="small" onClick={() => releaseQualityStock(bin.id)}>Liberar lote</Button>
              : "Solo consulta"}
            </TableCell>
          </TableRow>
        ))}</TableBody>
      </Table>
      {stock.every((bin) => bin.status !== "Bloqueado calidad") &&
        <Alert severity="success" sx={{ mt: 2 }}>No quedan lotes bloqueados por Calidad.</Alert>}
    </Paper>
  );
}

export default function QualityPage({ user, role }: { user: string; role: Role }) {
  const [tab, setTab] = useState(0);
  const { message, error, setMessage, setError } = useFeedback();
  const canInspect = can(role, "quality.inspect");
  const feedback = { user, role, setMessage, setError };

  return (
    <Stack spacing={3}>
      <Box>
        <Typography variant="h4" sx={{ fontWeight: 700 }}>Calidad e inspecciones</Typography>
        <Typography color="text.secondary">Demostración con datos ficticios del contrato CT1234.</Typography>
      </Box>
      <Alert severity="warning">
        Prototipo local: estos datos de prueba se guardan en este navegador. Costos, roles, permisos e inventario requieren validación de backend antes de producción.
      </Alert>
      {message && <Alert severity="success">{message}</Alert>}
      {error && <Alert severity="error">{error}</Alert>}
      <Alert severity={canInspect ? "info" : "warning"}>
        {canInspect
          ? "Calidad valida el checklist de la OT y libera lotes bloqueados. El cierre final queda a cargo del Supervisor."
          : "Vista de consulta: solo Calidad o Administrador puede cambiar checklist y liberar materiales."}
      </Alert>
      <Paper sx={{ px: 2 }}>
        <Tabs value={tab} onChange={(_, value: number) => setTab(value)} variant="scrollable" allowScrollButtonsMobile>
          <Tab value={0} label="Inspección OT" />
          <Tab value={1} label="Liberación de materiales" />
          <Tab value={2} label="Registros de inspección" />
        </Tabs>
      </Paper>
      {tab === 0 && <InspectionTab {...feedback} />}
      {tab === 1 && <MaterialReleaseTab {...feedback} />}
      {tab === 2 && <QualityRecordsTab />}
    </Stack>
  );
}
