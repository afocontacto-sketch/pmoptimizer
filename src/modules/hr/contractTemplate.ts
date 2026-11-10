import type { PayrollEmployee, PayrollParams } from "../../data/payroll";
import { fail, ok } from "../../data/result";
import type { Result } from "../../data/result";
import { contractTemplateText } from "./contractTemplateText";
import type { HrCompany } from "./hrCompany";

// Generación del texto del contrato a partir de la plantilla del abogado ({{variable}} y {{#si cond}}...{{/si}}).
export type ContractFormData = {
  nacionalidad: string; fechaNacimiento: string; estadoCivil: string; domicilio: string; correo: string;
  funciones: string; funcionesAlternativas?: string; lugarTrabajoComuna: string; lugarTrabajoCiudad: string;
  jornada: "ordinaria" | "parcial" | "excluida"; diasPorSemana: number; distribucionJornada: string; fundamentoExclusion?: string;
  esProfesionalOGerente?: boolean; obraDescripcion?: string; obraFechaEstimadaTermino?: string;
  tipoPermisoMigratorio?: string; vencimientoPermiso?: string;
  formaPago?: string; banco?: string; cuentaNumero?: string; fechaFirma?: string;
};
export type ContractEmployee = PayrollEmployee & { position: string; employmentContractNumber?: string; contractEnd?: string; workplace?: string };
export type ContractInput = { employee: ContractEmployee; data: ContractFormData; company: HrCompany; params: PayrollParams; today: string };
export type ContractText = { text: string; warnings: string[] };

export const emptyContractData: ContractFormData = {
  nacionalidad: "chilena", fechaNacimiento: "", estadoCivil: "soltero(a)", domicilio: "", correo: "", funciones: "",
  lugarTrabajoComuna: "", lugarTrabajoCiudad: "", jornada: "ordinaria", diasPorSemana: 5, distribucionJornada: "",
};

export function isValidRut(rut: string): boolean {
  const clean = rut.replace(/[.\s-]/g, "").toUpperCase();
  if (!/^\d{6,9}[\dK]$/.test(clean)) return false;
  const body = clean.slice(0, -1);
  let sum = 0, factor = 2;
  for (let index = body.length - 1; index >= 0; index -= 1) { sum += Number(body[index]) * factor; factor = factor === 7 ? 2 : factor + 1; }
  const rest = 11 - (sum % 11);
  return clean.slice(-1) === (rest === 11 ? "0" : rest === 10 ? "K" : String(rest));
}
export function formatRut(rut: string): string {
  const clean = rut.replace(/[.\s-]/g, "").toUpperCase();
  return clean.length < 2 ? rut : `${clean.slice(0, -1).replace(/\B(?=(\d{3})+(?!\d))/g, ".")}-${clean.slice(-1)}`;
}
const pesos = (value: number) => `$${Math.round(value).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".")}`;
const months = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
export const longDate = (iso: string) => `${iso.slice(8, 10)} de ${months[Number(iso.slice(5, 7)) - 1]} de ${iso.slice(0, 4)}`;
const validDate = (iso: string | undefined): iso is string => Boolean(iso && /^\d{4}-\d{2}-\d{2}$/.test(iso) && !Number.isNaN(Date.parse(iso)));
const addYears = (iso: string, years: number) => { const d = new Date(`${iso}T00:00:00Z`); d.setUTCFullYear(d.getUTCFullYear() + years); return d.toISOString().slice(0, 10); };
const addDays = (iso: string, days: number) => new Date(Date.parse(iso) + days * 86400000).toISOString().slice(0, 10);

const units = ["cero", "uno", "dos", "tres", "cuatro", "cinco", "seis", "siete", "ocho", "nueve", "diez", "once", "doce", "trece", "catorce", "quince", "dieciséis", "diecisiete", "dieciocho", "diecinueve", "veinte", "veintiuno", "veintidós", "veintitrés", "veinticuatro", "veinticinco", "veintiséis", "veintisiete", "veintiocho", "veintinueve"];
const tens = ["", "", "", "treinta", "cuarenta", "cincuenta", "sesenta", "setenta", "ochenta", "noventa"];
const hundreds = ["", "ciento", "doscientos", "trescientos", "cuatrocientos", "quinientos", "seiscientos", "setecientos", "ochocientos", "novecientos"];
const apocope = (text: string) => text.endsWith("veintiuno") ? `${text.slice(0, -9)}veintiún` : text.endsWith("uno") ? `${text.slice(0, -3)}un` : text;
export function numberToWords(value: number): string {
  const n = Math.floor(value);
  if (n < 30) return units[n];
  if (n < 100) return tens[Math.floor(n / 10)] + (n % 10 ? ` y ${units[n % 10]}` : "");
  if (n === 100) return "cien";
  if (n < 1000) return `${hundreds[Math.floor(n / 100)]}${n % 100 ? ` ${numberToWords(n % 100)}` : ""}`;
  if (n < 1000000) { const th = Math.floor(n / 1000); return `${th === 1 ? "mil" : `${apocope(numberToWords(th))} mil`}${n % 1000 ? ` ${numberToWords(n % 1000)}` : ""}`; }
  const mi = Math.floor(n / 1000000);
  return `${mi === 1 ? "un millón" : `${apocope(numberToWords(mi))} millones`}${n % 1000000 ? ` ${numberToWords(n % 1000000)}` : ""}`;
}

type Context = { vars: Record<string, string>; conds: Record<string, boolean> };

// Variables ya formateadas y condiciones booleanas que consume la plantilla.
export function buildContractContext(input: ContractInput): Context {
  const { employee: e, data: d, company: c } = input;
  const type = e.contractType;
  const isapre = e.healthSystem === "ISAPRE";
  const text = (value: string | undefined) => (value ?? "").trim();
  const imponibleExtras = e.fixedAllowances.filter((item) => item.amount > 0 && item.imponible).map((item) => `${item.name}: ${pesos(item.amount)} mensuales`).join("; ");
  const noImponibleExtras = e.fixedAllowances.filter((item) => item.amount > 0 && !item.imponible).map((item) => `${item.name}: ${pesos(item.amount)} mensuales`).join("; ");
  const form = text(d.formaPago) || c.defaults.formaPago;
  const signDate = d.fechaFirma || input.today;
  const vars: Record<string, string> = {
    "contrato.numero": text(e.employmentContractNumber) || `TRB-${e.id}`,
    ciudadFecha: c.ciudad ? `${c.ciudad}, ${validDate(signDate) ? longDate(signDate) : ""}` : "",
    "empresa.razonSocial": text(c.razonSocial), "empresa.rut": c.rut ? formatRut(c.rut) : "", "empresa.giro": text(c.giro),
    "empresa.representante": text(c.representante), "empresa.representanteRut": c.representanteRut ? formatRut(c.representanteRut) : "",
    "empresa.domicilio": text(c.domicilio), "empresa.ciudad": text(c.ciudad), "empresa.correo": text(c.correo), "empresa.mutualidad": text(c.mutualidad),
    "empresa.cajaCompensacion": text(c.cajaCompensacion), "empresa.correoDatos": text(c.correoDatos), "empresa.delegadoDatos": text(c.delegadoDatos),
    "trabajador.nombre": text(e.name), "trabajador.rut": e.rut ? formatRut(e.rut) : "", "trabajador.nacionalidad": text(d.nacionalidad),
    "trabajador.fechaNacimiento": validDate(d.fechaNacimiento) ? longDate(d.fechaNacimiento) : "", "trabajador.estadoCivil": text(d.estadoCivil),
    "trabajador.domicilio": text(d.domicilio), "trabajador.correo": text(d.correo) || "no informa",
    "trabajador.tipoPermisoMigratorio": text(d.tipoPermisoMigratorio), "trabajador.vencimientoPermiso": validDate(d.vencimientoPermiso) ? longDate(d.vencimientoPermiso) : "",
    cargo: text(e.position), funciones: text(d.funciones), funcionesAlternativas: text(d.funcionesAlternativas),
    lugarTrabajo: text(e.workplace), lugarTrabajoComuna: text(d.lugarTrabajoComuna), lugarTrabajoCiudad: text(d.lugarTrabajoCiudad),
    horasSemanales: String(e.weeklyHours), diasPorSemana: String(d.diasPorSemana), distribucionJornada: text(d.distribucionJornada),
    colacionMinutos: String(c.defaults.colacionMinutos), fundamentoExclusion: text(d.fundamentoExclusion), sistemaControlAsistencia: text(c.defaults.sistemaControlAsistencia),
    sueldoBase: pesos(e.monthlySalary), sueldoBaseEnPalabras: `${numberToWords(e.monthlySalary)} pesos`,
    gratificacionTexto: `${pesos(e.gratificationAmount ?? 0)} mensuales`, otrosHaberes: imponibleExtras, asignacionesNoImponibles: noImponibleExtras,
    periodoPago: c.defaults.periodoPago, diaPago: String(c.defaults.diaPago), formaPago: form, banco: text(d.banco), cuentaNumero: text(d.cuentaNumero),
    reajusteTexto: text(c.defaults.reajusteTexto), afp: text(e.afp), salud: isapre ? text(e.isapreName) || "ISAPRE" : "FONASA",
    planIsapreUF: String(e.isaprePlanUF ?? "").replace(".", ","),
    protocoloKarinVersion: text(c.protocoloKarinVersion), protocoloKarinFecha: validDate(c.protocoloKarinFecha) ? longDate(c.protocoloKarinFecha) : "",
    canalDenunciaKarin: text(c.canalDenunciaKarin), paisesTransferencia: text(c.defaults.paisesTransferencia),
    fechaInicio: validDate(e.contractStart) ? longDate(e.contractStart) : "", fechaTermino: validDate(e.contractEnd) ? longDate(e.contractEnd) : "",
    obraDescripcion: text(d.obraDescripcion), obraFechaEstimadaTermino: validDate(d.obraFechaEstimadaTermino) ? longDate(d.obraFechaEstimadaTermino) : "",
    fechaFirma: validDate(signDate) ? longDate(signDate) : "",
  };
  const limited = d.jornada !== "excluida";
  const conds: Record<string, boolean> = {
    indefinido: type === "Indefinido", plazoFijo: type === "Plazo fijo", obraFaena: type === "Obra o faena",
    jornadaOrdinaria: d.jornada === "ordinaria", jornadaParcial: d.jornada === "parcial", jornadaExcluida: !limited, jornadaLimitada: limited,
    jornadaConColacion: limited && c.defaults.colacionMinutos > 0,
    gratificacionArt50: e.gratificationMode === "Art50", gratificacionArt47: e.gratificationMode === "Art47", gratificacionConvencional: e.gratificationMode === "Pactada",
    isapre, esExtranjero: text(d.nacionalidad).toLowerCase() !== "chilena",
    sinReglamentoInterno: !c.tieneRIOHS && c.numTrabajadores < 10, tieneReglamentoInterno: c.tieneRIOHS,
    pagoTransferencia: form === "transferencia electrónica",
    tieneFuncionesAlternativas: Boolean(text(d.funcionesAlternativas)), tieneOtrosHaberes: Boolean(imponibleExtras), tieneAsignacionesNoImponibles: Boolean(noImponibleExtras),
    beneficiosEspecie: false, tieneReajuste: Boolean(text(c.defaults.reajusteTexto)), tieneCajaCompensacion: Boolean(text(c.cajaCompensacion)), tieneDelegadoDatos: Boolean(text(c.delegadoDatos)),
    requiereDesplazamiento: false, cambioDomicilio: false, teletrabajo: false,
    propiedadIntelectual: c.defaults.propiedadIntelectual, transferenciaInternacional: c.defaults.transferenciaInternacional,
    controlBiometrico: c.defaults.controlBiometrico, firmaElectronica: c.defaults.firmaElectronica,
    obraTieneFechaEstimada: Boolean(text(d.obraFechaEstimadaTermino)),
  };
  return { vars, conds };
}

// Reglas de la sección 3.C del abogado: errores bloquean la generación; advertencias no.
export function validateContract(input: ContractInput): { errors: string[]; warnings: string[] } {
  const { employee: e, data: d, company: c, params } = input;
  const errors: string[] = [], warnings: string[] = [];
  const type = e.contractType;
  if (type === "Honorarios") return { errors: ["Honorarios no genera contrato de trabajo (se rige por contrato civil de prestación de servicios)."], warnings };
  const need = (label: string, value: string | undefined) => { if (!value || !value.trim()) errors.push(`Falta ${label}.`); };
  need("el nombre del trabajador", e.name); need("el cargo", e.position); need("el lugar de trabajo", e.workplace);
  need("el domicilio del trabajador", d.domicilio); need("la nacionalidad", d.nacionalidad); need("el estado civil", d.estadoCivil);
  need("la comuna del lugar de trabajo", d.lugarTrabajoComuna); need("la ciudad del lugar de trabajo", d.lugarTrabajoCiudad);
  need("la razón social de la empresa", c.razonSocial); need("el giro de la empresa", c.giro); need("el representante legal", c.representante);
  need("el domicilio de la empresa", c.domicilio); need("la ciudad de la empresa", c.ciudad); need("la mutualidad de la empresa", c.mutualidad);
  if (!isValidRut(e.rut)) errors.push("RUT del trabajador inválido o ausente.");
  if (!isValidRut(c.rut)) errors.push("RUT de la empresa inválido o ausente.");
  if (!isValidRut(c.representanteRut)) errors.push("RUT del representante legal inválido o ausente.");
  const email = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!email.test(c.correo)) errors.push("Correo de la empresa inválido o ausente.");
  if (!email.test(c.correoDatos)) errors.push("Correo de datos personales de la empresa inválido o ausente.");
  if (d.correo.trim() && !email.test(d.correo)) errors.push("Correo del trabajador inválido.");
  if (!validDate(e.contractStart)) errors.push("Fecha de ingreso inválida o ausente.");
  if (!validDate(d.fechaNacimiento)) errors.push("Fecha de nacimiento inválida o ausente.");
  if ((d.funciones ?? "").trim().length < 50) errors.push("Las funciones deben describirse con al menos 50 caracteres.");
  if (!(e.monthlySalary > 0)) errors.push("Sueldo base inválido.");
  if (e.gratificationMode === "Ninguna") errors.push("Define la gratificación (art. 50, art. 47 o pactada).");
  if (e.gratificationMode === "Pactada" && !(e.gratificationAmount && e.gratificationAmount > 0)) errors.push("La gratificación pactada requiere un monto.");
  if (e.healthSystem === "ISAPRE" && !(e.isaprePlanUF && e.isaprePlanUF > 0)) errors.push("Falta el plan ISAPRE en UF.");
  if (!e.afp.trim()) errors.push("Falta la AFP.");
  if ((d.formaPago || c.defaults.formaPago) === "transferencia electrónica" && !(d.banco?.trim() && d.cuentaNumero?.trim())) errors.push("Pago por transferencia: indica banco y número de cuenta.");
  const start = e.contractStart;
  const max = params.weeklyMaxHours;
  if (d.jornada !== "excluida") {
    if (!(e.weeklyHours > 0)) errors.push("Indica las horas semanales.");
    if (e.weeklyHours > max) errors.push(`La jornada de ${e.weeklyHours} h supera el máximo legal de ${max} h semanales.`);
    if (d.jornada === "parcial" && e.weeklyHours > max * 2 / 3) errors.push(`La jornada parcial no puede superar 2/3 del máximo (${Math.floor(max * 2 / 3 * 10) / 10} h).`);
    if (!(d.diasPorSemana === 5 || d.diasPorSemana === 6)) errors.push("Los días por semana deben ser 5 o 6.");
    else if (e.weeklyHours / d.diasPorSemana > 10) errors.push("La jornada ordinaria diaria supera las 10 horas.");
    need("la distribución de la jornada", d.distribucionJornada);
    if (c.defaults.colacionMinutos < 30) errors.push("La colación debe ser de al menos 30 minutos.");
    need("el sistema de control de asistencia", c.defaults.sistemaControlAsistencia);
    if (e.weeklyHours === max) warnings.push("La jornada es igual al máximo vigente: se ajustará cuando baje el máximo legal (Ley 21.561, 26-04-2028).");
  } else {
    need("el fundamento de la exclusión de jornada", d.fundamentoExclusion);
    warnings.push("Jornada excluida (art. 22): alto riesgo de recalificación.");
  }
  const minimum = params.imm * (d.jornada === "parcial" ? e.weeklyHours / max : 1);
  if (e.monthlySalary < minimum) errors.push(`El sueldo base (${pesos(e.monthlySalary)}) es menor que el ingreso mínimo${d.jornada === "parcial" ? " proporcional" : ""} (${pesos(minimum)}).`);
  if (validDate(d.fechaNacimiento) && validDate(start) && addYears(d.fechaNacimiento, 18) > start) errors.push("El trabajador es menor de 18 años: requiere revisión legal (art. 13 CT).");
  if (type === "Plazo fijo") {
    if (!validDate(e.contractEnd) || !validDate(start) || e.contractEnd <= start) errors.push("Plazo fijo: la fecha de término debe ser posterior a la de inicio.");
    else if (e.contractEnd > addYears(start, d.esProfesionalOGerente ? 2 : 1)) errors.push(`Plazo fijo: el contrato no puede durar más de ${d.esProfesionalOGerente ? 2 : 1} año(s).`);
  }
  if (type === "Obra o faena" && (d.obraDescripcion ?? "").trim().length < 30) errors.push("Obra o faena: describe la obra concreta (mínimo 30 caracteres).");
  if (validDate(d.obraFechaEstimadaTermino) && validDate(start) && d.obraFechaEstimadaTermino <= start) errors.push("La fecha estimada de término de la obra debe ser posterior al inicio.");
  if (d.nacionalidad.trim() && d.nacionalidad.trim().toLowerCase() !== "chilena") {
    if (!d.tipoPermisoMigratorio?.trim()) errors.push("Trabajador extranjero: indica el permiso migratorio.");
    if (!validDate(d.vencimientoPermiso) || (validDate(start) && d.vencimientoPermiso < start)) errors.push("Trabajador extranjero: el permiso migratorio no está vigente a la fecha de ingreso.");
    else if (type === "Plazo fijo" && validDate(e.contractEnd) && d.vencimientoPermiso < e.contractEnd) warnings.push("El permiso migratorio vence durante el contrato.");
  }
  if (!c.protocoloKarinVersion.trim() || !validDate(c.protocoloKarinFecha)) errors.push("No hay protocolo Ley Karin cargado (versión y fecha) en los datos de la empresa.");
  need("el canal de denuncia Ley Karin", c.canalDenunciaKarin);
  if (c.numTrabajadores >= 10 && !c.tieneRIOHS) errors.push("La empresa con 10 o más trabajadores debe tener reglamento interno (RIOHS).");
  const signDate = d.fechaFirma || input.today;
  if (validDate(start) && validDate(signDate)) {
    const days = type === "Obra o faena" ? 5 : 15;
    if (signDate > addDays(start, days)) warnings.push(`La firma excede los ${days} días desde el ingreso (art. 9 CT).`);
  }
  return { errors, warnings };
}

// Aplica bloques condicionales (anidados) y reemplaza variables; informa variables faltantes y condiciones desconocidas.
export function renderTemplate(template: string, ctx: Context): { text: string; missing: string[] } {
  const missing = new Set<string>();
  const block = /\{\{#si ([\w.]+)\}\}((?:(?!\{\{#si )[\s\S])*?)\{\{\/si\}\}/;
  let text = template.replace(/\r\n/g, "\n");
  for (let guard = 0; guard < 1000 && block.test(text); guard += 1) {
    text = text.replace(block, (_all, name: string, body: string) => {
      if (!(name in ctx.conds)) { missing.add(`condición ${name}`); return ""; }
      return ctx.conds[name] ? body : "";
    });
  }
  text = text.replace(/\{\{([\w.]+)\}\}/g, (_all, name: string) => {
    const value = ctx.vars[name];
    if (value === undefined || value === "") { missing.add(name); return ""; }
    return value;
  });
  text = text.split("\n").map((line) => line.replace(/\s+$/, "")).join("\n").replace(/\n{3,}/g, "\n\n").replace(/^\n+|\n+$/g, "");
  return { text, missing: [...missing] };
}

export function generateContractText(input: ContractInput): Result<ContractText> {
  const { errors, warnings } = validateContract(input);
  if (errors.length) return fail(`Contrato bloqueado: ${errors.join(" ")}`);
  const rendered = renderTemplate(contractTemplateText, buildContractContext(input));
  if (rendered.missing.length) return fail(`Contrato bloqueado: faltan datos (${rendered.missing.join(", ")}).`);
  return ok({ text: rendered.text, warnings });
}
