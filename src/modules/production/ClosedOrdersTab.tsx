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
import { Print } from "@mui/icons-material";
import { money } from "../../data/format";
import { allocatedCost } from "../operationsData";
import type { ProductionCtx } from "./useProductionCtx";

export default function ClosedOrdersTab({ ctx }: { ctx: ProductionCtx }) {
  const { stock, canReopenOrders, printOrder, closedOrders, setReopenOrderId, setReopenModalOpen, setReopenReason } = ctx;
  return (
    <Paper sx={{ p: 3 }}>
      <Typography variant="h6" sx={{ mb: 2 }}>Órdenes cerradas · archivo de Supervisor</Typography>
      {closedOrders.length === 0 ? (
        <Alert severity="info">No hay órdenes cerradas.</Alert>
      ) : (
        <Table size="small">
          <TableHead><TableRow><TableCell>OT</TableCell><TableCell>Equipo / trabajo</TableCell><TableCell>Contrato / WBS</TableCell><TableCell>Técnico</TableCell><TableCell>Costos reales</TableCell><TableCell>Cerrado por</TableCell><TableCell>Fecha/Hora</TableCell><TableCell>Acción</TableCell></TableRow></TableHead>
          <TableBody>{closedOrders.map((order) => (
            <TableRow key={order.id} sx={{ opacity: 0.6, backgroundColor: "#f5f5f5" }}>
              <TableCell>{order.id}</TableCell><TableCell>{order.equipment}<Typography variant="caption" sx={{ display: "block" }}>{order.description}</Typography></TableCell>
              <TableCell>{order.contract}<Typography variant="caption" sx={{ display: "block" }}>{order.wbs}</Typography></TableCell>
              <TableCell>{order.assignees.map((assignee) => assignee.name).join(", ")}</TableCell><TableCell>{money(allocatedCost(order, stock))}</TableCell>
              <TableCell>{order.closedBy ?? "—"}</TableCell>
              <TableCell>{order.closedAt ? new Intl.DateTimeFormat("es-CL", { dateStyle: "short", timeStyle: "short" }).format(new Date(order.closedAt)) : "—"}</TableCell>
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
    </Paper>
  );
}
