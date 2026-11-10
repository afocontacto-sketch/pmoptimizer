import { useState } from "react";
import { Alert, Stack, Typography } from "@mui/material";
import { StockDemandChart } from "../../components/charts/StockDemandChart";
import { keys } from "../../data/keys";
import { addDays, readTransfers, transferPending } from "../../data/stock";
import type { TransferOrder } from "../../data/stock";
import { useStoredValue } from "../../hooks/useStore";

const localDay = (date: Date) => new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 10);

export default function WarehouseDashboardTab() {
  const transfers = useStoredValue<TransferOrder[]>(keys.transferOrders, readTransfers);
  const [today] = useState(() => localDay(new Date()));
  const withDifference = transfers.filter((transfer) => transfer.status === "Recibido con diferencia" && transferPending(transfer) > 0);
  return (
    <Stack spacing={2}>
      {withDifference.length === 0
        ? <Alert severity="success">Sin traspasos con diferencia.</Alert>
        : withDifference.map((transfer) => (
          <Alert severity="warning" key={transfer.id}>
            Traspaso {transfer.id} recibido con diferencia: {transferPending(transfer)} unidades pendientes hacia {transfer.toWarehouse}.
          </Alert>
        ))}
      <Typography variant="subtitle2" color="text.secondary">Demanda de picking de las OT abiertas para los próximos 7 días.</Typography>
      <StockDemandChart from={today} to={addDays(today, 7)} />
    </Stack>
  );
}
