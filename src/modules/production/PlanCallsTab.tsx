import {
  Alert,
  Button,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import { createWorkOrder } from "../../data/workOrders";
import type { PlannedCallRecord } from "../maintenanceData";
import { materialsForRoute, routeLaborCost } from "../operationsData";
import type { ProductionCtx } from "./useProductionCtx";

export default function PlanCallsTab({ ctx }: { ctx: ProductionCtx }) {
  const { user, role, orders, routes, plannedCalls, contracts, canCreate, setError, setMessage } = ctx;

  const createOrderFromCall = (call: PlannedCallRecord) => {
    if (!canCreate) {
      setError("Tu rol no tiene permiso para crear OT desde llamadas de mantenimiento.");
      return;
    }
    const route = routes.find((item) => item.id === call.routeId);
    if (!route) {
      setError(`La llamada ${call.id} referencia una hoja de ruta que ya no existe (${call.routeId}).`);
      return;
    }
    if (orders.some((order) => order.plannedCallId === call.id)) {
      setError(`La llamada ${call.id} ya tiene una OT asociada.`);
      return;
    }
    const contract = contracts.find((item) => item.code === call.plan.contract) ?? contracts[0];
    const wbsElement = contract.wbs.find((item) => item.code === call.plan.wbs);
    const orderType = wbsElement?.type && wbsElement.type !== "ESPERA" ? wbsElement.type : "PRE";
const result = createWorkOrder({      contract: contract.code,      wbs: call.plan.wbs || contract.wbs.find((item) => item.type === orderType)?.code || "",      planId: call.plan.id,      plannedCallId: call.id,      routeId: route.id,      routeName: route.name,      routeOperations: route.operations,      type: orderType,      equipment: call.plan.equipmentId,      description: `Llamada ${call.id} · ${call.plan.name} · fecha requerida ${call.dueDate.slice(0, 10)}`,      projectedHours: route.operations.reduce((sum, operation) => sum + operation.durationHours, 0),      projectedLaborCost: routeLaborCost(route),      materials: materialsForRoute(route),      dueDate: call.dueDate.slice(0, 10),    }, { user, role });    if (!result.ok) {      setError(result.error);      return;    }    const id = result.value.id;
    setMessage(`OT ${id} creada desde ${call.id} con hoja ${route.id}; sus materiales ya están disponibles para picking.`);
    setError("");
  };


  return (
    <Paper sx={{ p: 3 }}>
      <Typography variant="h6">Llamadas de planes de mantenimiento</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Crea la OT desde una llamada para copiar su equipo, contrato, hoja de ruta, horas y materiales requeridos.
      </Typography>
      {plannedCalls.filter((call) => !orders.some((order) => order.plannedCallId === call.id)).length === 0 ? (
        <Alert severity="info">No hay llamadas nuevas. Crea o revisa un plan de mantenimiento para generar necesidades futuras.</Alert>
      ) : (
        <Table size="small">
          <TableHead><TableRow><TableCell>Fecha requerida</TableCell><TableCell>Llamada / plan</TableCell><TableCell>Equipo</TableCell><TableCell>Hoja de ruta</TableCell><TableCell>Contrato / WBS</TableCell><TableCell /></TableRow></TableHead>
          <TableBody>{plannedCalls
            .filter((call) => !orders.some((order) => order.plannedCallId === call.id))
            .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
            .slice(0, 20)
            .map((call) => (
              <TableRow key={call.id}>
                <TableCell>{new Intl.DateTimeFormat("es-CL").format(new Date(call.dueDate))}</TableCell>
                <TableCell>{call.id}<Typography variant="caption" sx={{ display: "block" }}>{call.plan.name}</Typography></TableCell>
                <TableCell>{call.plan.equipmentId}</TableCell>
                <TableCell>{routes.find((route) => route.id === call.routeId)?.name ?? call.routeId}</TableCell>
                <TableCell>{call.plan.contract}<Typography variant="caption" sx={{ display: "block" }}>{call.plan.wbs}</Typography></TableCell>
                <TableCell><Button size="small" variant="contained" onClick={() => createOrderFromCall(call)}>Crear OT</Button></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </Paper>
  );
}
