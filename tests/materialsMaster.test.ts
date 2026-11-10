import { beforeEach, describe, expect, test } from "vitest";
import type { AuditRecord } from "../src/data/audit";
import { keys } from "../src/data/keys";
import { MATERIAL_DOC_MAX_BYTES, addMaterialDocument, createMaterials, deleteMaterialDocument, demoMaterials, readMaterialDocuments, readMaterials, updateMaterialParams, updateMaterialTechnical } from "../src/data/materials";
import type { StockBin } from "../src/data/stock";
import { addEquipment, readEquipmentMaster } from "../src/modules/masterData";
import { getMaterialRows, isCritical } from "../src/modules/materials/materialRows";
import { installStorage, readStore, store } from "./helpers/storageMock";

const ing = { user: "ingenieria", role: "Ingeniería e Industrial" as const };
const compras = { user: "compras", role: "Compras" as const };
const base = { code: "MAT-900", name: "Filtro", unit: "unidad", category: "Mecánico", reorderPoint: 4 };

beforeEach(() => {
  installStorage();
  store.set(keys.materialMaster, JSON.stringify(demoMaterials));
});

describe("createMaterials", () => {
  test("Ingeniería crea con minStock = reorderPoint y audit", () => {
    expect(createMaterials([{ ...base, leadTimeDays: 9, incoterm: "FOB" }], ing).ok).toBe(true);
    const saved = readMaterials().find((item) => item.code === "MAT-900");
    expect(saved).toMatchObject({ minStock: 4, reorderPoint: 4, leadTimeDays: 9, incoterm: "FOB" });
    expect(readStore<AuditRecord[]>(keys.auditLog, [])[0]).toMatchObject({ action: "create", entityId: "MAT-900" });
  });

  test("rol sin permiso, duplicados y lote con error no modifican datos", () => {
    expect(createMaterials([base], compras).ok).toBe(false);
    expect(createMaterials([{ ...base, code: "mat-114" }], ing).ok).toBe(false);
    expect(createMaterials([base, { ...base, code: "MAT-901", reorderPoint: -1 }], ing).ok).toBe(false);
    expect(readMaterials()).toHaveLength(demoMaterials.length);
  });
});

describe("updateMaterialParams", () => {
  test("Compras edita lead time y queda before/after en audit sin tocar nombre", () => {
    const result = updateMaterialParams("MAT-114", { leadTimeDays: 21, reorderPoint: 12 }, compras);
    expect(result.ok).toBe(true);
    const saved = readMaterials().find((item) => item.code === "MAT-114");
    expect(saved).toMatchObject({ leadTimeDays: 21, reorderPoint: 12, minStock: 12, name: "Cinta aislante 3M", unit: "rollo" });
    expect(readStore<AuditRecord[]>(keys.auditLog, [])[0]).toMatchObject({
      action: "updateParams", before: { leadTimeDays: 7, reorderPoint: 10 }, after: { leadTimeDays: 21, reorderPoint: 12 },
    });
  });

  test("Ingeniería no puede, valores negativos fallan, sin cambios no genera audit", () => {
    expect(updateMaterialParams("MAT-114", { leadTimeDays: 3 }, ing).ok).toBe(false);
    expect(updateMaterialParams("MAT-114", { leadTimeDays: -1 }, compras).ok).toBe(false);
    expect(updateMaterialParams("MAT-114", { leadTimeDays: 7 }, compras).ok).toBe(true);
    expect(store.has(keys.auditLog)).toBe(false);
  });
});

describe("getMaterialRows", () => {
  test("une maestro y saldos; stock sin maestro es 'Sin categoría'", () => {
    const bin = (code: string, quantity: number, status: StockBin["status"] = "Libre utilización"): StockBin => ({
      id: `${code}-${status}`, code, name: code, warehouse: "A1", location: "A-01", status, quantity, reserved: 0, unit: "unidad", unitCost: 1,
    });
    const rows = getMaterialRows([bin("MAT-114", 4), bin("MAT-114", 2, "Bloqueado calidad"), bin("ZZZ", 3)]);
    const cinta = rows.find((row) => row.code === "MAT-114");
    expect(cinta).toMatchObject({ available: 4, quality: 2 });
    expect(isCritical(cinta!)).toBe(true);
    expect(rows.find((row) => row.code === "ZZZ")?.category).toBe("Sin categoría");
  });
});

describe("addEquipment", () => {
  const item = { code: "EQ-1", serialNumber: "S1", name: "Prensa", contractCode: "CT1234" };
  test("Ingeniería agrega; serie duplicada, contrato inexistente y otros roles fallan", () => {
    expect(addEquipment([item], ["CT1234"], ing).ok).toBe(true);
    expect(readEquipmentMaster().some((eq) => eq.code === "EQ-1")).toBe(true);
    expect(addEquipment([{ ...item, code: "EQ-2" }], ["CT1234"], ing).ok).toBe(false);
    expect(addEquipment([{ ...item, code: "EQ-3", serialNumber: "S3" }], [], ing).ok).toBe(false);
    expect(addEquipment([{ ...item, code: "EQ-4", serialNumber: "S4" }], ["CT1234"], compras).ok).toBe(false);
  });
});

const doc = { materialCode: "MAT-114", type: "Ficha técnica" as const, name: "Ficha", date: "2026-02-01", fileName: "ficha.pdf", size: 100, dataUrl: "data:application/pdf;base64,AAAA" };

describe("updateMaterialTechnical", () => {
  test("Ingeniería edita datos técnicos sin tocar parámetros y deja audit before/after", () => {
    const before = readMaterials().find((item) => item.code === "MAT-114")!;
    expect(updateMaterialTechnical("MAT-114", { name: "Cinta 3M 20m", specification: "PVC 0.18 mm" }, ing).ok).toBe(true);
    const saved = readMaterials().find((item) => item.code === "MAT-114")!;
    expect(saved).toMatchObject({ code: "MAT-114", name: "Cinta 3M 20m", specification: "PVC 0.18 mm" });
    expect([saved.reorderPoint, saved.minStock, saved.leadTimeDays, saved.incoterm, saved.minLot]).toEqual([before.reorderPoint, before.minStock, before.leadTimeDays, before.incoterm, before.minLot]);
    expect(readStore<AuditRecord[]>(keys.auditLog, [])[0]).toMatchObject({ action: "updateTechnical", before: { name: "Cinta aislante 3M" }, after: { name: "Cinta 3M 20m" } });
  });

  test("rechaza rol sin permiso, parámetros de Supply y cambio de código", () => {
    expect(updateMaterialTechnical("MAT-114", { name: "X" }, compras).ok).toBe(false);
    expect(updateMaterialTechnical("MAT-114", { leadTimeDays: 99 } as never, ing).ok).toBe(false);
    expect(updateMaterialTechnical("MAT-114", { code: "OTRO" } as never, ing).ok).toBe(false);
    expect(readMaterials().find((item) => item.code === "MAT-114")).toMatchObject({ name: "Cinta aislante 3M", leadTimeDays: 7 });
  });
});

describe("documentos de material", () => {
  test("Ingeniería sube y borra; queda audit", () => {
    const added = addMaterialDocument(doc, ing);
    expect(added.ok).toBe(true);
    expect(readMaterialDocuments("MAT-114")).toHaveLength(1);
    if (added.ok) expect(deleteMaterialDocument(added.value.id, ing).ok).toBe(true);
    expect(readMaterialDocuments("MAT-114")).toHaveLength(0);
    expect(readStore<AuditRecord[]>(keys.auditLog, []).map((item) => item.action)).toEqual(["addDocument", "deleteDocument"]);
  });

  test("rol sin permiso no sube ni borra; respeta 2 MB y formatos", () => {
    expect(addMaterialDocument(doc, compras).ok).toBe(false);
    expect(addMaterialDocument({ ...doc, size: MATERIAL_DOC_MAX_BYTES + 1 }, ing).ok).toBe(false);
    expect(addMaterialDocument({ ...doc, fileName: "virus.exe" }, ing).ok).toBe(false);
    const added = addMaterialDocument(doc, ing);
    if (added.ok) expect(deleteMaterialDocument(added.value.id, compras).ok).toBe(false);
    expect(readMaterialDocuments()).toHaveLength(1);
  });
});
