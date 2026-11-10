import { useMemo, useState } from "react";
import { Alert, FormControlLabel, Paper, Stack, Switch, TextField, ToggleButton, ToggleButtonGroup, Typography } from "@mui/material";
import TimelineChart from "../../components/charts/TimelineChart";
import type { TimelineColorBy } from "../../components/charts/TimelineChart";
import { clipEntryToDay, timelineRows } from "../../data/workOrders";
import { useNow } from "../../hooks/useNow";
import type { ProductionCtx } from "./useProductionCtx";

const todayIso = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
};

// Línea de tiempo diaria por trabajador a partir de timeEntries (solo OT visibles para el rol).
export default function TimelineTab({ ctx }: { ctx: ProductionCtx }) {
  const { entries, visibleOrders, supervisorCanSeeOrder } = ctx;
  const now = useNow(30000);
  const [date, setDate] = useState(todayIso);
  const [colorBy, setColorBy] = useState<TimelineColorBy>("type");
  const [fullDay, setFullDay] = useState(false);
  const visible = useMemo(() => visibleOrders.filter(supervisorCanSeeOrder), [visibleOrders, supervisorCanSeeOrder]);
  const dayEntries = useMemo(() => {
    const ids = new Set(visible.map((order) => order.id));
    return entries.filter((entry) => ids.has(entry.orderId) && clipEntryToDay(entry, date, now) !== null);
  }, [entries, visible, date, now]);
  const rows = useMemo(() => timelineRows(date, dayEntries, visible, now), [date, dayEntries, visible, now]);
  const equipmentOf = (orderId: string) => visible.find((order) => order.id === orderId)?.equipment ?? "";

  return (
    <Paper sx={{ p: 3 }}>
      <Typography variant="h6" sx={{ mb: 2 }}>Línea de tiempo del equipo</Typography>
      <Stack direction={{ xs: "column", md: "row" }} spacing={2} sx={{ mb: 2, alignItems: { md: "center" } }}>
        <TextField type="date" size="small" label="Día" value={date} onChange={(event) => event.target.value && setDate(event.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
        <ToggleButtonGroup size="small" exclusive value={colorBy} onChange={(_, value: TimelineColorBy | null) => value && setColorBy(value)}>
          <ToggleButton value="type">Color por tipo</ToggleButton>
          <ToggleButton value="operation">Color por operación</ToggleButton>
        </ToggleButtonGroup>
        <FormControlLabel control={<Switch checked={fullDay} onChange={(event) => setFullDay(event.target.checked)} />} label="Día completo (00-24 h)" />
      </Stack>
      {dayEntries.length === 0
        ? <Alert severity="info">Sin registros de tiempo para este día.</Alert>
        : <TimelineChart date={date} rows={rows} entries={dayEntries} now={now} colorBy={colorBy} fullDay={fullDay} equipmentOf={equipmentOf} />}
    </Paper>
  );
}
