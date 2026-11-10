import { useCallback, useEffect, useState } from "react";
import { STORE_EVENT } from "../data/storage";

// Devuelve read() y lo vuelve a leer cuando cambia la clave (misma pestaña o entre pestañas).
export function useStoredValue<T>(key: string, read: () => T): T {
  const [value, setValue] = useState<T>(read);
  const refresh = useCallback(() => setValue(read()), [read]);

  useEffect(() => {
    const onStore = (event: Event) => {
      const changed = (event as CustomEvent<string>).detail;
      if (changed === key) refresh();
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key === null || event.key === key) refresh();
    };
    window.addEventListener(STORE_EVENT, onStore);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(STORE_EVENT, onStore);
      window.removeEventListener("storage", onStorage);
    };
  }, [key, refresh]);

  return value;
}
