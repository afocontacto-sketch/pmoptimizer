import { beforeEach, describe, expect, test } from "vitest";
import type { AuditRecord } from "../src/data/audit";
import { keys } from "../src/data/keys";
import { demoMaterials, readMaterials, setRequiresInspection } from "../src/data/materials";
import type { StockBin } from "../src/data/stock";
import type { WorkOrder } from "../src/data/workOrders";
import { qualityMonthStats } from "../src/modules/quality/qualityStats";
import { installStorage, readStore, store } from "./helpers/storageMock";

const calidad = { user: "calidad", role: "Calidad" as const };

beforeEach(() => {
  installStorage();
  store.set(keys.materialMaster, JSON.stringify(demoMaterials));
});

describe("setRequiresInspection", () => {
  test("Calidad marca y desmarca con audit before/after", () => {
    const marked = setRequiresInspection("MAT-114", true, calidad);
    expect(marked.ok).toBe(true);
    expect(readMaterials().find((m) => m.code === "MAT-114")?.requiresInspection).toBe(true);
    expect(setRequiresInspection("MAT-114", false, calidad).ok).toBe(true);
    expect(readMaterials().find((m) => m.code === "MAT-114")?.requiresInspection).toBe(false);
    const audit = readStore<AuditRecord[]>(keys.auditLog, []);
    expect(audit).toHaveLength(2);
    expect(audit[0]).toMatchObject({ entity: "material", entityId: "MAT-114", before: { requiresInspection: false }, after: { requiresInspection: true } });
  });

  test("otros roles y materiales inexistentes fallan sin cambiar datos", () => {
    expect(setRequiresInspection("MAT-114", true, { user: "x", role: "Supervisor" }).ok).toBe(false);
    expect(setRequiresInspection("NOPE", true, calidad).ok).toBe(false);
    expect(readMaterials()).toEqual(demoMaterials);
    expect(readStore<AuditRecord[]>(keys.auditLog, [])).toHaveLength(0);
  });
});

describe("qualityMonthStats", () => {
  test("cuenta inspeccionadas/pendientes y liberados/bloqueados del mes", () => {
    const orders = [
      { status: "Cierre provisorio", qualityApproved: true, qualityApprovedAt: "2026-11-05T10:00:00Z" },
      { status: "Cierre provisorio", qualityApproved: false },
      { status: "Cerrada", qualityApproved: true, qualityApprovedAt: "2026-10-30T10:00:00Z" },
    ] as WorkOrder[];
    const stock = [
      { status: "Libre utilización", releasedAt: "2026-11-02T10:00:00Z" },
      { status: "Bloqueado calidad" },
      { status: "Libre utilización", releasedAt: "2026-10-02T10:00:00Z" },
    ] as StockBin[];
    expect(qualityMonthStats(orders, stock, "2026-11")).toEqual({ inspectedOrders: 1, pendingOrders: 1, releasedBins: 1, blockedBins: 1 });
  });
});
