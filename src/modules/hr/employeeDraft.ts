import type { GratificationMode, HealthSystem, PayrollContractType, PayrollEmployeeFields } from "../../data/payroll";
import { emptyContractData, isValidRut } from "./contractTemplate";
import type { ContractFormData, ContractEmployee } from "./contractTemplate";

// Borrador del formulario de trabajador: todo texto, se convierte al guardar.
export type EmployeeDraft = {
  name: string; position: string; contractType: PayrollContractType; contractStart: string; contractEnd: string;
  employmentContractNumber: string; workSchedule: string; workplace: string; monthlySalary: string; hoursPerMonth: string;
  direct: boolean; contractCodes: string[]; supervisorId: string; supervisorLogin: string; login: string;
  rut: string; afp: string; healthSystem: HealthSystem; isapreName: string; isaprePlanUF: string; familyCharges: string;
  gratificationMode: GratificationMode; gratificationAmount: string; weeklyHours: string; overtimeHours: string;
  colacion: string; movilizacion: string; bono: string; sindical: string; anticipo: string; prestamo: string; apv: string;
  nacionalidad: string; fechaNacimiento: string; estadoCivil: string; domicilio: string; correo: string; funciones: string;
  lugarTrabajoComuna: string; lugarTrabajoCiudad: string; jornada: ContractFormData["jornada"]; diasPorSemana: string;
  distribucionJornada: string; esProfesionalOGerente: boolean; obraDescripcion: string; tipoPermisoMigratorio: string;
  vencimientoPermiso: string; banco: string; cuentaNumero: string;
};
export type EmployeeDraftTextKey = { [K in keyof EmployeeDraft]: EmployeeDraft[K] extends string ? K : never }[keyof EmployeeDraft];

export const blankDraft = (contractCode?: string): EmployeeDraft => ({
  name: "", position: "", contractType: "Indefinido", contractStart: new Date().toISOString().slice(0, 10), contractEnd: "",
  employmentContractNumber: "", workSchedule: "", workplace: "", monthlySalary: "", hoursPerMonth: "180", direct: true,
  contractCodes: contractCode ? [contractCode] : [], supervisorId: "", supervisorLogin: "", login: "",
  rut: "", afp: "Habitat", healthSystem: "FONASA", isapreName: "", isaprePlanUF: "", familyCharges: "0",
  gratificationMode: "Art50", gratificationAmount: "", weeklyHours: "42", overtimeHours: "",
  colacion: "", movilizacion: "", bono: "", sindical: "", anticipo: "", prestamo: "", apv: "",
  nacionalidad: emptyContractData.nacionalidad, fechaNacimiento: "", estadoCivil: emptyContractData.estadoCivil, domicilio: "", correo: "", funciones: "",
  lugarTrabajoComuna: "", lugarTrabajoCiudad: "", jornada: "ordinaria", diasPorSemana: "5", distribucionJornada: "",
  esProfesionalOGerente: false, obraDescripcion: "", tipoPermisoMigratorio: "", vencimientoPermiso: "", banco: "", cuentaNumero: "",
});

const num = (value: string) => { const n = Number(value); return Number.isFinite(n) ? n : 0; };

// Error de los campos previsionales (null si están bien). El RUT es opcional al crear, pero si se escribe debe ser válido.
export function legalDraftError(draft: EmployeeDraft): string | null {
  if (draft.rut.trim() && !isValidRut(draft.rut)) return "El RUT del trabajador no es válido (módulo 11).";
  if (!(num(draft.weeklyHours) > 0)) return "Indica las horas semanales de la jornada.";
  if (draft.healthSystem === "ISAPRE" && !(num(draft.isaprePlanUF) > 0)) return "Indica el plan ISAPRE en UF.";
  if (draft.gratificationMode === "Pactada" && !(num(draft.gratificationAmount) > 0)) return "Indica el monto de la gratificación pactada.";
  if (!(num(draft.familyCharges) >= 0)) return "Las cargas familiares no pueden ser negativas.";
  return null;
}

export function draftToParts(d: EmployeeDraft): { fields: PayrollEmployeeFields; contractData: ContractFormData } {
  const allowance = (name: string, value: string, imponible: boolean) => ({ name, amount: num(value), imponible });
  const deduction = (name: string, value: string, type: PayrollEmployeeFields["recurringDeductions"][number]["type"], apvRegime?: "A" | "B") => ({ name, amount: num(value), type, apvRegime });
  const isapre = d.healthSystem === "ISAPRE";
  return {
    fields: {
      rut: d.rut.trim(), afp: d.afp, healthSystem: d.healthSystem,
      isapreName: isapre ? d.isapreName.trim() || undefined : undefined, isaprePlanUF: isapre ? num(d.isaprePlanUF) : undefined,
      familyCharges: Math.max(0, Math.floor(num(d.familyCharges))), gratificationMode: d.gratificationMode,
      gratificationAmount: d.gratificationMode === "Pactada" ? num(d.gratificationAmount) : undefined,
      weeklyHours: num(d.weeklyHours), overtimeHours: num(d.overtimeHours) || undefined,
      fixedAllowances: [allowance("Colación", d.colacion, false), allowance("Movilización", d.movilizacion, false), allowance("Bono fijo", d.bono, true)].filter((item) => item.amount > 0),
      recurringDeductions: [deduction("Cuota sindical", d.sindical, "sindical"), deduction("Anticipo", d.anticipo, "anticipo"), deduction("Préstamo (cuota)", d.prestamo, "prestamo"), deduction("APV", d.apv, "apv", "B")]
        .filter((item) => item.amount > 0).map((item) => item.apvRegime ? item : { name: item.name, amount: item.amount, type: item.type }),
    },
    contractData: {
      nacionalidad: d.nacionalidad.trim(), fechaNacimiento: d.fechaNacimiento, estadoCivil: d.estadoCivil, domicilio: d.domicilio.trim(), correo: d.correo.trim(),
      funciones: d.funciones.trim(), lugarTrabajoComuna: d.lugarTrabajoComuna.trim(), lugarTrabajoCiudad: d.lugarTrabajoCiudad.trim(), jornada: d.jornada,
      diasPorSemana: num(d.diasPorSemana), distribucionJornada: d.distribucionJornada.trim(), esProfesionalOGerente: d.esProfesionalOGerente,
      obraDescripcion: d.obraDescripcion.trim(), tipoPermisoMigratorio: d.tipoPermisoMigratorio.trim(), vencimientoPermiso: d.vencimientoPermiso,
      banco: d.banco.trim(), cuentaNumero: d.cuentaNumero.trim(),
    },
  };
}

export function employeeToDraft(e: ContractEmployee & { contractCodes?: string[]; contractCode: string; hoursPerMonth: number; direct: boolean; contractEnd?: string; workSchedule?: string; supervisorId?: string; supervisorLogin?: string; login?: string; contractData?: ContractFormData }): EmployeeDraft {
  const amountOf = (list: Array<{ name: string; amount: number }>, name: string) => { const item = list.find((x) => x.name === name); return item ? String(item.amount) : ""; };
  const c = { ...emptyContractData, ...e.contractData };
  return {
    ...blankDraft(),
    name: e.name, position: e.position, contractType: e.contractType, contractStart: e.contractStart ?? "", contractEnd: e.contractEnd ?? "",
    employmentContractNumber: e.employmentContractNumber ?? "", workSchedule: e.workSchedule ?? "", workplace: e.workplace ?? "",
    monthlySalary: String(e.monthlySalary), hoursPerMonth: String(e.hoursPerMonth), direct: e.direct,
    contractCodes: e.contractCodes?.length ? e.contractCodes : e.contractCode ? [e.contractCode] : [],
    supervisorId: e.supervisorId ?? "", supervisorLogin: e.supervisorLogin ?? "", login: e.login ?? "",
    rut: e.rut, afp: e.afp, healthSystem: e.healthSystem, isapreName: e.isapreName ?? "", isaprePlanUF: e.isaprePlanUF ? String(e.isaprePlanUF) : "",
    familyCharges: String(e.familyCharges), gratificationMode: e.gratificationMode, gratificationAmount: e.gratificationAmount ? String(e.gratificationAmount) : "",
    weeklyHours: String(e.weeklyHours), overtimeHours: e.overtimeHours ? String(e.overtimeHours) : "",
    colacion: amountOf(e.fixedAllowances, "Colación"), movilizacion: amountOf(e.fixedAllowances, "Movilización"), bono: amountOf(e.fixedAllowances, "Bono fijo"),
    sindical: amountOf(e.recurringDeductions, "Cuota sindical"), anticipo: amountOf(e.recurringDeductions, "Anticipo"),
    prestamo: amountOf(e.recurringDeductions, "Préstamo (cuota)"), apv: amountOf(e.recurringDeductions, "APV"),
    nacionalidad: c.nacionalidad, fechaNacimiento: c.fechaNacimiento, estadoCivil: c.estadoCivil, domicilio: c.domicilio, correo: c.correo, funciones: c.funciones,
    lugarTrabajoComuna: c.lugarTrabajoComuna, lugarTrabajoCiudad: c.lugarTrabajoCiudad, jornada: c.jornada, diasPorSemana: String(c.diasPorSemana),
    distribucionJornada: c.distribucionJornada, esProfesionalOGerente: Boolean(c.esProfesionalOGerente), obraDescripcion: c.obraDescripcion ?? "",
    tipoPermisoMigratorio: c.tipoPermisoMigratorio ?? "", vencimientoPermiso: c.vencimientoPermiso ?? "", banco: c.banco ?? "", cuentaNumero: c.cuentaNumero ?? "",
  };
}
