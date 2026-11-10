import { seedDemoData } from "./demoData";
import { APP_PREFIX, SCHEMA, schemaKey } from "./keys";

export const STORE_EVENT = "pmo-store";

export function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch (error) {
    console.warn(`No se pudo leer "${key}"; se usa el valor por defecto.`, error);
    return fallback;
  }
}

export function writeJson(key: string, value: unknown): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (error) {
    if (error instanceof DOMException && (error.name === "QuotaExceededError" || error.code === 22)) {
      console.warn("Almacenamiento local lleno; no se guardó el cambio.", error);
    } else {
      console.warn(`No se pudo escribir "${key}".`, error);
    }
    return false;
  }
}

// Lee fresco -> aplica fn -> escribe -> notifica. Devuelve null si falla la escritura.
export function updateJson<T>(key: string, fallback: T, fn: (current: T) => T): T | null {
  const next = fn(readJson<T>(key, fallback));
  if (!writeJson(key, next)) return null;
  window.dispatchEvent(new CustomEvent(STORE_EVENT, { detail: key }));
  return next;
}

export function bootstrapStorage(): void {
  try {
    if (localStorage.getItem(schemaKey) === SCHEMA) return;
    const stale: string[] = [];
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (key?.startsWith(APP_PREFIX)) stale.push(key);
    }
    stale.forEach((key) => localStorage.removeItem(key));
    localStorage.setItem(schemaKey, SCHEMA);
    seedDemoData();
  } catch (error) {
    console.warn("No se pudo inicializar el almacenamiento local.", error);
  }
}

// Ejecuta escrituras en orden; si una falla, restaura el contenido previo de las claves y devuelve false.
export function runAtomic(storageKeys: string[], steps: Array<() => boolean>): boolean {
  const snapshot = storageKeys.map((key) => [key, localStorage.getItem(key)] as const);
  for (const step of steps) {
    if (step()) continue;
    for (const [key, raw] of snapshot) {
      try {
        if (raw === null) localStorage.removeItem(key);
        else localStorage.setItem(key, raw);
      } catch (error) {
        console.warn(`No se pudo revertir "${key}".`, error);
      }
      window.dispatchEvent(new CustomEvent(STORE_EVENT, { detail: key }));
    }
    return false;
  }
  return true;
}
