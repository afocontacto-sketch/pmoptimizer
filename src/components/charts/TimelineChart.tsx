import { Box, Chip, Stack, Tooltip, Typography } from "@mui/material";
import { durationLabel } from "../../data/format";
import { clipEntryToDay, dayBounds, orderTypeColors, typeLabels } from "../../data/workOrders";
import type { TimeEntry, TimelineRow } from "../../data/workOrders";

export type TimelineColorBy = "type" | "operation";

export type TimelineChartProps = {
  date: string;
  rows: TimelineRow[];
  entries: TimeEntry[];
  now: number;
  colorBy: TimelineColorBy;
  fullDay?: boolean;
  equipmentOf?: (orderId: string) => string;
  onSelect?: (entry: TimeEntry) => void;
};

const operationPalette = ["#0ea5e9", "#16a34a", "#f59e0b", "#9333ea", "#dc2626", "#14b8a6", "#ea580c", "#64748b"];
const LABEL_WIDTH = 150;
const TRACK_HEIGHT = 34;

const timeLabel = (ms: number) => new Date(ms).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" });

// Línea de tiempo por trabajador (componente propio con Box, mismo enfoque que GanttChart). Ventana 06-22 o día completo.
export default function TimelineChart({ date, rows, entries, now, colorBy, fullDay = false, equipmentOf, onSelect }: TimelineChartProps) {
  const bounds = dayBounds(date);
  if (!bounds) return null;
  const hourMs = 3600000;
  const windowStart = bounds.start + (fullDay ? 0 : 6 * hourMs);
  const windowEnd = fullDay ? bounds.end : bounds.start + 22 * hourMs;
  const span = windowEnd - windowStart;
  const operationKeys = [...new Set(entries.map((entry) => entry.operationOrder))].sort((a, b) => a - b);
  const colorOf = (entry: TimeEntry) => colorBy === "type"
    ? orderTypeColors[entry.orderType]
    : operationPalette[operationKeys.indexOf(entry.operationOrder) % operationPalette.length];
  const operationNames = new Map(entries.map((entry) => [entry.operationOrder, entry.operationName]));
  const ticks: number[] = [];
  for (let at = windowStart; at <= windowEnd; at += (fullDay ? 3 : 2) * hourMs) ticks.push(at);

  return (
    <Box>
      <Box sx={{ display: "flex", ml: `${LABEL_WIDTH}px`, position: "relative", height: 20 }}>
        {ticks.map((tick) => (
          <Typography key={tick} variant="caption" color="text.secondary" sx={{ position: "absolute", left: `${(tick - windowStart) / span * 100}%`, transform: "translateX(-50%)" }}>
            {timeLabel(tick)}
          </Typography>
        ))}
      </Box>
      {rows.map((row) => (
        <Box key={row.employeeId} sx={{ display: "flex", alignItems: "center", borderTop: 1, borderColor: "divider" }}>
          <Typography variant="body2" noWrap sx={{ width: LABEL_WIDTH, pr: 1 }}>{row.name}</Typography>
          <Box sx={{ position: "relative", flex: 1, height: TRACK_HEIGHT, backgroundColor: "action.hover" }}>
            {ticks.map((tick) => (
              <Box key={tick} sx={{ position: "absolute", top: 0, bottom: 0, left: `${(tick - windowStart) / span * 100}%`, borderLeft: 1, borderColor: "divider", opacity: 0.5 }} />
            ))}
            {entries.filter((entry) => entry.employeeId === row.employeeId).flatMap((entry) => {
              const range = clipEntryToDay(entry, date, now);
              if (!range) return [];
              const start = Math.max(range.startMs, windowStart);
              const end = Math.min(range.endMs, windowEnd);
              if (end <= start) return [];
              const title = [
                `OT ${entry.orderId} · ${typeLabels[entry.orderType]}`,
                `Operación: ${entry.operationName}`,
                equipmentOf ? `Equipo: ${equipmentOf(entry.orderId)}` : "",
                `${timeLabel(range.startMs)} - ${range.open ? "en curso" : timeLabel(range.endMs)}`,
                `Duración: ${durationLabel((range.endMs - range.startMs) / 1000)}`,
              ].filter(Boolean).join("\n");
              return [(
                <Tooltip key={entry.id} title={<span style={{ whiteSpace: "pre-line" }}>{title}</span>}>
                  <Box
                    data-testid="timeline-bar"
                    onClick={onSelect ? () => onSelect(entry) : undefined}
                    sx={{
                      position: "absolute", top: 4, bottom: 4, left: `${(start - windowStart) / span * 100}%`,
                      width: `${(end - start) / span * 100}%`, backgroundColor: colorOf(entry), borderRadius: 0.5,
                      border: range.open ? "2px dashed" : "1px solid", borderColor: range.open ? "common.black" : "rgba(0,0,0,0.25)",
                      overflow: "hidden", cursor: onSelect ? "pointer" : "default", display: "flex", alignItems: "center",
                    }}
                  >
                    {range.open && <Chip size="small" label="En curso" sx={{ height: 18, fontSize: 10, ml: 0.5 }} />}
                  </Box>
                </Tooltip>
              )];
            })}
          </Box>
        </Box>
      ))}
      <Stack direction="row" sx={{ flexWrap: "wrap", gap: 2, mt: 2 }}>
        {colorBy === "type"
          ? Object.entries(orderTypeColors).map(([type, color]) => (
            <Stack key={type} direction="row" spacing={0.5} sx={{ alignItems: "center" }}>
              <Box sx={{ width: 12, height: 12, backgroundColor: color, borderRadius: 0.5 }} />
              <Typography variant="caption">{type} · {typeLabels[type as keyof typeof typeLabels]}</Typography>
            </Stack>
          ))
          : operationKeys.map((operation, index) => (
            <Stack key={operation} direction="row" spacing={0.5} sx={{ alignItems: "center" }}>
              <Box sx={{ width: 12, height: 12, backgroundColor: operationPalette[index % operationPalette.length], borderRadius: 0.5 }} />
              <Typography variant="caption">{operation ? `${operation}. ` : ""}{operationNames.get(operation)}</Typography>
            </Stack>
          ))}
        <Stack direction="row" spacing={0.5} sx={{ alignItems: "center" }}>
          <Box sx={{ width: 12, height: 12, border: "2px dashed", borderColor: "common.black", borderRadius: 0.5 }} />
          <Typography variant="caption">Entrada en curso</Typography>
        </Stack>
      </Stack>
    </Box>
  );
}
