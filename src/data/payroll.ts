import { can } from "../app/permissions";
import type { Role } from "../app/roles";
import { appendAudit } from "./audit";
import { keys } from "./keys";
import { fail, ok } from "./result";
import type { Result } from "./result";
import { readJson, runAtomic, updateJson } from "./storage";

// Liquidación de sueldo (Chile). Ningún valor legal vive en el código: todo sale de PayrollParams (por período).
export type PayrollContractType = "Indefinido" | "Plazo fijo" | "Obra o faena" | "Honorarios";
export type HealthSystem = "FONASA" | "ISAPRE";
export type GratificationMode = "Art50" | "Art47" | "Pactada" | "Ninguna";
export type FixedAllowance = { name: string; amount: number; imponible: boolean };
export type RecurringDeduction = { name: string; amount: number; type: "prestamo" | "anticipo" | "sindical" | "apv" | "otro"; apvRegime?: "A" | "B" };

// Campos previsionales del trabajador (se mezclan con Employee en HumanResourcesPage).
export type PayrollEmployeeFields = {
  rut: string;
  afp: string;
  healthSystem: HealthSystem;
  isapreName?: string;
  isaprePlanUF?: number;
  familyCharges: number;
  gratificationMode: GratificationMode;
  gratificationAmount?: number;
  weeklyHours: number;
  overtimeHours?: number;
  fixedAllowances: FixedAllowance[];
  recurringDeductions: RecurringDeduction[];
  retiredOver65?: boolean;
};
export type PayrollEmployee = PayrollEmployeeFields & {
  id: string; name: string; contractType: PayrollContractType; contractStart?: string; monthlySalary: number;
};

export type CesantiaRate = { worker: number; employer: number };
export type TaxBracket = { fromUTM: number; toUTM: number | null; factor: number; rebateUTM: number };
export type PayrollParams = {
  period: string;
  uf: number; // UF del último día del mes: topes
  ufIsapre: number; // UF para valorizar el plan ISAPRE (por defecto la UF del último día del mes)
  utm: number;
  imm: number;
  weeklyMaxHours: number;
  caps: { afpUF: number; cesantiaUF: number; apvMonthlyUF: number };
  rates: {
    afpMandatory: number; health: number; afpCommission: Record<string, number>;
    cesantia: Record<"Indefinido" | "PlazoFijo" | "Indef11mas", CesantiaRate>;
    cesantiaSeniorityYears: number;
    sis: number; crp: number; lifeExpectancy: number; afpEmployerAccount: number;
    mutualBase: number; mutualAdicional: number;
    overtimeFactor: number; gratificationPct: number; gratificationCapIMM: number; voluntaryLimitPct: number;
  };
  gratificationIncludesOvertime: boolean;
  taxBrackets: TaxBracket[];
  familyAllowance: { maxIncome: number | null; amountPerCharge: number }[];
  source: { label: string; fetchedAt: string }[];
};

export type PayslipLineKind = "imponible" | "noImponible" | "descLegal" | "descVoluntario" | "aporteEmpleador";
export type PayslipLine = { code: string; label: string; amount: number; kind: PayslipLineKind; base?: number; rate?: number; detail?: string };
export type Payslip = {
  period: string;
  daysWorked: number;
  worker: { rut: string; afp: string; health: string; contractType: string };
  lines: PayslipLine[];
  totalImponible: number; totalNoImponible: number; gross: number;
  taxableBase: number; legalDeductions: number; voluntaryDeductions: number; deductions: number; net: number;
  employerContributions: PayslipLine[]; employerTotal: number; employerCost: number;
  values: { uf: number; ufIsapre: number; utm: number; imm: number; afpCap: number; cesantiaCap: number };
  warnings: string[];
};

const round = (value: number) => Math.round(value + 1e-9);
export const percent = (rate: number) => `${(rate * 100).toLocaleString("es-CL", { maximumFractionDigits: 3 })} %`;

// Seed: valores de noviembre 2026 de rrhh-liquidacion-1.txt (validar con Previred/SII antes de producción).
export const seedPayrollParams: PayrollParams = {
  period: "2026-11", uf: 41439.89, ufIsapre: 41439.89, utm: 72440, imm: 553553, weeklyMaxHours: 42,
  caps: { afpUF: 90, cesantiaUF: 135.2, apvMonthlyUF: 50 },
  rates: {
    afpMandatory: 0.10, health: 0.07,
    afpCommission: { Capital: 0.0144, Cuprum: 0.0144, Habitat: 0.0127, PlanVital: 0.0116, ProVida: 0.0145, Modelo: 0.0058, Uno: 0.0046 },
    cesantia: { Indefinido: { worker: 0.006, employer: 0.024 }, PlazoFijo: { worker: 0, employer: 0.03 }, Indef11mas: { worker: 0, employer: 0.008 } },
    cesantiaSeniorityYears: 11,
    sis: 0.0178, crp: 0.009, lifeExpectancy: 0.0072, afpEmployerAccount: 0.001,
    mutualBase: 0.0093, mutualAdicional: 0,
    overtimeFactor: 1.5, gratificationPct: 0.25, gratificationCapIMM: 4.75, voluntaryLimitPct: 0.15,
  },
  gratificationIncludesOvertime: true,
  taxBrackets: [
    { fromUTM: 0, toUTM: 13.5, factor: 0, rebateUTM: 0 },
    { fromUTM: 13.5, toUTM: 30, factor: 0.04, rebateUTM: 0.54 },
    { fromUTM: 30, toUTM: 50, factor: 0.08, rebateUTM: 1.74 },
    { fromUTM: 50, toUTM: 70, factor: 0.135, rebateUTM: 4.49 },
    { fromUTM: 70, toUTM: 90, factor: 0.23, rebateUTM: 11.14 },
    { fromUTM: 90, toUTM: 120, factor: 0.304, rebateUTM: 17.8 },
    { fromUTM: 120, toUTM: 310, factor: 0.35, rebateUTM: 23.32 },
    { fromUTM: 310, toUTM: null, factor: 0.4, rebateUTM: 38.82 },
  ],
  familyAllowance: [
    { maxIncome: 649039, amountPerCharge: 22601 }, { maxIncome: 947990, amountPerCharge: 13870 },
    { maxIncome: 1478539, amountPerCharge: 4382 }, { maxIncome: null, amountPerCharge: 0 },
  ],
  source: [{ label: "Previred / SII / Ley 21.830 (rrhh-liquidacion-1.txt)", fetchedAt: "2026-11-10" }],
};

// Parámetros guardados + seed (lo guardado manda), ordenados por período.
export function readPayrollParamsList(): PayrollParams[] {
  const byPeriod = new Map<string, PayrollParams>([[seedPayrollParams.period, seedPayrollParams]]);
  for (const item of readJson<PayrollParams[]>(keys.payrollParams, [])) byPeriod.set(item.period, item);
  return [...byPeriod.values()].sort((a, b) => a.period.localeCompare(b.period));
}
export const getPayrollParams = (period: string): PayrollParams | undefined => readPayrollParamsList().find((item) => item.period === period);

// Base para un período nuevo: copia los parámetros del período anterior más cercano para editarlos.
export function paramsTemplateFor(period: string): PayrollParams {
  const list = readPayrollParamsList();
  const previous = [...list].reverse().find((item) => item.period < period) ?? list[list.length - 1];
  return { ...structuredClone(previous), period };
}

export function validatePayrollParams(params: PayrollParams): string | null {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(params.period)) return "Período inválido (AAAA-MM).";
  const positives: Array<[string, number]> = [["UF", params.uf], ["UF ISAPRE", params.ufIsapre], ["UTM", params.utm], ["IMM", params.imm],
    ["Jornada máxima", params.weeklyMaxHours], ["Tope AFP (UF)", params.caps.afpUF], ["Tope cesantía (UF)", params.caps.cesantiaUF]];
  const bad = positives.find(([, value]) => !Number.isFinite(value) || value <= 0);
  if (bad) return `${bad[0]} debe ser mayor que 0.`;
  if (Object.keys(params.rates.afpCommission).length === 0) return "Carga al menos una AFP con su comisión.";
  const brackets = params.taxBrackets;
  if (brackets.length === 0 || brackets.some((b, i) => (i > 0 && b.fromUTM < brackets[i - 1].fromUTM) || b.factor < 0 || b.factor > 1)) return "La tabla de impuesto es inválida (tramos ascendentes, factor entre 0 y 1).";
  return null;
}

export function savePayrollParams(params: PayrollParams, actor: { user: string; role: Role }): Result<PayrollParams> {
  if (!can(actor.role, "payroll.params")) return fail("Solo Contabilidad o Administrador puede editar los parámetros de remuneraciones.");
  const invalid = validatePayrollParams(params);
  if (invalid) return fail(invalid);
  const before = getPayrollParams(params.period);
  const saved = runAtomic([keys.payrollParams, keys.auditLog], [
    () => updateJson<PayrollParams[]>(keys.payrollParams, [], (list) => [...list.filter((item) => item.period !== params.period), params]) !== null,
    () => appendAudit({
      user: actor.user, role: actor.role, entity: "payroll", entityId: `params-${params.period}`, action: before ? "updateParams" : "createParams",
      before: before && { uf: before.uf, utm: before.utm, imm: before.imm }, after: { uf: params.uf, utm: params.utm, imm: params.imm },
    }),
  ]);
  return saved ? ok(params) : fail("No se pudieron guardar los parámetros.");
}

// Impuesto único de segunda categoría: tramos en UTM por la UTM del mes.
export function incomeTax(taxableBase: number, params: PayrollParams): { tax: number; bracket?: TaxBracket } {
  const bracket = params.taxBrackets.find((b) => taxableBase > b.fromUTM * params.utm && (b.toUTM === null || taxableBase <= b.toUTM * params.utm));
  if (!bracket) return { tax: 0 };
  return { tax: Math.max(0, round(taxableBase * bracket.factor - bracket.rebateUTM * params.utm)), bracket };
}

function yearsBetween(from: string | undefined, to: string): number {
  if (!from) return 0;
  const start = Date.parse(from);
  if (Number.isNaN(start)) return 0;
  return (Date.parse(to) - start) / (365.25 * 24 * 3600 * 1000);
}

// Días sin remuneración (licencia médica y permiso sin goce) dentro del mes; el mes comercial es de 30 días.
export function unpaidLeaveDays(leaves: Array<{ employeeId: string; type: string; startDate: string; endDate: string }>, employeeId: string, period: string): number {
  const first = Date.parse(`${period}-01`);
  const last = Date.UTC(Number(period.slice(0, 4)), Number(period.slice(5, 7)), 0);
  let days = 0;
  for (const leave of leaves) {
    if (leave.employeeId !== employeeId || !["Licencia médica", "Permiso sin goce"].includes(leave.type)) continue;
    const from = Math.max(first, Date.parse(leave.startDate)), to = Math.min(last, Date.parse(leave.endDate));
    if (to >= from) days += Math.round((to - from) / 86400000) + 1;
  }
  return Math.min(30, days);
}

// Cálculo puro de la liquidación. Cada concepto se redondea al peso por separado.
export function computePayslip(employee: PayrollEmployee, params: PayrollParams, options: { daysWorked?: number } = {}): Result<Payslip> {
  const r = params.rates;
  if (!(params.uf > 0) || !(params.utm > 0) || !(params.imm > 0)) return fail(`Faltan UF, UTM o IMM del período ${params.period}.`);
  if (!(employee.monthlySalary > 0) || !(employee.weeklyHours > 0)) return fail(`${employee.name}: sueldo y jornada semanal deben ser mayores que 0.`);
  const days = Math.min(30, Math.max(0, options.daysWorked ?? 30));
  const lines: PayslipLine[] = [];
  const warnings: string[] = [];
  const add = (line: PayslipLine) => { lines.push(line); return line.amount; };
  const minSalary = params.imm * Math.min(1, employee.weeklyHours / params.weeklyMaxHours);
  if (employee.monthlySalary < minSalary) warnings.push(`El sueldo base está bajo el ingreso mínimo proporcional a la jornada (${round(minSalary)}).`);
  if (employee.weeklyHours > params.weeklyMaxHours) warnings.push(`La jornada de ${employee.weeklyHours} h supera el máximo vigente (${params.weeklyMaxHours} h).`);

  const base = round(employee.monthlySalary / 30 * days);
  const hourValue = employee.monthlySalary * 7 / 30 / employee.weeklyHours;
  const overtimeHours = employee.overtimeHours ?? 0;
  const overtime = round(hourValue * r.overtimeFactor * overtimeHours);
  let imponible = add({ code: "sueldo", label: "Sueldo base", amount: base, kind: "imponible", base: employee.monthlySalary, detail: `${days} de 30 días` });
  let gratification = 0;
  const gratBase = base + (params.gratificationIncludesOvertime ? overtime : 0);
  if (employee.gratificationMode === "Art50") gratification = round(Math.min(gratBase * r.gratificationPct, params.imm * r.gratificationCapIMM / 12));
  else if (employee.gratificationMode === "Pactada") gratification = round(employee.gratificationAmount ?? 0);
  if (gratification > 0) {
    imponible += add({
      code: "gratificacion", label: "Gratificación", amount: gratification, kind: "imponible", base: gratBase, rate: r.gratificationPct,
      detail: employee.gratificationMode === "Art50" ? `Art. 50: ${percent(r.gratificationPct)}, tope ${r.gratificationCapIMM} IMM / 12` : "Pactada",
    });
  }
  if (overtime > 0) {
    imponible += add({ code: "horasExtra", label: "Horas extra", amount: overtime, kind: "imponible", base: round(hourValue), rate: r.overtimeFactor, detail: `${overtimeHours} h x valor hora ${round(hourValue)} x ${r.overtimeFactor}` });
  }
  let nonImponible = 0;
  employee.fixedAllowances.forEach((item, index) => {
    if (item.amount <= 0) return;
    const amount = add({ code: `haber-${index}`, label: item.name, amount: round(item.amount), kind: item.imponible ? "imponible" : "noImponible" });
    if (item.imponible) imponible += amount; else nonImponible += amount;
  });

  const isHonorarios = employee.contractType === "Honorarios";
  const afpCap = round(params.caps.afpUF * params.uf);
  const cesCap = round(params.caps.cesantiaUF * params.uf);
  const baseAfp = Math.min(imponible, afpCap);
  const baseCes = Math.min(imponible, cesCap);
  if (imponible > afpCap) warnings.push(`El imponible supera el tope de ${params.caps.afpUF} UF (${afpCap}); las cotizaciones se calculan sobre el tope.`);

  let afpAmount = 0, healthLegal = 0, cesWorker = 0, apvTaxFree = 0;
  let cesRates: CesantiaRate = { worker: 0, employer: 0 };
  if (isHonorarios) warnings.push("Honorarios: no se calculan cotizaciones ni impuesto único; la retención de la boleta no está incluida.");
  else {
    const commission = r.afpCommission[employee.afp];
    if (commission === undefined) return fail(`${employee.name}: la AFP "${employee.afp}" no tiene comisión cargada en los parámetros de ${params.period}.`);
    afpAmount = round(baseAfp * r.afpMandatory) + round(baseAfp * commission);
    add({ code: "afp", label: `AFP ${employee.afp}`, amount: afpAmount, kind: "descLegal", base: baseAfp, rate: r.afpMandatory + commission, detail: `${percent(r.afpMandatory)} + comisión ${percent(commission)}` });
    healthLegal = round(baseAfp * r.health);
    if (employee.healthSystem === "ISAPRE") {
      if (!(employee.isaprePlanUF && employee.isaprePlanUF > 0)) return fail(`${employee.name}: falta el plan ISAPRE en UF.`);
      const plan = round(employee.isaprePlanUF * params.ufIsapre);
      add({ code: "salud", label: `Salud legal ${percent(r.health)}${employee.isapreName ? ` (ISAPRE ${employee.isapreName})` : " (ISAPRE)"}`, amount: healthLegal, kind: "descLegal", base: baseAfp, rate: r.health });
      const extra = Math.max(0, plan - healthLegal);
      if (extra > 0) add({ code: "saludAdicional", label: "Cotización voluntaria ISAPRE (plan sobre el 7 %)", amount: extra, kind: "descLegal", base: plan, detail: `Plan ${employee.isaprePlanUF} UF x ${params.ufIsapre} = ${plan}; diferencia sobre el 7 %` });
    } else add({ code: "salud", label: `Salud FONASA ${percent(r.health)}`, amount: healthLegal, kind: "descLegal", base: baseAfp, rate: r.health });
    const years = yearsBetween(employee.contractStart, `${params.period}-01`);
    cesRates = employee.contractType === "Indefinido" ? (years >= r.cesantiaSeniorityYears ? r.cesantia.Indef11mas : r.cesantia.Indefinido) : r.cesantia.PlazoFijo;
    if (employee.retiredOver65) cesRates = { worker: 0, employer: 0 };
    cesWorker = round(baseCes * cesRates.worker);
    if (cesRates.worker > 0) add({ code: "cesantia", label: "Seguro de cesantía", amount: cesWorker, kind: "descLegal", base: baseCes, rate: cesRates.worker });
    for (const item of employee.recurringDeductions) if (item.type === "apv" && item.apvRegime === "B") apvTaxFree += Math.min(item.amount, round(params.caps.apvMonthlyUF * params.uf));
    const { tax, bracket } = incomeTax(Math.max(0, imponible - afpAmount - healthLegal - cesWorker - apvTaxFree), params);
    if (tax > 0) add({ code: "impuesto", label: "Impuesto único segunda categoría", amount: tax, kind: "descLegal", base: imponible - afpAmount - healthLegal - cesWorker - apvTaxFree, rate: bracket?.factor, detail: `Factor ${bracket?.factor} menos rebaja de ${bracket?.rebateUTM} UTM` });
  }
  const taxableBase = isHonorarios ? 0 : Math.max(0, imponible - afpAmount - healthLegal - cesWorker - apvTaxFree);

  // Asignación familiar (no imponible) según el tramo de renta imponible.
  if (!isHonorarios && employee.familyCharges > 0) {
    const tier = params.familyAllowance.find((item) => item.maxIncome === null || imponible <= item.maxIncome);
    const amount = round((tier?.amountPerCharge ?? 0) * employee.familyCharges);
    if (amount > 0) nonImponible += add({ code: "familiar", label: "Asignación familiar", amount, kind: "noImponible", detail: `${employee.familyCharges} carga(s)` });
  }
  const gross = imponible + nonImponible;
  let otherVoluntary = 0;
  employee.recurringDeductions.forEach((item, index) => {
    if (item.amount <= 0) return;
    add({ code: `desc-${index}`, label: item.name, amount: round(item.amount), kind: "descVoluntario", detail: item.type + (item.apvRegime ? ` régimen ${item.apvRegime}` : "") });
    if (item.type !== "apv") otherVoluntary += round(item.amount);
  });
  if (otherVoluntary > gross * r.voluntaryLimitPct) warnings.push(`Los otros descuentos superan el ${percent(r.voluntaryLimitPct)} de la remuneración (art. 58).`);
  const sum = (kind: PayslipLineKind) => lines.filter((line) => line.kind === kind).reduce((total, line) => total + line.amount, 0);
  const legalDeductions = sum("descLegal"), voluntaryDeductions = sum("descVoluntario");
  const deductions = legalDeductions + voluntaryDeductions;
  if (deductions > gross) return fail(`${employee.name}: los descuentos (${deductions}) superan los haberes (${gross}).`);

  const employerContributions: PayslipLine[] = [];
  if (!isHonorarios) {
    const contrib = (code: string, label: string, rate: number, over: number) => {
      if (rate > 0) employerContributions.push({ code, label, amount: round(over * rate), kind: "aporteEmpleador", base: over, rate });
    };
    contrib("sis", "SIS", r.sis, baseAfp);
    contrib("crp", "Rentabilidad protegida", r.crp, baseAfp);
    contrib("vida", "Expectativa de vida", r.lifeExpectancy, baseAfp);
    contrib("cuentaAfp", "Cuenta individual AFP", r.afpEmployerAccount, baseAfp);
    contrib("cesantiaEmp", "Seguro de cesantía empleador", cesRates.employer, baseCes);
    contrib("mutual", "Mutual / ISL (básica + SANNA + adicional)", r.mutualBase + r.mutualAdicional, baseAfp);
  }
  const employerTotal = employerContributions.reduce((total, line) => total + line.amount, 0);
  const health = employee.healthSystem === "ISAPRE" ? `ISAPRE ${employee.isapreName ?? ""} ${employee.isaprePlanUF ?? ""} UF`.replace(/\s+/g, " ").trim() : "FONASA";
  return ok({
    period: params.period, daysWorked: days,
    worker: { rut: employee.rut, afp: employee.afp, health, contractType: employee.contractType },
    lines, totalImponible: imponible, totalNoImponible: nonImponible, gross, taxableBase, legalDeductions, voluntaryDeductions, deductions, net: gross - deductions,
    employerContributions, employerTotal, employerCost: gross + employerTotal,
    values: { uf: params.uf, ufIsapre: params.ufIsapre, utm: params.utm, imm: params.imm, afpCap, cesantiaCap: cesCap }, warnings,
  });
}

// Migración del modelo plano (deductionPercent): completa los campos previsionales sin perder datos.
export function migratePayrollFields<T extends { weeklyHours?: number; deductionPercent?: number }>(employee: T & Partial<PayrollEmployeeFields>): Omit<T, "deductionPercent"> & PayrollEmployeeFields {
  const { deductionPercent, ...rest } = employee;
  void deductionPercent;
  return {
    ...rest,
    rut: employee.rut ?? "", afp: employee.afp ?? "Habitat", healthSystem: employee.healthSystem ?? "FONASA",
    familyCharges: employee.familyCharges ?? 0, gratificationMode: employee.gratificationMode ?? "Art50",
    weeklyHours: employee.weeklyHours ?? 42, fixedAllowances: employee.fixedAllowances ?? [], recurringDeductions: employee.recurringDeductions ?? [],
  };
}
