import { money } from "../../../data/format";
import { escapeHtml, htmlTable } from "../printDocument";
import type { PrintTemplate } from "../printTemplates";

export type PayslipInput = {
  period: string;
  status: string;
  employer: string;
  employeeName: string;
  employeeId: string;
  position?: string;
  contractNumber?: string;
  contractType?: string;
  schedule?: string;
  contractStart?: string;
  workplace?: string;
  gross: number;
  deductions: number;
  net: number;
};

// Liquidación de sueldo (demo): haberes, descuentos y líquido a pago; el logo lo pone printDocument.
export function payslipDoc(input: PayslipInput): PrintTemplate {
  const dash = (value?: string) => value || "No registrado";
  return {
    title: "Liquidación de sueldo",
    docNumber: input.period,
    subtitle: input.employeeName,
    orientation: "portrait",
    meta: [
      ["Empleador", input.employer],
      ["Trabajador", input.employeeName],
      ["Identificador interno", input.employeeId],
      ["Cargo", dash(input.position)],
      ["Contrato", dash(input.contractNumber)],
      ["Tipo", dash(input.contractType)],
      ["Jornada", dash(input.schedule)],
      ["Inicio", dash(input.contractStart)],
      ["Lugar de trabajo", dash(input.workplace)],
      ["Estado del pago", input.status],
    ],
    bodyHtml: [
      "<h3>Haberes</h3>",
      htmlTable(["Concepto", "Monto"], [["Remuneración mensual registrada (demo)", money(input.gross)]], { numericColumns: [1] }),
      "<h3>Descuentos</h3>",
      htmlTable(["Concepto", "Monto"], [["Descuento estimado configurable (demo)", `-${money(input.deductions)}`]], { numericColumns: [1] }),
      `<h3>Líquido a pago: ${escapeHtml(money(input.net))}</h3>`,
      "<p>Documento de demostración sin validez laboral ni previsional. No desglosa cotizaciones, impuestos ni otros descuentos legales.</p>",
    ].join(""),
  };
}
