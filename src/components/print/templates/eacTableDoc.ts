import { formatScaled, scaleValue } from "../../../data/projectCost";
import type { EacRow, EacScale } from "../../../data/projectCost";
import { htmlTable } from "../printDocument";
import type { PrintTemplate } from "../printTemplates";

export const eacHeaders = [
  "Contrato", "Categoría", "Real a la fecha", "Por gastar (ETC)", "EAC", "EAC mes anterior",
  "Variación mes", "Presupuesto aprobado", "Var. vs presupuesto",
];

const scaleLabel = (scale: EacScale): string => (scale === 1 ? "CLP" : `CLP / ${scale.toLocaleString("es-CL")}`);

// Misma matriz para PDF y CSV; null se muestra como "-" en pantalla/PDF y vacío en CSV.
export function eacMatrix(rows: EacRow[], scale: EacScale, forCsv = false): (string | number)[][] {
  const cell = (value: number | null): string | number =>
    forCsv ? (value === null ? "" : scaleValue(value, scale)) : formatScaled(value, scale);
  return rows.map((row) => [
    row.contract, row.category, cell(row.real), cell(row.etc), cell(row.eac), cell(row.previousEac),
    cell(row.variation), cell(row.budget), cell(row.varBudget),
  ]);
}

export function eacTableDoc(rows: EacRow[], options: { period: string; scale: EacScale; contracts: string[] }): PrintTemplate {
  return {
    title: "Tabla EAC por contrato",
    subtitle: `Corte ${options.period} · Escala ${scaleLabel(options.scale)}`,
    orientation: "landscape",
    meta: [["Contratos", options.contracts.join(", ") || "Todos"], ["Período de corte", options.period], ["Escala", scaleLabel(options.scale)]],
    bodyHtml: rows.length
      ? htmlTable(eacHeaders, eacMatrix(rows, options.scale), { numericColumns: [2, 3, 4, 5, 6, 7, 8] })
      : "<p>Sin datos para mostrar.</p>",
  };
}
