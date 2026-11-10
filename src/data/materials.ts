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
