import { keys } from "../data/keys";
import { useMemo, useState } from "react";
import {
  Alert,
  Button,
  Chip,
  Grid,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import { Link } from "react-router-dom";
import { readPlannedCalls, routeStorageKey } from "./maintenanceData";
import type { RouteTemplate } from "./maintenanceData";
import { orderTimeTotals, readTimeEntries } from "../data/workOrders";
import { purchaseOrdersStorageKey, readStoredList } from "./supplyData";
import type { PurchaseOrder } from "./supplyData";
import type { Role } from "../app/roles";
import { readSession } from "../app/session";
import EacTable from "./pm/EacTable";
import PmDashboards from "./pm/PmDashboards";

type WorkOrder = {
  id: string;
  plannedCallId?: string;
  contract: string;
  wbs: string;
  equipment: string;
  type: string;
  status: string;
  consumedMaterials: { quantity: number; unitCost?: number }[];
};
type StockBin = {
  code: string;
  status: string;
  quantity: number;
  reserved?: number;
  location?: string;
  reference?: string;
};

const stockStorageKey = keys.warehouseBins;
const workOrdersStorageKey = keys.workOrders;
const demoStock: StockBin[] = [
  { code: "MAT-114", status: "Libre utilización", quantity: 9 },
  { code: "MAT-114", status: "Bloqueado calidad", quantity: 5 },
  { code: "MAT-114", status: "En tránsito", quantity: 12, reference: "31000001" },
  { code: "MAT-422", status: "Libre utilización", quantity: 54 },
  { code: "MAT-301", status: "Libre utilización", quantity: 18 },
];

function money(value: number): string {
  return new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 }).format(value);
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat("es-CL").format(date) : value;
}

export default function ProjectManagement({ role = "Supervisor" }: { role?: Role }) {
  const [calls] = useState(() => readPlannedCalls());
  const [routes] = useState(() => readStoredList<RouteTemplate>(routeStorageKey));
  const [orders] = useState(() => readStoredList<WorkOrder>(workOrdersStorageKey));
  const [timeEntries] = useState(() => readTimeEntries());
  const [nowMs] = useState(() => Date.now());
  const [stock] = useState(() => {
    const stored = readStoredList<StockBin>(stockStorageKey);
    return stored.length ? stored : demoStock;
  });
  const [purchaseOrders] = useState(() => readStoredList<PurchaseOrder>(purchaseOrdersStorageKey));
  const routeById = useMemo(
    () => new Map<string, RouteTemplate>(routes.map((route): [string, RouteTemplate] => [route.id, route])),
    [routes],
  );
  const completed = orders.filter((order) => order.status === "Cerrada");
  const pendingCalls = calls.filter((call) => {
    const order = orders.find((item) => item.plannedCallId === call.id);
    return !order || order.status !== "Cerrada";
  });
  const actualCost = completed.reduce((total, order) => total +
    orderTimeTotals(order.id, timeEntries, nowMs).laborCost +
    (order.consumedMaterials ?? []).reduce((sum, item) => sum + item.quantity * (item.unitCost ?? 0), 0), 0);
  const pmMonthlyTotals = useMemo(() => {
    const totals = new Map<string, { contract: string; year: string; month: string; calls: number; completed: number; cost: number }>();
    for (const call of calls) {
      const month = call.dueDate.slice(0, 7);
      const contract = call.plan.contract || "Sin contrato";
      const key = `${contract}|${month}`;
      const current = totals.get(key) ?? { contract, year: month.slice(0, 4), month, calls: 0, completed: 0, cost: 0 };
      current.calls += 1;
      const order = orders.find((item) => item.plannedCallId === call.id);
      if (order?.status === "Cerrada") {
        current.completed += 1;
        current.cost += orderTimeTotals(order.id, timeEntries, nowMs).laborCost +
          (order.consumedMaterials ?? []).reduce((sum, item) => sum + item.quantity * (item.unitCost ?? 0), 0);
      }
      totals.set(key, current);
    }
    return [...totals.values()].sort((a, b) => a.contract.localeCompare(b.contract) || a.month.localeCompare(b.month));
  }, [calls, orders, timeEntries, nowMs]);

  const materialAlerts = useMemo(() => {
    const demands = calls.flatMap((call) => {
      const route = routeById.get(call.routeId);
      if (!route) return [];
      const totals = new Map<string, { quantity: number; name: string }>();
      for (const material of route.operations.flatMap((operation) => operation.materials)) {
        const current = totals.get(material.code) ?? { quantity: 0, name: material.name };
        current.quantity += material.quantity;
        totals.set(material.code, current);
      }
      return [...totals.entries()].map(([code, value]) => ({ call, code, ...value }));
    }).sort((a, b) => a.call.dueDate.localeCompare(b.call.dueDate));
    const availableByCode = new Map<string, number>();
    for (const bin of stock) {
      if (bin.status !== "Libre utilización" ||
        ["REC-UBICAR", "REC-CALIDAD", "TRANSITO"].includes((bin.location ?? "").toUpperCase())) continue;
      availableByCode.set(bin.code, (availableByCode.get(bin.code) ?? 0) + Math.max(0, bin.quantity - (bin.reserved ?? 0)));
    }
    const ordersByCode = new Map<string, PurchaseOrder[]>();
    const openPurchaseCoverage = new Map<string, number>();
    for (const order of purchaseOrders.filter((item) => item.status === "Aprobada")) {
      const list = ordersByCode.get(order.materialCode) ?? [];
      list.push(order);
      ordersByCode.set(order.materialCode, list);
      openPurchaseCoverage.set(order.materialCode, (openPurchaseCoverage.get(order.materialCode) ?? 0) +
        Math.max(0, order.quantity - (order.receivedQuantity ?? 0)));
    }
    const knownOrderIds = new Set(purchaseOrders.map((order) => order.id));
    for (const bin of stock) {
      if (bin.status === "En tránsito" && !knownOrderIds.has(bin.reference ?? "")) {
        openPurchaseCoverage.set(bin.code, (openPurchaseCoverage.get(bin.code) ?? 0) + bin.quantity);
      }
    }
    for (const rows of ordersByCode.values()) rows.sort((a, b) => a.expectedDate.localeCompare(b.expectedDate));
    const receiptsUsed = new Map<string, number>();
    const alerts: { material: string; callId: string; date: string; shortage: number; unit: string }[] = [];
    for (const demand of demands) {
      const unit = routeById.get(demand.call.routeId)?.operations
        .flatMap((operation) => operation.materials).find((item) => item.code === demand.code)?.unit ?? "unidad";
      const approved = ordersByCode.get(demand.code) ?? [];
      let balance = availableByCode.get(demand.code) ?? 0;
      let receiptIndex = receiptsUsed.get(demand.code) ?? 0;
      while (receiptIndex < approved.length && approved[receiptIndex].expectedDate <= demand.call.dueDate) {
        const received = Math.max(0, approved[receiptIndex].quantity - (approved[receiptIndex].receivedQuantity ?? 0));
        balance += received;
        openPurchaseCoverage.set(demand.code, Math.max(0, (openPurchaseCoverage.get(demand.code) ?? 0) - received));
        receiptIndex += 1;
      }
      receiptsUsed.set(demand.code, receiptIndex);
      balance -= demand.quantity;
      availableByCode.set(demand.code, balance);
      if (balance < 0) {
        const shortage = Math.abs(balance);
        const coveredByOpenOrder = Math.min(shortage, openPurchaseCoverage.get(demand.code) ?? 0);
        openPurchaseCoverage.set(demand.code, Math.max(0, (openPurchaseCoverage.get(demand.code) ?? 0) - coveredByOpenOrder));
        if (shortage > coveredByOpenOrder) alerts.push({
          material: `${demand.code} · ${demand.name}`,
          callId: demand.call.id,
          date: demand.call.dueDate,
          shortage: shortage - coveredByOpenOrder,
          unit,
        });
      }
    }
    return alerts;
  }, [calls, purchaseOrders, routeById, stock]);

  return (
    <Stack spacing={3}>
      <div>
        <Typography variant="h4" sx={{ fontWeight: 700 }}>PM · control del proyecto</Typography>
        <Typography color="text.secondary">Seguimiento de mantenimientos del contrato, avance, costos reales y faltantes sin OC aprobada.</Typography>
        <Button component={Link} to="/compras" variant="outlined" sx={{ mt: 2 }}>Revisar y aprobar órdenes de compra</Button>
      </div>
      <Grid container spacing={2}>
        {[
          { label: "Llamadas planificadas", value: String(calls.length) },
          { label: "Mantenimientos terminados", value: String(completed.length) },
          { label: "Pendientes o en ejecución", value: String(pendingCalls.length) },
          { label: "Costo real de OT cerradas", value: money(actualCost) },
        ].map((item) => (
          <Grid size={{ xs: 12, sm: 6, md: 3 }} key={item.label}>
            <Paper sx={{ p: 2 }}>
              <Typography variant="body2" color="text.secondary">{item.label}</Typography>
              <Typography variant="h6" sx={{ mt: 1, fontWeight: 700 }}>{item.value}</Typography>
            </Paper>
          </Grid>
        ))}
      </Grid>
      {materialAlerts.length > 0 ? (
        <Alert severity="warning">
          {role === "PM Proyecto"
            ? `Hay ${materialAlerts.length} necesidades con faltante sin cobertura de OC aprobada.`
            : `Hay ${materialAlerts.length} necesidades con saldo insuficiente a la fecha requerida y sin OC aprobada o tránsito registrado que cubra el faltante.`}
        </Alert>
      ) : (
        <Alert severity="success">No hay faltantes de materiales sin cobertura de OC aprobada o tránsito registrado para las llamadas proyectadas.</Alert>
      )}
      <EacTable role={role} user={readSession()?.user ?? role} />
      <PmDashboards />
      <Paper sx={{ p: 3 }}>
        <Typography variant="h6" sx={{ mb: 2 }}>{role === "PM Proyecto" ? "Resumen de mantenimiento por contrato, mes y año" : "Avance de mantenimiento por llamada"}</Typography>
        {role === "PM Proyecto" ? (
          <Table size="small">
            <TableHead><TableRow><TableCell>Contrato</TableCell><TableCell>Año</TableCell><TableCell>Mes</TableCell><TableCell align="right">Llamadas</TableCell><TableCell align="right">Terminadas</TableCell><TableCell align="right">Costo real</TableCell></TableRow></TableHead>
            <TableBody>{pmMonthlyTotals.map((item) => <TableRow key={`${item.contract}-${item.month}`}><TableCell>{item.contract}</TableCell><TableCell>{item.year}</TableCell><TableCell>{new Intl.DateTimeFormat("es-CL", { month: "long" }).format(new Date(`${item.month}-15T12:00:00`))}</TableCell><TableCell align="right">{item.calls}</TableCell><TableCell align="right">{item.completed}</TableCell><TableCell align="right">{money(item.cost)}</TableCell></TableRow>)}</TableBody>
          </Table>
        ) : calls.length === 0 ? (
          <Alert severity="info">Sin llamadas cargadas. Crea y guarda un plan en Planning para iniciar el seguimiento.</Alert>
        ) : (
          <Table size="small">
            <TableHead><TableRow>
              <TableCell>Fecha</TableCell><TableCell>Llamada / equipo</TableCell><TableCell>Contrato / WBS</TableCell>
              <TableCell>Orden</TableCell><TableCell>Estado</TableCell><TableCell align="right">Costo real OT</TableCell>
            </TableRow></TableHead>
            <TableBody>{calls.map((call) => {
              const order = orders.find((item) => item.plannedCallId === call.id);
              const orderCost = order
                ? orderTimeTotals(order.id, timeEntries, nowMs).laborCost +
                  (order.consumedMaterials ?? []).reduce((sum, item) => sum + item.quantity * (item.unitCost ?? 0), 0)
                : 0;
              return (
                <TableRow key={call.id}>
                  <TableCell>{formatDate(call.dueDate)}</TableCell>
                  <TableCell>{call.id}<Typography variant="caption" sx={{ display: "block" }}>{call.plan.equipmentId} · {call.plan.name}</Typography></TableCell>
                  <TableCell>{call.plan.contract || "—"}<Typography variant="caption" sx={{ display: "block" }}>{call.plan.wbs || "Sin WBS"}</Typography></TableCell>
                  <TableCell>{order?.id ?? "Aún no creada"}</TableCell>
                  <TableCell><Chip size="small" label={order?.status ?? "Pendiente"} color={order?.status === "Cerrada" ? "success" : order ? "warning" : "default"} /></TableCell>
                  <TableCell align="right">{order ? money(orderCost) : "—"}</TableCell>
                </TableRow>
              );
            })}</TableBody>
          </Table>
        )}
      </Paper>
      {materialAlerts.length > 0 && role !== "PM Proyecto" && (
        <Paper sx={{ p: 3 }}>
          <Typography variant="h6" sx={{ mb: 2 }}>Alertas de materiales sin OC</Typography>
          <Table size="small">
            <TableHead><TableRow><TableCell>Material</TableCell><TableCell>Llamada</TableCell><TableCell>Fecha requerida</TableCell><TableCell align="right">Faltante</TableCell></TableRow></TableHead>
            <TableBody>{materialAlerts.map((item, index) => (
              <TableRow key={`${item.callId}-${item.material}-${index}`}>
                <TableCell>{item.material}</TableCell><TableCell>{item.callId}</TableCell>
                <TableCell>{formatDate(item.date)}</TableCell><TableCell align="right">{item.shortage} {item.unit}</TableCell>
              </TableRow>
            ))}</TableBody>
          </Table>
        </Paper>
      )}
      <Alert severity="info">El costo real refleja horas registradas y consumos valorizados en la OT. Las OC pendientes de aprobación no se consideran cobertura MRP.</Alert>
    </Stack>
  );
}
