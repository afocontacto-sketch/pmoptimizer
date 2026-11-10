import { useState, useMemo, useRef, useEffect } from "react";
import {
  Box,
  Paper,
  Typography,
  Stack,
  Button,
  Tooltip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
} from "@mui/material";
import { ZoomIn, ZoomOut } from "@mui/icons-material";

/**
 * Niveles de zoom disponibles para el Gantt
 * - day: Vista por día (mayor detalle)
 * - week: Vista por semana (estándar)
 * - month: Vista por mes (vista general)
 */
type ZoomLevel = "day" | "week" | "month";

/**
 * Tarea/Orden para renderizar en el Gantt
 * @property id - Identificador único de la orden
 * @property name - Nombre/descripción de la orden
 * @property startDate - Fecha de inicio de la orden
 * @property durationHours - Duración en horas de la orden
 * @property contract - Código del contrato asociado
 * @property status - Estado (Asignada, En ejecución, Cierre provisorio, Cerrada)
 * @property equipment - Equipamiento/equipo asociado
 * @property technician - Técnico responsable
 * @property hours - Total de horas
 * @property cost - Costo total en CLP
 * @property routeName - Nombre de la ruta de mantenimiento (opcional)
 */
type GanttTask = {
  id: string;
  name: string;
  startDate: Date;
  durationHours: number;
  contract: string;
  status: string;
  equipment: string;
  technician: string;
  hours: number;
  cost: number;
  routeName?: string;
};

interface GanttChartProps {
  /** Array de tareas a renderizar */
  tasks: GanttTask[];
  /** Rol del usuario (determina vistas agregadas) */
  role: string;
  /** Callback cuando se hace click en una barra */
  onTaskClick?: (task: GanttTask) => void;
}

// Constantes para el cálculo de renderizado
const HOURS_PER_DAY = 8;
const PIXELS_PER_HOUR = 5;

/**
 * Componente de Gantt Interactivo
 * 
 * Renderiza un diagrama de Gantt basado en Canvas para visualizar órdenes de trabajo.
 * Soporta:
 * - Zoom dinámico (día, semana, mes)
 * - Click en barras para ver detalles
 * - Vistas agregadas para PM (totales por contrato, mes, año)
 * 
 * @param tasks - Array de órdenes a mostrar
 * @param role - Rol del usuario (determina qué totales mostrar)
 * @param onTaskClick - Callback opcional al hacer click en una orden
 */
export function GanttChart({ tasks, role, onTaskClick }: GanttChartProps) {
  const [zoom, setZoom] = useState<ZoomLevel>("week");
  const [selectedTask, setSelectedTask] = useState<GanttTask | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  /**
   * Calcula el rango de fechas para el Gantt
   * Si no hay tareas, usa un rango por defecto de 90 días
   */
  const dateRange = useMemo(() => {
    if (tasks.length === 0) {
      const today = new Date();
      return { start: today, end: new Date(today.getTime() + 90 * 24 * 60 * 60 * 1000) };
    }
    const dates = tasks.map((t) => t.startDate.getTime());
    const start = new Date(Math.min(...dates));
    const end = new Date(
      Math.max(...dates.map((d) => new Date(d).getTime() + (tasks.find((t) => t.startDate.getTime() === d)?.durationHours || 8) * 60 * 60 * 1000))
    );
    return { start, end };
  }, [tasks]);

  const pixelsPerUnit = useMemo(() => {
    if (zoom === "day") return PIXELS_PER_HOUR;
    if (zoom === "week") return (PIXELS_PER_HOUR * 24) / 7;
    return (PIXELS_PER_HOUR * 24) / 30;
  }, [zoom]);

  const timelineStart = dateRange.start;
  const timelineEnd = dateRange.end;
  const totalMilliseconds = timelineEnd.getTime() - timelineStart.getTime();
  const totalPixels = (totalMilliseconds / (60 * 60 * 1000)) * pixelsPerUnit;

  const getTaskX = (date: Date) => (date.getTime() - timelineStart.getTime()) / (60 * 60 * 1000) * pixelsPerUnit;
  const getTaskWidth = (hours: number) => (hours / HOURS_PER_DAY) * pixelsPerUnit * 24;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    canvas.width = Math.min(totalPixels + 100, 1200);
    canvas.height = Math.max(tasks.length * 40 + 100, 300);

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.strokeStyle = "#e0e0e0";
    ctx.lineWidth = 1;
    for (let i = 0; i <= canvas.width; i += 50) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i, canvas.height);
      ctx.stroke();
    }

    ctx.font = "12px Arial";
    ctx.fillStyle = "#666";
    const dayWidth = pixelsPerUnit * 24;
    let currentDate = new Date(timelineStart);
    let xPos = 0;

    while (xPos < canvas.width && currentDate <= timelineEnd) {
      const label = currentDate.toLocaleDateString("es-CL", { month: "short", day: "numeric" });
      ctx.fillText(label, xPos + 5, 20);
      currentDate.setDate(currentDate.getDate() + 1);
      xPos += dayWidth;
    }

    ctx.strokeStyle = "#999";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, 40);
    ctx.lineTo(canvas.width, 40);
    ctx.stroke();

    tasks.forEach((task, index) => {
      const y = 60 + index * 40;
      const x = getTaskX(task.startDate);
      const width = getTaskWidth(task.durationHours);

      const colors: Record<string, string> = {
        "Asignada": "#2196F3",
        "En ejecución": "#FF9800",
        "Cierre provisorio": "#4CAF50",
        "Cerrada": "#9E9E9E",
      };

      ctx.fillStyle = colors[task.status] || "#2196F3";
      ctx.fillRect(Math.max(0, x), y, Math.min(width, canvas.width - Math.max(0, x)), 30);

      ctx.strokeStyle = "#333";
      ctx.lineWidth = 1;
      ctx.strokeRect(Math.max(0, x), y, Math.min(width, canvas.width - Math.max(0, x)), 30);

      ctx.fillStyle = "#fff";
      ctx.font = "bold 11px Arial";
      const taskLabel = task.name.substring(0, 20);
      ctx.fillText(taskLabel, Math.max(5, x + 3), y + 20);

      ctx.fillStyle = "#333";
      ctx.font = "10px Arial";
      ctx.fillText(`${task.durationHours}h`, Math.max(5, x + 3), y + 28);
    });

    ctx.font = "12px Arial";
    ctx.fillStyle = "#666";
    tasks.forEach((task, index) => {
      const y = 60 + index * 40;
      ctx.fillText(task.contract, 10, y + 20);
    });
  }, [tasks, zoom, pixelsPerUnit, totalPixels, timelineStart, timelineEnd, getTaskX, getTaskWidth]);

  const contractTotals = useMemo(() => {
    if (role !== "PM Proyecto") return null;

    const totals = new Map<string, { contract: string; calls: number; hours: number; cost: number }>();
    for (const task of tasks) {
      const key = task.contract;
      const current = totals.get(key) || { contract: key, calls: 0, hours: 0, cost: 0 };
      current.calls += 1;
      current.hours += task.hours;
      current.cost += task.cost;
      totals.set(key, current);
    }
    return Array.from(totals.values()).sort((a, b) => a.contract.localeCompare(b.contract));
  }, [tasks, role]);

  const monthlyTotals = useMemo(() => {
    if (role !== "PM Proyecto") return null;

    const totals = new Map<string, { month: string; calls: number; hours: number; cost: number }>();
    for (const task of tasks) {
      const month = task.startDate.toISOString().slice(0, 7);
      const key = month;
      const current = totals.get(key) || { month: key, calls: 0, hours: 0, cost: 0 };
      current.calls += 1;
      current.hours += task.hours;
      current.cost += task.cost;
      totals.set(key, current);
    }
    return Array.from(totals.values()).sort((a, b) => a.month.localeCompare(b.month));
  }, [tasks, role]);

  const yearlyTotals = useMemo(() => {
    if (role !== "PM Proyecto") return null;

    const totals = new Map<string, { year: string; calls: number; hours: number; cost: number }>();
    for (const task of tasks) {
      const year = task.startDate.toISOString().slice(0, 4);
      const current = totals.get(year) || { year, calls: 0, hours: 0, cost: 0 };
      current.calls += 1;
      current.hours += task.hours;
      current.cost += task.cost;
      totals.set(year, current);
    }
    return Array.from(totals.values()).sort((a, b) => a.year.localeCompare(b.year));
  }, [tasks, role]);

  return (
    <Paper sx={{ p: 3 }}>
      <Stack spacing={3}>
        <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <Typography variant="h6">Diagrama de Gantt - Órdenes de Trabajo</Typography>
          <Stack direction="row" spacing={1}>
            <Tooltip title="Zoom out">
              <Button
                size="small"
                onClick={() => setZoom(zoom === "month" ? "month" : zoom === "week" ? "month" : "week")}
                startIcon={<ZoomOut />}
              >
                Alejar
              </Button>
            </Tooltip>
            <Tooltip title="Zoom in">
              <Button
                size="small"
                onClick={() => setZoom(zoom === "day" ? "day" : zoom === "week" ? "day" : "week")}
                startIcon={<ZoomIn />}
              >
                Acercar
              </Button>
            </Tooltip>
          </Stack>
        </Box>

        <Box sx={{ overflowX: "auto", border: "1px solid #ddd", borderRadius: 1 }}>
          <canvas
            ref={canvasRef}
            onClick={(e) => {
              const canvas = e.currentTarget;
              const rect = canvas.getBoundingClientRect();
              const x = e.clientX - rect.left;
              const y = e.clientY - rect.top;

              tasks.forEach((task, index) => {
                const taskY = 60 + index * 40;
                const taskX = getTaskX(task.startDate);
                const taskWidth = getTaskWidth(task.durationHours);

                if (x >= taskX && x <= taskX + taskWidth && y >= taskY && y <= taskY + 30) {
                  setSelectedTask(task);
                  if (onTaskClick) onTaskClick(task);
                }
              });
            }}
            style={{ cursor: "pointer", display: "block" }}
          />
        </Box>

        {tasks.length === 0 && (
          <Typography color="text.secondary" align="center">
            Sin órdenes para mostrar
          </Typography>
        )}

        {role === "PM Proyecto" && contractTotals && contractTotals.length > 0 && (
          <Box>
            <Typography variant="subtitle2" sx={{ mb: 1 }}>
              Totales por Contrato
            </Typography>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Contrato</TableCell>
                  <TableCell align="right">Órdenes</TableCell>
                  <TableCell align="right">Horas</TableCell>
                  <TableCell align="right">Presupuesto (CLP)</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {contractTotals.map((row) => (
                  <TableRow key={row.contract}>
                    <TableCell>{row.contract}</TableCell>
                    <TableCell align="right">{row.calls}</TableCell>
                    <TableCell align="right">{row.hours.toFixed(1)}</TableCell>
                    <TableCell align="right">{row.cost.toLocaleString("es-CL")}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Box>
        )}

        {role === "PM Proyecto" && monthlyTotals && monthlyTotals.length > 0 && (
          <Box>
            <Typography variant="subtitle2" sx={{ mb: 1 }}>
              Totales por Mes
            </Typography>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Mes</TableCell>
                  <TableCell align="right">Órdenes</TableCell>
                  <TableCell align="right">Horas</TableCell>
                  <TableCell align="right">Presupuesto (CLP)</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {monthlyTotals.map((row) => (
                  <TableRow key={row.month}>
                    <TableCell>{row.month}</TableCell>
                    <TableCell align="right">{row.calls}</TableCell>
                    <TableCell align="right">{row.hours.toFixed(1)}</TableCell>
                    <TableCell align="right">{row.cost.toLocaleString("es-CL")}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Box>
        )}

        {role === "PM Proyecto" && yearlyTotals && yearlyTotals.length > 0 && (
          <Box>
            <Typography variant="subtitle2" sx={{ mb: 1 }}>
              Totales por Año
            </Typography>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Año</TableCell>
                  <TableCell align="right">Órdenes</TableCell>
                  <TableCell align="right">Horas</TableCell>
                  <TableCell align="right">Presupuesto (CLP)</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {yearlyTotals.map((row) => (
                  <TableRow key={row.year}>
                    <TableCell>{row.year}</TableCell>
                    <TableCell align="right">{row.calls}</TableCell>
                    <TableCell align="right">{row.hours.toFixed(1)}</TableCell>
                    <TableCell align="right">{row.cost.toLocaleString("es-CL")}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Box>
        )}

        <Dialog open={!!selectedTask} onClose={() => setSelectedTask(null)}>
          <DialogTitle>Detalles de Orden</DialogTitle>
          <DialogContent>
            {selectedTask && (
              <Table size="small">
                <TableBody>
                  <TableRow>
                    <TableCell><strong>Orden</strong></TableCell>
                    <TableCell>{selectedTask.id}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell><strong>Descripción</strong></TableCell>
                    <TableCell>{selectedTask.name}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell><strong>Contrato</strong></TableCell>
                    <TableCell>{selectedTask.contract}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell><strong>Fecha Inicio</strong></TableCell>
                    <TableCell>{selectedTask.startDate.toLocaleDateString("es-CL")}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell><strong>Duración</strong></TableCell>
                    <TableCell>{selectedTask.durationHours} horas</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell><strong>Estado</strong></TableCell>
                    <TableCell>{selectedTask.status}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell><strong>Equipamiento</strong></TableCell>
                    <TableCell>{selectedTask.equipment}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell><strong>Técnico</strong></TableCell>
                    <TableCell>{selectedTask.technician}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell><strong>Costo</strong></TableCell>
                    <TableCell>{selectedTask.cost.toLocaleString("es-CL")} CLP</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            )}
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setSelectedTask(null)}>Cerrar</Button>
          </DialogActions>
        </Dialog>
      </Stack>
    </Paper>
  );
}
