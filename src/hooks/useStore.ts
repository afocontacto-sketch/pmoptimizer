import { useCallback, useEffect, useState } from "react";
import { STORE_EVENT } from "../data/storage";

// Devuelve read() y lo vuelve a leer cuando cambia la clave (misma pestaña o entre pestañas).
// alsoKeys: otras claves de las que depende read() (p. ej. OC aprobadas que alimentan el tránsito).
export function useStoredValue<T>(key: string, read: () => T, alsoKeys: readonly string[] = []): T {
  const [value, setValue] = useState<T>(read);
  const refresh = useCallback(() => setValue(read()), [read]);
  const watched = [key, ...alsoKeys].join("\u0000");

  useEffect(() => {
    const names = watched.split("\u0000");
    const onStore = (event: Event) => {
      const changed = (event as CustomEvent<string>).detail;
      if (names.includes(changed)) refresh();
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key === null || names.includes(event.key)) refresh();
    };
    window.addEventListener(STORE_EVENT, onStore);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(STORE_EVENT, onStore);
      window.removeEventListener("storage", onStorage);
    };
  }, [watched, refresh]);

  return value;
}
