import { can } from "../app/permissions";
import type { Role } from "../app/roles";
import { keys } from "../data/keys";
import { fail, ok } from "../data/result";
import type { Result } from "../data/result";
import { readJson, writeJson } from "../data/storage";

export const equipmentStorageKey = keys.equipment;

export type EquipmentMaster = {
  code: string;
  name: string;
  serialNumber?: string;
  contractCode?: string;
};

const demoEquipment: EquipmentMaster[] = [
  { code: "VEH-001", name: "Camioneta Fiat Ducato" },
  { code: "VEH-002", name: "Fiat Fiorino" },
  { code: "VEH-003", name: "Camioneta Fiat Ducato" },
];

export function readEquipmentMaster(): EquipmentMaster[] {
  try {
    const raw = localStorage.getItem(equipmentStorageKey);
    if (!raw) return demoEquipment;
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      console.warn("El maestro de equipos guardado no tiene formato de lista.");
      return demoEquipment;
    }
    const valid = parsed.filter((item): item is EquipmentMaster =>
      typeof item === "object" && item !== null &&
      "code" in item && typeof item.code === "string" &&
      "name" in item && typeof item.name === "string",
    ).map((item) => ({
      code: item.code.trim(),
      name: item.name.trim(),
      serialNumber: "serialNumber" in item && typeof item.serialNumber === "string" ? item.serialNumber : "",
      contractCode: "contractCode" in item && typeof item.contractCode === "string" ? item.contractCode : "",
    }));
    return [...new Map(
      [...demoEquipment, ...valid].map((item): [string, EquipmentMaster] => [item.code, item]),
    ).values()];
  } catch (error) {
    console.warn("No se pudo leer el maestro de equipos guardado.", error);
    return demoEquipment;
  }
}

// Alta de equipos (uno o carga masiva). Valida unicidad de código/serie y contrato existente; todo o nada.
export function addEquipment(items: EquipmentMaster[], contractCodes: string[], actor: { user: string; role: Role }): Result<number> {
  if (!can(actor.role, "equipment.edit")) return fail("Solo Ingeniería e Industrial o Administrador puede editar equipos.");
  const current = readEquipmentMaster();
  const codes = new Set(current.map((item) => item.code.toLowerCase()));
  const serials = new Set(current.map((item) => item.serialNumber?.toLowerCase()).filter(Boolean));
  for (const [index, item] of items.entries()) {
    const label = `Fila ${index + 1}`;
    if (!item.code.trim() || !item.name.trim() || !item.serialNumber?.trim()) return fail(`${label}: código, número de serie y descripción son obligatorios.`);
    if (item.contractCode && !contractCodes.includes(item.contractCode)) return fail(`${label}: el contrato ${item.contractCode} no existe.`);
    const code = item.code.toLowerCase();
    const serial = item.serialNumber.toLowerCase();
    if (codes.has(code)) return fail(`${label}: el código ${item.code} ya existe o está repetido.`);
    if (serials.has(serial)) return fail(`${label}: el número de serie ${item.serialNumber} ya existe o está repetido.`);
    codes.add(code);
    serials.add(serial);
  }
  const stored = readJson<EquipmentMaster[]>(equipmentStorageKey, []);
  return writeJson(equipmentStorageKey, [...stored, ...items]) ? ok(items.length) : fail("No se pudo guardar el equipo en este navegador.");
}
