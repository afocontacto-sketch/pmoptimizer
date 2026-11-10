import { beforeEach, describe, expect, test } from "vitest";
import type { AuditRecord } from "../src/data/audit";
import { keys } from "../src/data/keys";
import { computePayslip, getPayrollParams, incomeTax, migratePayrollFields, paramsTemplateFor, savePayrollParams, seedPayrollParams, unpaidLeaveDays } from "../src/data/payroll";
import type { PayrollEmployee, Payslip } from "../src/data/payroll";
import { installStorage, readStore } from "./helpers/storageMock";

// Ejemplo numérico de rrhh-liquidacion-1.txt (sección 5), noviembre 2026.
const base: PayrollEmployee = {
  id: "E1", name: "Ana", rut: "11.111.111-1", contractType: "Indefinido", contractStart: "2020-01-01", monthlySalary: 900000, weeklyHours: 42,
  afp: "Habitat", healthSystem: "ISAPRE", isapreName: "Banmédica", isaprePlanUF: 3.5, familyCharges: 0, gratificationMode: "Art50", overtimeHours: 10,
  fixedAllowances: [
    { name: "Bono producción", amount: 50000, imponible: true }, { name: "Colación", amount: 60000, imponible: false }, { name: "Movilización", amount: 40000, imponible: false },
  ],
  recurringDeductions: [{ name: "Anticipo", amount: 100000, type: "anticipo" }, { name: "Cuota sindical", amount: 12000, type: "sindical" }],
};
const slip = (employee: PayrollEmployee, params = seedPayrollParams): Payslip => {
  const result = computePayslip(employee, params);
  if (!result.ok) throw new Error(result.error);
  return result.value;
};
const amount = (payslip: Payslip, code: string) => [...payslip.lines, ...payslip.employerContributions].find((line) => line.code === code)?.amount;

beforeEach(installStorage);

describe("computePayslip", () => {
  // SIS: 1,78 % x 1.244.115 = 22.145,2 (la especificación redondea a 22.146 y totaliza 84.974: error de $1 en el archivo rrhh).
  test("ejemplo ISAPRE 3,5 UF cuadra con la especificación", () => {
    const p = slip(base);
    expect(amount(p, "gratificacion")).toBe(219115);
    expect(amount(p, "horasExtra")).toBe(75000);
    expect(p.totalImponible).toBe(1244115);
    expect(p.totalNoImponible).toBe(100000);
    expect(p.gross).toBe(1344115);
    expect(amount(p, "afp")).toBe(140212);
    expect(amount(p, "salud")).toBe(87088);
    expect(amount(p, "saludAdicional")).toBe(57952);
    expect(amount(p, "cesantia")).toBe(7465);
    expect(p.taxableBase).toBe(1009350);
    expect(amount(p, "impuesto")).toBe(1256);
    expect(p.legalDeductions).toBe(293973);
    expect(p.voluntaryDeductions).toBe(112000);
    expect(p.deductions).toBe(405973);
    expect(p.net).toBe(938142);
    expect(p.employerContributions.map((line) => line.amount)).toEqual([22145, 11197, 8958, 1244, 29859, 11570]);
    expect(p.employerTotal).toBe(84973);
    expect(p.employerCost).toBe(1429088);
    expect(p.warnings).toEqual([]);
  });

  test("FONASA: solo 7 % legal, sin adicional", () => {
    const p = slip({ ...base, healthSystem: "FONASA", isaprePlanUF: undefined });
    expect(amount(p, "salud")).toBe(87088);
    expect(amount(p, "saludAdicional")).toBeUndefined();
    expect(p.legalDeductions).toBe(140212 + 87088 + 7465 + 1256);
  });

  test("ISAPRE con plan menor al 7 % descuenta el 7 %", () => {
    const p = slip({ ...base, isaprePlanUF: 1 });
    expect(amount(p, "salud")).toBe(87088);
    expect(amount(p, "saludAdicional")).toBeUndefined();
  });

  test("tope imponible 90 UF y cesantía 135,2 UF", () => {
    const p = slip({ ...base, monthlySalary: 6000000, overtimeHours: 0, fixedAllowances: [], recurringDeductions: [] });
    const cap = Math.round(90 * seedPayrollParams.uf);
    expect(p.values.afpCap).toBe(cap);
    expect(p.totalImponible).toBeGreaterThan(cap);
    expect(p.lines.find((line) => line.code === "afp")?.base).toBe(cap);
    expect(amount(p, "salud")).toBe(Math.round(cap * 0.07));
    expect(p.lines.find((line) => line.code === "cesantia")?.base).toBe(p.values.cesantiaCap);
    expect(p.warnings.some((text) => text.includes("tope"))).toBe(true);
  });

  test("cesantía según tipo: plazo fijo 0 % trabajador, 11 años o más 0 %", () => {
    expect(amount(slip({ ...base, contractType: "Plazo fijo" }), "cesantia")).toBeUndefined();
    expect(amount(slip({ ...base, contractType: "Plazo fijo" }), "cesantiaEmp")).toBe(37323);
    const senior = slip({ ...base, contractStart: "2010-01-01" });
    expect(amount(senior, "cesantia")).toBeUndefined();
    expect(amount(senior, "cesantiaEmp")).toBe(9953);
  });

  test("gratificación: horas extra dentro de la base es configurable", () => {
    const small = { ...base, monthlySalary: 400000, overtimeHours: 20, fixedAllowances: [], recurringDeductions: [] };
    const withOvertime = slip(small), without = slip(small, { ...seedPayrollParams, gratificationIncludesOvertime: false });
    expect(amount(withOvertime, "gratificacion")).toBeGreaterThan(amount(without, "gratificacion") ?? 0);
    expect(amount(without, "gratificacion")).toBe(100000);
  });

  test("falla sin comisión de AFP o sin plan ISAPRE y avisa sueldo bajo el mínimo", () => {
    expect(computePayslip({ ...base, afp: "Nueva" }, seedPayrollParams).ok).toBe(false);
    expect(computePayslip({ ...base, isaprePlanUF: 0 }, seedPayrollParams).ok).toBe(false);
    expect(slip({ ...base, monthlySalary: 300000, fixedAllowances: [], recurringDeductions: [] }).warnings.some((text) => text.includes("mínimo"))).toBe(true);
  });

  test("impuesto único por tramos en UTM", () => {
    expect(incomeTax(977940, seedPayrollParams).tax).toBe(0);
    expect(incomeTax(1009350, seedPayrollParams).tax).toBe(1256);
    expect(incomeTax(30000000, seedPayrollParams).tax).toBe(Math.round(30000000 * 0.4 - 38.82 * 72440));
  });
});

describe("parámetros", () => {
  test("solo Contabilidad o Administrador editan y queda audit", () => {
    const next = { ...seedPayrollParams, period: "2026-12", uf: 41500 };
    expect(savePayrollParams(next, { user: "x", role: "Supervisor" }).ok).toBe(false);
    expect(savePayrollParams(next, { user: "conta", role: "Contabilidad" }).ok).toBe(true);
    expect(getPayrollParams("2026-12")?.uf).toBe(41500);
    expect(getPayrollParams("2026-11")?.uf).toBe(seedPayrollParams.uf);
    expect(readStore<AuditRecord[]>(keys.auditLog, [])[0]).toMatchObject({ entity: "payroll", action: "createParams" });
    expect(savePayrollParams({ ...next, utm: 0 }, { user: "a", role: "Administrador" }).ok).toBe(false);
    expect(paramsTemplateFor("2027-01").uf).toBe(41500);
  });

  test("migración del modelo plano y días de licencia", () => {
    const migrated = migratePayrollFields({ id: "E", deductionPercent: 20 });
    expect(migrated).not.toHaveProperty("deductionPercent");
    expect(migrated).toMatchObject({ healthSystem: "FONASA", weeklyHours: 42, gratificationMode: "Art50" });
    const leaves = [{ employeeId: "E1", type: "Licencia médica", startDate: "2026-10-28", endDate: "2026-11-05" }, { employeeId: "E1", type: "Vacaciones", startDate: "2026-11-10", endDate: "2026-11-20" }];
    expect(unpaidLeaveDays(leaves, "E1", "2026-11")).toBe(5);
  });
});

describe("payslipDoc con detalle legal", () => {
  test("muestra descuentos con base y tasa, aportes del empleador y valores usados", async () => {
    const { payslipDoc } = await import("../src/components/print/templates/payslipDoc");
    const p = slip(base);
    const doc = payslipDoc({ period: "2026-11", status: "Pendiente de pago", employer: "Demo", employerRut: "76.123.456-0", employeeName: "Ana", employeeId: "E1", payslip: p, gross: p.gross, deductions: p.deductions, net: p.net });
    expect(doc.bodyHtml).toContain("Cotización voluntaria ISAPRE");
    expect(doc.bodyHtml).toContain("AFP Habitat");
    expect(doc.bodyHtml).toContain("11,27 %");
    expect(doc.bodyHtml).toContain("Aportes del empleador");
    expect(doc.bodyHtml).toContain("Valores usados");
    expect(doc.bodyHtml).toContain("938.142");
  });
});
