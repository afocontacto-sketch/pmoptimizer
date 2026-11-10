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
