export const equipmentStorageKey = "pmoptimizer-equipment";

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
