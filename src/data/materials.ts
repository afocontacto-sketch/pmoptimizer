import { keys } from "./keys";
import { readJson } from "./storage";

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
