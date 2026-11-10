import { beforeEach, describe, expect, test } from "vitest";
import { getAppDataBackup, parseBackup, resetDemoData, restoreBackup } from "../src/data/backup";
import { validateContractDates, wbsSuffixes } from "../src/data/contracts";
import { nextDocNumber } from "../src/data/docNumbering";
import { keys } from "../src/data/keys";
import { installStorage, readStore, store } from "./helpers/storageMock";

beforeEach(() => installStorage());

describe("validateContractDates", () => {
  test("exige ambas fechas, formato ISO y fin >= inicio", () => {
    expect(validateContractDates("2026-01-01", "2026-12-31")).toBeNull();
    expect(validateContractDates("2026-01-01", "2026-01-01")).toBeNull();
    expect(validateContractDates("2026-01-01", "")).not.toBeNull();
    expect(validateContractDates(undefined, "2026-12-31")).not.toBeNull();
    expect(validateContractDates("2026-12-31", "2026-01-01")).not.toBeNull();
    expect(validateContractDates("01/01/2026", "2026-12-31")).not.toBeNull();
  });

  test("sufijos WBS configurables incluyen GAR e IND", () => {
    expect([...wbsSuffixes]).toEqual(["PRE", "OVH", "COR", "GAR", "REP", "IND"]);
  });
});

describe("respaldo y datos demo", () => {
  test("un respaldo v2 se rechaza sin modificar datos", () => {
    store.set(keys.materialMaster, "[1]");
    const v2 = JSON.stringify({ format: "pmoptimizer-local-data", version: 1, schema: "v2", data: { "pmoptimizer-v2-x": "1" } });
    const result = parseBackup(v2);
    expect(result.ok).toBe(false);
    expect(parseBackup("no es json").ok).toBe(false);
    expect(parseBackup(JSON.stringify({ data: {} })).ok).toBe(false);
    expect(store.get(keys.materialMaster)).toBe("[1]");
  });

  test("exportar y restaurar respalda el esquema actual; solo Administrador restaura", () => {
    expect(resetDemoData("Administrador").ok).toBe(true);
    const backup = getAppDataBackup();
    const parsed = parseBackup(JSON.stringify(backup));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(restoreBackup(parsed.value, "Supervisor").ok).toBe(false);
    expect(restoreBackup(parsed.value, "Administrador").ok).toBe(true);
  });

  test("restablecer demo vuelve contadores al seed y conserva la sesión", () => {
    expect(resetDemoData("Administrador").ok).toBe(true);
    const seeded = readStore(keys.docCounters, {});
    store.set(keys.session, "sesion");
    nextDocNumber("61");
    nextDocNumber("61");
    expect(readStore(keys.docCounters, {})).not.toEqual(seeded);
    expect(resetDemoData("Planificador").ok).toBe(false);
    expect(resetDemoData("Administrador").ok).toBe(true);
    expect(readStore(keys.docCounters, {})).toEqual(seeded);
    expect(store.get(keys.session)).toBe("sesion");
  });
});
