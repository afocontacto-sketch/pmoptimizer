import { can } from "../../app/permissions";
import type { Role } from "../../app/roles";
import { appendAudit } from "../../data/audit";
import { keys } from "../../data/keys";
import { fail, ok } from "../../data/result";
import type { Result } from "../../data/result";
import { readJson, runAtomic, updateJson } from "../../data/storage";

// Carpeta de documentos por trabajador (mismo patrón que los documentos de material en data/materials.ts).
export const employeeDocTypes = ["Contrato", "Anexo", "Cédula", "Certificado AFP/Salud", "Finiquito", "Protocolo Ley Karin", "Otro"] as const;
export type EmployeeDocType = (typeof employeeDocTypes)[number];
export const EMPLOYEE_DOC_MAX_BYTES = 2 * 1024 * 1024;
export const EMPLOYEE_DOC_EXTENSIONS: readonly string[] = ["pdf", "png", "jpg", "docx"];

export type EmployeeDocument = {
  id: string; employeeId: string; type: EmployeeDocType; name: string; date: string;
  fileName: string; size: number; dataUrl: string;
};
export type NewEmployeeDocument = Omit<EmployeeDocument, "id">;
type Actor = { user: string; role: Role };

export function readEmployeeDocuments(employeeId?: string): EmployeeDocument[] {
  const list = readJson<EmployeeDocument[]>(keys.hrDocuments, []);
  return employeeId ? list.filter((doc) => doc.employeeId === employeeId) : list;
}

// Sube un documento; falla con aviso si supera 2 MB, el formato no es válido o localStorage está lleno.
// replaceSameName sustituye el documento anterior del mismo tipo y nombre (p. ej. "Contrato (borrador)").
export function addEmployeeDocument(input: NewEmployeeDocument, actor: Actor, replaceSameName = false): Result<EmployeeDocument> {
  if (!can(actor.role, "hr.edit")) return fail("Solo Contabilidad o Administrador puede cargar documentos de trabajadores.");
  if (!employeeDocTypes.includes(input.type)) return fail("Tipo de documento inválido.");
  if (!input.employeeId) return fail("Selecciona un trabajador.");
  if (!input.name.trim() || !input.date) return fail("Indica nombre y fecha del documento.");
  const extension = input.fileName.split(".").pop()?.toLowerCase() ?? "";
  const normalized = extension === "jpeg" ? "jpg" : extension;
  if (!EMPLOYEE_DOC_EXTENSIONS.includes(normalized)) return fail("Formato no permitido. Usa pdf, png, jpg o docx.");
  if (input.size > EMPLOYEE_DOC_MAX_BYTES) return fail("El archivo supera el límite de 2 MB.");
  const doc: EmployeeDocument = { ...input, name: input.name.trim(), id: `EDOC-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}` };
  const keep = (item: EmployeeDocument) => !(replaceSameName && item.employeeId === doc.employeeId && item.type === doc.type && item.name === doc.name);
  const saved = runAtomic([keys.hrDocuments, keys.auditLog], [
    () => updateJson<EmployeeDocument[]>(keys.hrDocuments, [], (list) => [...list.filter(keep), doc]) !== null,
    () => appendAudit({ user: actor.user, role: actor.role, entity: "employee", entityId: doc.employeeId, action: "addDocument", after: { id: doc.id, type: doc.type, name: doc.name, fileName: doc.fileName } }),
  ]);
  return saved ? ok(doc) : fail("No se pudo guardar el documento (almacenamiento lleno o no disponible).");
}

export function deleteEmployeeDocument(id: string, actor: Actor): Result<true> {
  if (!can(actor.role, "hr.edit")) return fail("Solo Contabilidad o Administrador puede eliminar documentos de trabajadores.");
  const doc = readEmployeeDocuments().find((item) => item.id === id);
  if (!doc) return fail("El documento no existe.");
  const saved = runAtomic([keys.hrDocuments, keys.auditLog], [
    () => updateJson<EmployeeDocument[]>(keys.hrDocuments, [], (list) => list.filter((item) => item.id !== id)) !== null,
    () => appendAudit({ user: actor.user, role: actor.role, entity: "employee", entityId: doc.employeeId, action: "deleteDocument", before: { id: doc.id, type: doc.type, name: doc.name, fileName: doc.fileName } }),
  ]);
  return saved ? ok(true) : fail("No se pudo eliminar el documento.");
}
