import { htmlTable } from "../printDocument";
import type { PrintTemplate } from "../printTemplates";

export type MaterialDemandRow = {
  date: string; callId: string; plan: string; equipment: string; contract: string;
  quantity: number; before: number; receipts: number; balance: number;
};

// Demanda MRP de un material: llamadas proyectadas y saldo restante (sin escribir datos).
export function materialDemandDoc(material: { code: string; name: string; unit: string }, rows: MaterialDemandRow[]): PrintTemplate {
  return {
    title: "Demanda MRP por material",
    docNumber: material.code,
    subtitle: material.name,
    orientation: "landscape",
    meta: [["Material", `${material.code} ${material.name}`], ["Unidad", material.unit], ["Llamadas", String(rows.length)]],
    bodyHtml: rows.length
      ? htmlTable(
        ["Fecha", "Llamada", "Plan / equipo", "Contrato", "Demanda", "Saldo previo", "OC recibida", "Saldo restante"],
        rows.map((row) => [row.date.slice(0, 10), row.callId, `${row.plan} · ${row.equipment}`, row.contract, row.quantity, row.before, row.receipts, row.balance]),
        { numericColumns: [4, 5, 6, 7] },
      )
      : "<p>Sin llamadas que requieran este material en el horizonte.</p>",
  };
}
