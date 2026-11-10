import { money } from "../../../data/format";
import type { PurchaseOrder } from "../../../modules/supplyData";
import { htmlTable } from "../printDocument";
import type { PrintTemplate } from "../printTemplates";

// Orden de compra (serie 31) con WBS/contrato cuando existen.
export function purchaseOrderDoc(order: PurchaseOrder): PrintTemplate {
  const total = order.quantity * order.unitCost;
  return {
    title: "Orden de compra",
    docNumber: order.id,
    subtitle: order.supplier,
    orientation: "portrait",
    meta: [
      ["Solicitud de pedido", order.requestId], ["Entrega estimada", order.expectedDate], ["Estado", order.status],
      ["Contrato", order.contract ?? "—"], ["WBS", order.wbs ?? "—"], ["Aprobada por", order.approvedBy ?? "—"],
      ["Plazo de pago", order.paymentTermLabel ?? "—"],
    ],
    bodyHtml: htmlTable(
      ["Código", "Descripción", "Cantidad", "Unidad", "Precio unitario", "Total"],
      [[order.materialCode, order.materialName, order.quantity, order.unit, money(order.unitCost), money(total)]],
      { numericColumns: [2, 4, 5] },
    ) + `<p class="num"><strong>Total: ${money(total)}</strong></p>`,
  };
}
