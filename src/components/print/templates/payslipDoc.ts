import { money } from "../../../data/format";
import { percent } from "../../../data/payroll";
import type { Payslip, PayslipLine } from "../../../data/payroll";
import { escapeHtml, htmlTable } from "../printDocument";
import type { PrintTemplate } from "../printTemplates";

export type PayslipInput = {
  period: string;
  status: string;
  employer: string;
  employerRut?: string;
  employerAddress?: string;
  workerRut?: string;
  payslip?: Payslip; // detalle legal (data/payroll.ts); sin él se imprime el modelo plano anterior
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

const lineRows = (lines: PayslipLine[]) => lines.map((line) => [
  line.label, line.base === undefined ? "" : money(line.base), line.rate === undefined ? "" : percent(line.rate), line.detail ?? "", money(line.amount),
]);
const lineHeaders = ["Concepto", "Base", "Tasa", "Detalle", "Monto"];

// Liquidación con todo el detalle legal (art. 54 CT): haberes, descuentos con base y tasa, aportes del empleador y valores usados.
function legalBody(input: PayslipInput, slip: Payslip): string {
  const of = (kind: PayslipLine["kind"]) => slip.lines.filter((line) => line.kind === kind);
  const table = (title: string, lines: PayslipLine[], totalLabel: string, total: number) => lines.length ? [
    `<h3>${title}</h3>`,
    htmlTable(lineHeaders, [...lineRows(lines), [totalLabel, "", "", "", money(total)]], { numericColumns: [1, 2, 4] }),
  ].join("") : "";
  return [
    table("Haberes imponibles", of("imponible"), "Total imponible", slip.totalImponible),
    table("Haberes no imponibles", of("noImponible"), "Total no imponible", slip.totalNoImponible),
    `<p><strong>Total haberes: ${escapeHtml(money(slip.gross))}</strong></p>`,
    table("Descuentos legales", of("descLegal"), "Total descuentos legales", slip.legalDeductions),
    `<p>Base tributable del impuesto único: ${escapeHtml(money(slip.taxableBase))}</p>`,
    table("Otros descuentos (voluntarios y convencionales)", of("descVoluntario"), "Total otros descuentos", slip.voluntaryDeductions),
    `<p><strong>Total descuentos: -${escapeHtml(money(slip.deductions))}</strong></p>`,
    `<h3>Líquido a pago: ${escapeHtml(money(input.net))}</h3>`,
    table("Aportes del empleador (informativos, no se descuentan al trabajador)", slip.employerContributions, "Total aportes empleador", slip.employerTotal),
    `<p>Costo total empleador: ${escapeHtml(money(slip.employerCost))}</p>`,
    slip.warnings.length ? `<p>Avisos: ${escapeHtml(slip.warnings.join(" "))}</p>` : "",
    `<p>Valores usados: UF ${slip.values.uf.toLocaleString("es-CL")} (plan ISAPRE con UF ${slip.values.ufIsapre.toLocaleString("es-CL")}), UTM ${money(slip.values.utm)}, IMM ${money(slip.values.imm)}, tope AFP/salud ${money(slip.values.afpCap)}, tope cesantía ${money(slip.values.cesantiaCap)}.</p>`,
    "<p>Recibí conforme: ______________________ (firma del trabajador) &nbsp;&nbsp;&nbsp; ______________________ (firma del empleador)</p>",
  ].join("");
}

// Liquidación de sueldo: haberes, descuentos y líquido a pago; el logo lo pone printDocument.
export function payslipDoc(input: PayslipInput): PrintTemplate {
  const dash = (value?: string) => value || "No registrado";
  const slip = input.payslip;
  return {
    title: "Liquidación de sueldo",
    docNumber: input.period,
    subtitle: input.employeeName,
    orientation: "portrait",
    meta: [
      ["Empleador", input.employer],
      ...(input.employerRut !== undefined || input.employerAddress !== undefined ? [["RUT y domicilio empleador", `${dash(input.employerRut)} · ${dash(input.employerAddress)}`] as [string, string]] : []),
      ["Trabajador", input.employeeName],
      ...(slip ? [["RUT trabajador", dash(input.workerRut)], ["AFP", slip.worker.afp], ["Salud", slip.worker.health], ["Días trabajados", String(slip.daysWorked)]] as Array<[string, string]> : []),
      ["Identificador interno", input.employeeId],
      ["Cargo", dash(input.position)],
      ["Contrato", dash(input.contractNumber)],
      ["Tipo", dash(input.contractType)],
      ["Jornada", dash(input.schedule)],
      ["Inicio", dash(input.contractStart)],
      ["Lugar de trabajo", dash(input.workplace)],
      ["Estado del pago", input.status],
    ],
    bodyHtml: slip ? legalBody(input, slip) : [
      "<h3>Haberes</h3>",
      htmlTable(["Concepto", "Monto"], [["Remuneración mensual registrada (demo)", money(input.gross)]], { numericColumns: [1] }),
      "<h3>Descuentos</h3>",
      htmlTable(["Concepto", "Monto"], [["Descuento estimado configurable (demo)", `-${money(input.deductions)}`]], { numericColumns: [1] }),
      `<h3>Líquido a pago: ${escapeHtml(money(input.net))}</h3>`,
      "<p>Documento de demostración sin validez laboral ni previsional. No desglosa cotizaciones, impuestos ni otros descuentos legales.</p>",
    ].join(""),
  };
}
