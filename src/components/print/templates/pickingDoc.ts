import { typeLabels } from "../../../data/workOrders";
import type { WorkOrder } from "../../../data/workOrders";
import type { StockBin } from "../../../data/stock";
import { isPickableLocation } from "../../../data/stock";
import { htmlTable } from "../printDocument";
import type { PrintTemplate } from "../printTemplates";

// Hoja de picking: solo líneas con pendiente > 0, con bins libres sugeridos en orden de ubicación.
export function pickingDoc(order: WorkOrder, bins: StockBin[]): PrintTemplate {
  const rows = order.materials
    .map((line) => ({ line, pending: Math.max(0, line.required - line.picked) }))
    .filter((item) => item.pending > 0)
    .map(({ line, pending }) => {
      const suggested = bins
        .filter((bin) => bin.code === line.code && bin.status === "Libre utilización" && bin.quantity > 0 && isPickableLocation(bin.location))
        .sort((a, b) => a.location.localeCompare(b.location, undefined, { numeric: true }))
        .map((bin) => `${bin.warehouse}/${bin.location} (${bin.quantity})`)
        .join(", ");
      return [suggested || "Sin stock libre", `${line.code}${line.name ? ` ${line.name}` : ""}`, line.required, line.picked, pending, line.unit ?? "", ""];
    });
  return {
    title: "Hoja de picking",
    docNumber: order.id,
    subtitle: `${typeLabels[order.type]} · ${order.equipment}`,
    orientation: "landscape",
    meta: [["Contrato", order.contract], ["WBS", order.wbs], ["Programada", order.dueDate], ["Estado picking", order.pickingStatus]],
    bodyHtml: rows.length
      ? htmlTable(["Ubicación sugerida", "Material", "Requerido", "Entregado", "Pendiente", "Unidad", "Cantidad tomada"], rows, { numericColumns: [2, 3, 4] })
      : "<p>Sin materiales pendientes de picking.</p>",
  };
}
