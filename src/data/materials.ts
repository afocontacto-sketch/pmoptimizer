import { can } from "../app/permissions";
import type { Role } from "../app/roles";
import { appendAudit } from "./audit";
import { keys } from "./keys";
import { fail, ok } from "./result";
import type { Result } from "./result";
import { readJson, runAtomic, updateJson } from "./storage";

export type Incoterm = "EXW" | "FCA" | "FOB" | "CIF" | "DAP" | "DDP" | "Otro";

export type MaterialRecord = {
  code: string;
  name: string;
  unit: string;
  category: string;
  minStock: number;
  reorderPoint: number;
  leadTimeDays: number;
  incoterm?: Incoterm;
  minLot?: number;
  description?: string;
  specification?: string;
  // Q4: solo los materiales que requieren inspección entran a "Bloqueado calidad" al recibirse.
  // La marca en Calidad y la lógica de recepción llegan en etapas posteriores.
  requiresInspection: boolean;
};

export function readMaterials(): MaterialRecord[] {
  return readJson<MaterialRecord[]>(keys.materialMaster, []);
}

export const demoMaterials: MaterialRecord[] = [
  { code: "MAT-114", name: "Cinta aislante 3M", unit: "rollo", category: "Eléctrico", minStock: 10, reorderPoint: 10, leadTimeDays: 7, incoterm: "DAP", minLot: 5, requiresInspection: false },
  { code: "MAT-422", name: "Rodamiento SKF 6205", unit: "unidad", category: "Mecánico", minStock: 20, reorderPoint: 25, leadTimeDays: 15, incoterm: "FOB", minLot: 10, requiresInspection: true },
  { code: "MAT-301", name: "Motor eléctrico 7.5HP", unit: "unidad", category: "Eléctrico", minStock: 3, reorderPoint: 5, leadTimeDays: 30, incoterm: "CIF", minLot: 1, requiresInspection: true },
];

// Q4: Calidad marca o desmarca si un material requiere inspección; deja registro en audit.
export function setRequiresInspection(code: string, value: boolean, actor: { user: string; role: Role }): Result<MaterialRecord> {
  if (!can(actor.role, "quality.markInspection")) return fail("Solo Calidad o Administrador puede marcar materiales a inspeccionar.");
  const current = readMaterials().find((item) => item.code === code);
  if (!current) return fail(`El material ${code} no existe.`);
  if (current.requiresInspection === value) return ok(current);
  const updated: MaterialRecord = { ...current, requiresInspection: value };
  const saved = runAtomic([keys.materialMaster, keys.auditLog], [
    () => updateJson<MaterialRecord[]>(keys.materialMaster, [], (list) => list.map((item) => item.code === code ? updated : item)) !== null,
    () => appendAudit({
      user: actor.user, role: actor.role, entity: "material", entityId: code, action: "markInspection",
      before: { requiresInspection: current.requiresInspection }, after: { requiresInspection: value },
    }),
  ]);
  return saved ? ok(updated) : fail("No se pudo guardar la marca de inspección.");
}

export type NewMaterialInput = {
  code: string; name: string; unit: string; category: string;
  reorderPoint: number; leadTimeDays?: number; incoterm?: Incoterm; minLot?: number;
};

const validIncoterms: readonly string[] = ["EXW", "FCA", "FOB", "CIF", "DAP", "DDP", "Otro"];
const validNumber = (value: number | undefined) => value === undefined || (Number.isFinite(value) && value >= 0);

// Crea materiales nuevos en el maestro (todo o nada). minStock es alias de reorderPoint.
export function createMaterials(inputs: NewMaterialInput[], actor: { user: string; role: Role }): Result<MaterialRecord[]> {
  if (!can(actor.role, "material.create")) return fail("Solo Ingeniería e Industrial o Administrador puede crear materiales.");
  if (inputs.length === 0) return fail("No hay materiales para crear.");
  const known = new Set(readMaterials().map((item) => item.code.toLowerCase()));
  const created: MaterialRecord[] = [];
  for (const input of inputs) {
    const code = input.code.trim();
    if (!code || !input.name.trim() || !input.unit.trim() || !input.category.trim()) return fail("Completa código, descripción, categoría y unidad.");
    if (!validNumber(input.reorderPoint) || !validNumber(input.leadTimeDays) || !validNumber(input.minLot)) return fail(`Valores numéricos inválidos en ${code}.`);
    if (input.incoterm && !validIncoterms.includes(input.incoterm)) return fail(`Incoterm inválido en ${code}.`);
    if (known.has(code.toLowerCase())) return fail(`El código ${code} ya existe o está repetido.`);
    known.add(code.toLowerCase());
    created.push({
      code, name: input.name.trim(), unit: input.unit.trim(), category: input.category.trim(),
      minStock: input.reorderPoint, reorderPoint: input.reorderPoint, leadTimeDays: input.leadTimeDays ?? 0,
      incoterm: input.incoterm, minLot: input.minLot, requiresInspection: false,
    });
  }
  const saved = runAtomic([keys.materialMaster, keys.auditLog], [
    () => updateJson<MaterialRecord[]>(keys.materialMaster, [], (list) => [...list, ...created]) !== null,
    ...created.map((item) => () => appendAudit({ user: actor.user, role: actor.role, entity: "material", entityId: item.code, action: "create", after: item })),
  ]);
  return saved ? ok(created) : fail("No se pudo guardar el material.");
}

export type MaterialParams = Partial<Pick<MaterialRecord, "reorderPoint" | "leadTimeDays" | "incoterm" | "minLot">>;

// Planificador/Compras editan solo parámetros de reposición; nombre, código y unidad no cambian.
export function updateMaterialParams(code: string, params: MaterialParams, actor: { user: string; role: Role }): Result<MaterialRecord> {
  if (!can(actor.role, "material.editParams")) return fail("Tu rol no puede editar parámetros de materiales.");
  const current = readMaterials().find((item) => item.code === code);
  if (!current) return fail(`El material ${code} no existe.`);
  if (!validNumber(params.reorderPoint) || !validNumber(params.leadTimeDays) || !validNumber(params.minLot)) return fail("Los parámetros deben ser números mayores o iguales a 0.");
  if (params.incoterm && !validIncoterms.includes(params.incoterm)) return fail("Incoterm inválido.");
  const keysChanged = (Object.keys(params) as Array<keyof MaterialParams>).filter((key) => params[key] !== current[key]);
  if (keysChanged.length === 0) return ok(current);
  const updated: MaterialRecord = { ...current, ...params };
  if (params.reorderPoint !== undefined) updated.minStock = params.reorderPoint;
  const pick = (record: MaterialRecord) => Object.fromEntries(keysChanged.map((key) => [key, record[key]]));
  const saved = runAtomic([keys.materialMaster, keys.auditLog], [
    () => updateJson<MaterialRecord[]>(keys.materialMaster, [], (list) => list.map((item) => item.code === code ? updated : item)) !== null,
    () => appendAudit({ user: actor.user, role: actor.role, entity: "material", entityId: code, action: "updateParams", before: pick(current), after: pick(updated) }),
  ]);
  return saved ? ok(updated) : fail("No se pudo guardar los parámetros.");
}

export type MaterialTechnical = Partial<Pick<MaterialRecord, "name" | "unit" | "category" | "description" | "specification">>;
const technicalKeys = ["name", "unit", "category", "description", "specification"] as const;

// Ingeniería edita datos técnicos; el código es inmutable y los parámetros de Supply (material.editParams) se rechazan.
export function updateMaterialTechnical(code: string, patch: MaterialTechnical, actor: { user: string; role: Role }): Result<MaterialRecord> {
  if (!can(actor.role, "material.edit")) return fail("Solo Ingeniería e Industrial o Administrador puede editar datos técnicos.");
  const extra = Object.keys(patch).filter((key) => !(technicalKeys as readonly string[]).includes(key));
  if (extra.length) return fail(`Campos no editables con este permiso: ${extra.join(", ")}.`);
  const current = readMaterials().find((item) => item.code === code);
  if (!current) return fail(`El material ${code} no existe.`);
  const clean: MaterialTechnical = {};
  for (const key of technicalKeys) {
    const value = patch[key];
    if (value === undefined) continue;
    clean[key] = value.trim();
    if (["name", "unit", "category"].includes(key) && !clean[key]) return fail("Nombre, unidad y categoría son obligatorios.");
  }
  const changed = technicalKeys.filter((key) => key in clean && (clean[key] ?? "") !== (current[key] ?? ""));
  if (changed.length === 0) return ok(current);
  const updated: MaterialRecord = { ...current, ...clean };
  const pick = (record: MaterialRecord) => Object.fromEntries(changed.map((key) => [key, record[key] ?? ""]));
  const saved = runAtomic([keys.materialMaster, keys.auditLog], [
    () => updateJson<MaterialRecord[]>(keys.materialMaster, [], (list) => list.map((item) => item.code === code ? updated : item)) !== null,
    () => appendAudit({ user: actor.user, role: actor.role, entity: "material", entityId: code, action: "updateTechnical", before: pick(current), after: pick(updated) }),
  ]);
  return saved ? ok(updated) : fail("No se pudo guardar los datos técnicos.");
}

export type MaterialDocType = "Ficha técnica" | "Plano" | "Certificado" | "Otro";
export const materialDocTypes: readonly MaterialDocType[] = ["Ficha técnica", "Plano", "Certificado", "Otro"];
export const MATERIAL_DOC_MAX_BYTES = 2 * 1024 * 1024;
export const MATERIAL_DOC_EXTENSIONS: readonly string[] = ["pdf", "png", "jpg", "dwg", "dxf"];

export type MaterialDocument = {
  id: string; materialCode: string; type: MaterialDocType; name: string; date: string;
  fileName: string; size: number; dataUrl: string;
};
export type NewMaterialDocument = Omit<MaterialDocument, "id">;

export function readMaterialDocuments(materialCode?: string): MaterialDocument[] {
  const list = readJson<MaterialDocument[]>(keys.materialDocuments, []);
  return materialCode ? list.filter((doc) => doc.materialCode === materialCode) : list;
}

// Sube un documento (patrón saveContractFile); falla con aviso si supera 2 MB, el formato no es válido o localStorage está lleno.
export function addMaterialDocument(input: NewMaterialDocument, actor: { user: string; role: Role }): Result<MaterialDocument> {
  if (!can(actor.role, "material.documents")) return fail("Solo Ingeniería e Industrial o Administrador puede cargar documentos.");
  if (!readMaterials().some((item) => item.code === input.materialCode)) return fail(`El material ${input.materialCode} no existe.`);
  if (!materialDocTypes.includes(input.type)) return fail("Tipo de documento inválido.");
  if (!input.name.trim() || !input.date) return fail("Indica nombre y fecha del documento.");
  const extension = input.fileName.split(".").pop()?.toLowerCase() ?? "";
  const normalized = extension === "jpeg" ? "jpg" : extension;
  if (!MATERIAL_DOC_EXTENSIONS.includes(normalized)) return fail("Formato no permitido. Usa pdf, png, jpg, dwg o dxf.");
  if (input.size > MATERIAL_DOC_MAX_BYTES) return fail("El archivo supera el límite de 2 MB.");
  const doc: MaterialDocument = { ...input, name: input.name.trim(), id: `MDOC-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}` };
  const saved = runAtomic([keys.materialDocuments, keys.auditLog], [
    () => updateJson<MaterialDocument[]>(keys.materialDocuments, [], (list) => [...list, doc]) !== null,
    () => appendAudit({ user: actor.user, role: actor.role, entity: "material", entityId: doc.materialCode, action: "addDocument", after: { id: doc.id, type: doc.type, name: doc.name, fileName: doc.fileName } }),
  ]);
  return saved ? ok(doc) : fail("No se pudo guardar el documento (almacenamiento lleno o no disponible).");
}

export function deleteMaterialDocument(id: string, actor: { user: string; role: Role }): Result<true> {
  if (!can(actor.role, "material.documents")) return fail("Solo Ingeniería e Industrial o Administrador puede eliminar documentos.");
  const doc = readMaterialDocuments().find((item) => item.id === id);
  if (!doc) return fail("El documento no existe.");
  const saved = runAtomic([keys.materialDocuments, keys.auditLog], [
    () => updateJson<MaterialDocument[]>(keys.materialDocuments, [], (list) => list.filter((item) => item.id !== id)) !== null,
    () => appendAudit({ user: actor.user, role: actor.role, entity: "material", entityId: doc.materialCode, action: "deleteDocument", before: { id: doc.id, type: doc.type, name: doc.name, fileName: doc.fileName } }),
  ]);
  return saved ? ok(true) : fail("No se pudo eliminar el documento.");
}

// Ficha técnica mínima de demostración (PDF diminuto).
export const demoMaterialDocuments: MaterialDocument[] = [
  {
    id: "MDOC-DEMO-1", materialCode: "MAT-422", type: "Ficha técnica", name: "Ficha técnica rodamiento 6205", date: "2026-01-15",
    fileName: "ficha-6205.pdf", size: 220,
    dataUrl: "data:application/pdf;base64,JVBERi0xLjEKMSAwIG9iajw8L1R5cGUvQ2F0YWxvZy9QYWdlcyAyIDAgUj4+ZW5kb2JqCjIgMCBvYmo8PC9UeXBlL1BhZ2VzL0tpZHNbMyAwIFJdL0NvdW50IDE+PmVuZG9iagozIDAgb2JqPDwvVHlwZS9QYWdlL1BhcmVudCAyIDAgUi9NZWRpYUJveFswIDAgMjAwIDIwMF0+PmVuZG9iagolJUVPRgo=",
  },
];
