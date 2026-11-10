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
