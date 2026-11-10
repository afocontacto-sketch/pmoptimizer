// localStorage y window mínimos para probar funciones de data/ sin navegador.
export const store = new Map<string, string>();
export const events: string[] = [];

export function installStorage(): void {
  store.clear();
  events.length = 0;
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => { store.set(key, value); },
      removeItem: (key: string) => { store.delete(key); },
      key: (index: number) => [...store.keys()][index] ?? null,
      get length() { return store.size; },
    },
  });
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { dispatchEvent: (event: CustomEvent<string>) => { events.push(event.detail); return true; } },
  });
}

export const readStore = <T>(key: string, fallback: T): T => {
  const raw = store.get(key);
  return raw === undefined ? fallback : (JSON.parse(raw) as T);
};
