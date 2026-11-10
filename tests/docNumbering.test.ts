import { beforeEach, describe, expect, test } from "vitest";
import { DocNumberError, MAX_SEQUENCE, nextDocNumber, orderTypeSeries } from "../src/data/docNumbering";
import { keys } from "../src/data/keys";

function installLocalStorage() {
  const store = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => { store.set(key, value); },
      removeItem: (key: string) => { store.delete(key); },
    },
  });
}

describe("docNumbering", () => {
  beforeEach(installLocalStorage);

  test("secuencia por serie independiente", () => {
    expect(nextDocNumber("51")).toBe("51000001");
    expect(nextDocNumber("51")).toBe("51000002");
    expect(nextDocNumber("61")).toBe("61000001");
  });

  test("padding de 8 dígitos", () => {
    localStorage.setItem(keys.docCounters, JSON.stringify({ "31": 41 }));
    const id = nextDocNumber("31");
    expect(id).toBe("31000042");
    expect(id).toHaveLength(8);
  });

  test("no reutiliza números tras borrar el documento", () => {
    const docs = new Set<string>();
    const first = nextDocNumber("51");
    docs.add(first);
    docs.delete(first);
    expect(nextDocNumber("51", (id) => docs.has(id))).toBe("51000002");
  });

  test("exists() salta ids ocupados", () => {
    const taken = new Set(["71000001", "71000002"]);
    expect(nextDocNumber("71", (id) => taken.has(id))).toBe("71000003");
    expect(nextDocNumber("71")).toBe("71000004");
  });

  test("serie agotada lanza error", () => {
    localStorage.setItem(keys.docCounters, JSON.stringify({ "81": MAX_SEQUENCE }));
    expect(() => nextDocNumber("81")).toThrow(DocNumberError);
    expect(() => nextDocNumber("81")).toThrow("Serie agotada");
  });

  test("ESPERA usa la serie 13 y REP la 91", () => {
    expect(orderTypeSeries.ESPERA).toBe("13");
    expect(orderTypeSeries.REP).toBe("91");
    expect(nextDocNumber(orderTypeSeries.ESPERA)).toBe("13000001");
  });
});
