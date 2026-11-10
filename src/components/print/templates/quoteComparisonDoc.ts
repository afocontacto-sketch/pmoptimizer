import { money } from "../../../data/format";
import type { PurchaseRequest } from "../../../modules/supplyData";
import { htmlTable } from "../printDocument";
import type { PrintTemplate } from "../printTemplates";

// Cuadro comparativo de cotizaciones de una solicitud de pedido (serie 21).
export function quoteComparisonDoc(request: PurchaseRequest): PrintTemplate {
  const quotes = request.quotes ?? [];
  const rows = quotes.map((quote) => [
    quote.supplier, money(quote.unitCost), money(quote.unitCost * request.quantity), quote.expectedDate, quote.status ?? "Pendiente",
  ]);
  return {
    title: "Cuadro comparativo de cotizaciones",
    docNumber: request.id,
    subtitle: `${request.materialCode} · ${request.materialName} · ${request.quantity} ${request.unit}`,
    orientation: "portrait",
    meta: [["Necesidad", request.needDate], ["Contrato", request.contract ?? "—"], ["WBS", request.wbs ?? "—"]],
    bodyHtml: rows.length
      ? htmlTable(["Proveedor", "Precio unitario", "Total", "Entrega", "Estado"], rows, { numericColumns: [1, 2] })
      : "<p>Sin cotizaciones registradas.</p>",
  };
}
