import { can } from "../app/permissions";
import type { Role } from "../app/roles";
import { seedDemoData } from "./demoData";
import { backupFormat, keys, KEY_PREFIX, SCHEMA } from "./keys";
import { fail, ok } from "./result";
import type { Result } from "./result";

export type AppDataBackup = {
  format: typeof backupFormat;
  version: 1;
  schema: typeof SCHEMA;
  exportedAt: string;
  data: Record<string, string>;
};

const isDataKey = (key: string | null): key is string => Boolean(key?.startsWith(KEY_PREFIX)) && key !== keys.session;

function currentData(): Record<string, string> {
  const data: Record<string, string> = {};
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);
    if (!isDataKey(key)) continue;
    const value = localStorage.getItem(key);
    if (value !== null) data[key] = value;
  }
  return data;
}

export function getAppDataBackup(): AppDataBackup {
  return { format: backupFormat, version: 1, schema: SCHEMA, exportedAt: new Date().toISOString(), data: currentData() };
}

// Valida el texto de un respaldo sin tocar datos: formato, esquema (rechaza v2) y claves del esquema actual.
export function parseBackup(text: string): Result<AppDataBackup> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return fail("El archivo no es un JSON válido.");
  }
  if (typeof parsed !== "object" || parsed === null) return fail("El archivo no es un respaldo válido de PMOptimizer.");
  if (!("schema" in parsed) || parsed.schema !== SCHEMA) {
    return fail(`Respaldo rechazado: su versión de esquema no es compatible (se requiere "${SCHEMA}").`);
  }
  if (!("format" in parsed) || parsed.format !== backupFormat || !("version" in parsed) || parsed.version !== 1 ||
    !("data" in parsed) || typeof parsed.data !== "object" || parsed.data === null || Array.isArray(parsed.data)) {
    return fail("El archivo no es un respaldo válido de PMOptimizer.");
  }
  const entries = Object.entries(parsed.data);
  if (!entries.every(([key, item]) => isDataKey(key) && typeof item === "string")) return fail("El archivo no es un respaldo válido de PMOptimizer.");
  if (entries.length === 0) return fail("El respaldo no contiene datos para restaurar.");
  return ok(parsed as AppDataBackup);
}

function replaceData(next: Record<string, string>): void {
  const previous = currentData();
  try {
    Object.keys(previous).forEach((key) => localStorage.removeItem(key));
    Object.entries(next).forEach(([key, value]) => localStorage.setItem(key, value));
  } catch (cause) {
    Object.keys(currentData()).forEach((key) => localStorage.removeItem(key));
    Object.entries(previous).forEach(([key, value]) => localStorage.setItem(key, value));
    throw cause;
  }
}

export function restoreBackup(backup: AppDataBackup, role: Role): Result<number> {
  if (!can(role, "backup.manage")) return fail("Solo el Administrador puede restaurar respaldos.");
  try {
    replaceData(backup.data);
    return ok(Object.keys(backup.data).length);
  } catch {
    return fail("No se pudo restaurar el respaldo; se conservaron los datos actuales.");
  }
}

// Borra los datos del esquema actual (no la sesión) y vuelve a cargar el seed demo.
export function resetDemoData(role: Role): Result {
  if (!can(role, "backup.manage")) return fail("Solo el Administrador puede restablecer los datos demo.");
  const previous = currentData();
  try {
    replaceData({});
    if (!seedDemoData().ok) throw new Error("seed");
    return ok(undefined);
  } catch {
    try {
      replaceData(previous);
    } catch {
      return fail("No se pudo restablecer ni recuperar los datos.");
    }
    return fail("No se pudo restablecer los datos demo; se conservaron los datos actuales.");
  }
}
