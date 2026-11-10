import { can } from "../../app/permissions";
import type { Role } from "../../app/roles";
import { appendAudit } from "../../data/audit";
import { keys } from "../../data/keys";
import { fail, ok } from "../../data/result";
import type { Result } from "../../data/result";
import { readJson, runAtomic, writeJson } from "../../data/storage";

// Datos de la empresa y valores por defecto del contrato: configuración editable de RRHH (sin condicionales por cliente).
export type HrCompany = {
  razonSocial: string; rut: string; giro: string; representante: string; representanteRut: string;
  domicilio: string; ciudad: string; correo: string; mutualidad: string; cajaCompensacion: string;
  correoDatos: string; delegadoDatos: string; numTrabajadores: number; tieneRIOHS: boolean;
  protocoloKarinVersion: string; protocoloKarinFecha: string; canalDenunciaKarin: string;
  defaults: {
    periodoPago: string; diaPago: number; formaPago: string; colacionMinutos: number; sistemaControlAsistencia: string;
    reajusteTexto: string; propiedadIntelectual: boolean; firmaElectronica: boolean; controlBiometrico: boolean;
    transferenciaInternacional: boolean; paisesTransferencia: string;
  };
};

export const defaultHrCompany: HrCompany = {
  razonSocial: "Mantenciones Industriales Demo SpA", rut: "76.123.456-7", giro: "Mantenimiento y reparación de maquinaria industrial",
  representante: "Andrea Soto Valenzuela", representanteRut: "12.345.678-5",
  domicilio: "Av. Industrial 1234, Quilicura", ciudad: "Santiago", correo: "rrhh@demo.cl", mutualidad: "ACHS", cajaCompensacion: "Los Andes",
  correoDatos: "datos@demo.cl", delegadoDatos: "Andrea Soto Valenzuela", numTrabajadores: 4, tieneRIOHS: false,
  protocoloKarinVersion: "v1.0", protocoloKarinFecha: "2026-01-15", canalDenunciaKarin: "denuncias@demo.cl",
  defaults: {
    periodoPago: "mensuales", diaPago: 5, formaPago: "transferencia electrónica", colacionMinutos: 60,
    sistemaControlAsistencia: "libro de asistencia", reajusteTexto: "", propiedadIntelectual: false, firmaElectronica: false,
    controlBiometrico: false, transferenciaInternacional: false, paisesTransferencia: "",
  },
};

export function readHrCompany(): HrCompany {
  const saved = readJson<Partial<HrCompany>>(keys.hrCompany, {});
  return { ...defaultHrCompany, ...saved, defaults: { ...defaultHrCompany.defaults, ...saved.defaults } };
}

export function saveHrCompany(company: HrCompany, actor: { user: string; role: Role }): Result<HrCompany> {
  if (!can(actor.role, "hr.edit")) return fail("Solo Contabilidad o Administrador puede editar los datos de la empresa.");
  if (!company.razonSocial.trim()) return fail("Indica la razón social.");
  if (!Number.isInteger(company.numTrabajadores) || company.numTrabajadores < 0) return fail("El número de trabajadores debe ser un entero mayor o igual a 0.");
  const saved = runAtomic([keys.hrCompany, keys.auditLog], [
    () => writeJson(keys.hrCompany, company),
    () => appendAudit({ user: actor.user, role: actor.role, entity: "employee", entityId: "company", action: "updateCompany", after: { razonSocial: company.razonSocial, rut: company.rut } }),
  ]);
  return saved ? ok(company) : fail("No se pudieron guardar los datos de la empresa.");
}
