import type { FinanceInvoice } from "../../../modules/financeData";
import { htmlTable } from "../printDocument";
import type { PrintTemplate } from "../printTemplates";

function amount(value: number, currency: string): string {
  return `${currency} ${new Intl.NumberFormat("es-CL", { maximumFractionDigits: currency === "CLP" ? 0 : 2 }).format(value)}`;
}

// Registro de factura de compra o documento de venta de prueba (Contabilidad).
export function invoiceDoc(invoice: FinanceInvoice): PrintTemplate {
  const isTest = invoice.kind === "Venta";
  return {
    title: isTest ? "Factura de prueba · sin validez tributaria" : "Registro de factura",
    docNumber: `${invoice.documentType} ${invoice.number}`,
    subtitle: invoice.counterparty,
    orientation: "portrait",
    meta: [
      [invoice.kind === "Venta" ? "Cliente" : "Proveedor", invoice.counterparty], ["Emisión", invoice.issueDate],
      ["Vencimiento", invoice.dueDate], ["Contrato", invoice.contract ?? "—"], ["WBS", invoice.wbs ?? "—"],
      ["OC", invoice.purchaseOrder || "—"],
    ],
    bodyHtml: htmlTable(
      ["Descripción", `Monto (${invoice.currency})`],
      [
        [`${invoice.documentType} · Referencia ${invoice.number}`, amount(invoice.netAmount, invoice.currency)],
        ["IVA", amount(invoice.vatAmount, invoice.currency)],
        ["Total documento", amount(invoice.totalAmount, invoice.currency)],
        ["Total equivalente CLP", amount(invoice.totalClp, "CLP")],
      ],
      { numericColumns: [1] },
    ) + (isTest ? "<p>DOCUMENTO FICTICIO PARA PRUEBAS. NO ES UN DOCUMENTO TRIBUTARIO ELECTRÓNICO NI HA SIDO VALIDADO POR EL SII.</p>" : ""),
  };
}
