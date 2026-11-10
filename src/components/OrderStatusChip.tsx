import { Chip } from "@mui/material";
import type { OrderStatus } from "../data/workOrders";

export function OrderStatusChip({ status }: { status: OrderStatus }) {
  const color = status === "Cerrada" ? "success" : status === "Cierre provisorio" ? "warning" : status === "En ejecución" ? "info" : "default";
  return <Chip size="small" label={status} color={color} />;
}
