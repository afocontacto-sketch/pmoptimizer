import { useCallback, useEffect, useState } from "react";
import { Alert, Box, Paper, Stack, Typography } from "@mui/material";
import { keys } from "../../data/keys";
import { dispatchBoard, dispatchOverdue } from "../../data/stock";
import type { DispatchDay, DispatchOrder, Light } from "../../data/stock";
import { useStoredValue } from "../../hooks/useStore";
import { readStock } from "../operationsData";

const REFRESH_MS = 60000;
const colors: Record<Light, string> = { verde: "#16a34a", ambar: "#f59e0b", rojo: "#dc2626" };
const labels: Record<Light, string> = { verde: "Stock libre completo", ambar: "Falta liberar o recibir", rojo: "Faltante" };
const localDay = (date: Date) => new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const dayLabel = (date: string) => new Date(`${date}T12:00:00`).toLocaleDateString("es-CL", { weekday: "long", day: "numeric", month: "short" });

// Pantalla de despacho: OT con pendientes de picking de hoy a hoy + 3 días, por día y con semáforo.
export default function DispatchBoardTab() {
  const [today, setToday] = useState(() => localDay(new Date()));
  useEffect(() => {
    const id = window.setInterval(() => setToday(localDay(new Date())), REFRESH_MS);
    return () => window.clearInterval(id);
  }, []);
  const read = useCallback(() => {
    const bins = readStock();
    return { overdue: dispatchOverdue(today, undefined, bins), days: dispatchBoard(today, 3, undefined, bins) };
  }, [today]);
  const { overdue, days } = useStoredValue<{ overdue: DispatchOrder[]; days: DispatchDay[] }>(keys.workOrders, read, [keys.warehouseBins, keys.purchaseOrders]);
  const columns = [{ key: "overdue", title: "Vencidas", subtitle: "dueDate anterior a hoy", orders: overdue }, ...days.map((day, index) => (
    { key: day.date, title: index === 0 ? "Hoy" : dayLabel(day.date), subtitle: day.date, orders: day.orders }))];

  return (
    <Stack spacing={2}>
      <Stack direction="row" spacing={3}>
        {(Object.keys(colors) as Light[]).map((light) => (
          <Stack key={light} direction="row" spacing={1} sx={{ alignItems: "center" }}>
            <Box sx={{ width: 16, height: 16, borderRadius: "50%", bgcolor: colors[light] }} />
            <Typography>{labels[light]}</Typography>
          </Stack>
        ))}
      </Stack>
      <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", md: "repeat(5, 1fr)" } }}>
        {columns.map((column) => (
          <Paper key={column.key} variant="outlined" sx={{ p: 2 }}>
            <Typography variant="h5" sx={{ fontWeight: 700, textTransform: "capitalize" }}>{column.title}</Typography>
            <Typography variant="caption" color="text.secondary">{column.subtitle}</Typography>
            <Stack spacing={1} sx={{ mt: 1 }}>
              {column.orders.length === 0 && <Alert severity="success">Sin pendientes</Alert>}
              {column.orders.map(({ order, lines, light }) => (
                <Box key={order.id} sx={{ borderLeft: `8px solid ${colors[light]}`, pl: 1.5, py: 0.5, bgcolor: "action.hover" }}>
                  <Typography sx={{ fontSize: 20, fontWeight: 700 }}>{order.id} · {order.equipment}</Typography>
                  {lines.map((line) => (
                    <Typography key={line.code} sx={{ fontSize: 16, color: colors[line.light] }}>
                      {line.code}: pendiente {line.pending} {line.unit} · libre {line.free}
                    </Typography>
                  ))}
                </Box>
              ))}
            </Stack>
          </Paper>
        ))}
      </Box>
    </Stack>
  );
}
