import { entryDurationHours, orderOperations, typeLabels } from "../../data/workOrders";
import type { TimeEntry, WorkOrder } from "../../data/workOrders";
import { escapeHtml, htmlTable } from "./printDocument";
import type { PrintMeta, PrintOptions } from "./printDocument";

export type PrintTemplate = Pick<PrintOptions, "title" | "docNumber" | "subtitle" | "meta" | "bodyHtml" | "orientation">;

export type GenericReportInput = {
  title: string;
  subtitle?: string;
  docNumber?: string;
  meta?: PrintMeta[];
  headers: string[];
  rows: (string | number)[][];
  numericColumns?: number[];
  notes?: string;
  orientation?: "portrait" | "landscape";
};

export function genericReportDoc(input: GenericReportInput): PrintTemplate {
  const table = input.rows.length
    ? htmlTable(input.headers, input.rows, { numericColumns: input.numericColumns })
    : "<p>Sin datos para mostrar.</p>";
  const notes = input.notes ? `<p>${escapeHtml(input.notes)}</p>` : "";
  return {
    title: input.title,
    subtitle: input.subtitle,
    docNumber: input.docNumber,
    meta: input.meta,
    orientation: input.orientation ?? (input.headers.length > 6 ? "landscape" : "portrait"),
    bodyHtml: `${table}${notes}`,
  };
}

// Plantillas específicas (OT, picking, traspaso, OC, comparador, liquidación, EAC): las agrega cada etapa.

export type WorkOrderDocOptions = { showCosts: boolean; nowMs: number };

// Hoja de OT: datos, operaciones (plan vs real), materiales y registro de tiempos; las tarifas solo si showCosts.
export function workOrderDoc(order: WorkOrder, entries: TimeEntry[], options: WorkOrderDocOptions): PrintTemplate {
  const own = entries.filter((entry) => entry.orderId === order.id);
  const hours = (entry: TimeEntry) => entryDurationHours(entry, options.nowMs);
  const dateTime = (iso: string) => new Date(iso).toLocaleString("es-CL");
  const operations = orderOperations(order).map((operation) => [
    operation.order ? `${operation.order}. ${operation.name}` : operation.name,
    operation.durationHours.toFixed(1),
    own.filter((entry) => entry.operationOrder === operation.order).reduce((sum, entry) => sum + hours(entry), 0).toFixed(2),
  ]);
  const materials = order.materials.map((line) => [`${line.code}${line.name ? ` ${line.name}` : ""}`, line.required, line.picked, line.unit ?? ""]);
  const timeHeaders = ["Trabajador", "Operación", "Inicio", "Fin", "Horas", ...(options.showCosts ? ["Tarifa/h", "Costo"] : [])];
  const timeRows = own.map((entry) => [
    entry.employeeName, entry.operationName, dateTime(entry.start), entry.end ? dateTime(entry.end) : "En curso", hours(entry).toFixed(2),
    ...(options.showCosts ? [entry.hourlyRate, Math.round(hours(entry) * entry.hourlyRate)] : []),
  ]);
  const section = (title: string, table: string) => `<h3>${escapeHtml(title)}</h3>${table}`;
  const empty = "<p>Sin registros.</p>";
  return {
    title: "Orden de trabajo",
    docNumber: order.id,
    subtitle: `${typeLabels[order.type]} · ${order.equipment}`,
    orientation: "portrait",
    meta: [
      ["Estado", order.status], ["Contrato", order.contract], ["WBS", order.wbs],
      ["Programada", order.dueDate], ["Prioridad", order.priority ?? "—"],
      ["Asignados", order.assignees.map((assignee) => assignee.name).join(", ") || "Sin asignar"],
      ["Descripción", order.description],
    ],
    bodyHtml: [
      section("Operaciones", htmlTable(["Operación", "Plan (h)", "Real (h)"], operations, { numericColumns: [1, 2] })),
      section("Materiales", materials.length ? htmlTable(["Material", "Requerido", "Entregado", "Unidad"], materials, { numericColumns: [1, 2] }) : empty),
      section("Registro de tiempos", timeRows.length ? htmlTable(timeHeaders, timeRows, { numericColumns: options.showCosts ? [4, 5, 6] : [4] }) : empty),
    ].join(""),
  };
}
