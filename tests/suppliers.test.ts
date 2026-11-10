import { beforeEach, describe, expect, test } from "vitest";
import { can } from "../src/app/permissions";
import { chileBanks } from "../src/data/chileBanks";
import { keys } from "../src/data/keys";
import {
  deleteSupplier, dueDateFromTerm, emptySupplierInput, formatRut, isValidRut, migrateSuppliers, orderPaymentDays,
  paymentTermWarning, readSuppliers, saveSupplier, setSupplierActive,
} from "../src/data/suppliers";
import type { SupplierInput } from "../src/data/suppliers";
import { installStorage, readStore, store } from "./helpers/storageMock";

const compras = { user: "ana", role: "Compras" as const };
const input = (patch: Partial<SupplierInput> = {}): SupplierInput => ({
  ...emptySupplierInput(), name: "Proveedor Uno", rut: "76.123.450-1", activity: "Venta de insumos",
  contacts: [{ name: "Marta", role: "Ventas", email: "m@uno.example", phone: "1", primary: true }], ...patch,
});

beforeEach(() => installStorage());

describe("RUT", () => {
  test("valida dígito verificador", () => {
    expect(isValidRut("76.123.450-1")).toBe(true);
    expect(isValidRut("99567890K")).toBe(true);
    expect(isValidRut("76.123.450-2")).toBe(false);
    expect(isValidRut("abc")).toBe(false);
    expect(formatRut("761234501")).toBe("76.123.450-1");
  });
  test("RUT único entre proveedores", () => {
    expect(saveSupplier(input(), compras).ok).toBe(true);
    const dup = saveSupplier(input({ name: "Otro", rut: "761234501" }), compras);
    expect(dup.ok).toBe(false);
    expect(saveSupplier(input({ name: "Otro", rut: "77.234.560-7" }), compras).ok).toBe(true);
  });
  test("rechaza RUT inválido", () => {
    expect(saveSupplier(input({ rut: "76.123.450-9" }), compras).ok).toBe(false);
  });
});

describe("permisos y auditoría", () => {
  test("Contabilidad solo lectura; Compras y Admin editan", () => {
    expect(can("Contabilidad", "supplier.view")).toBe(true);
    expect(can("Contabilidad", "supplier.edit")).toBe(false);
    expect(can("Compras", "supplier.edit")).toBe(true);
    expect(saveSupplier(input(), { user: "c", role: "Contabilidad" }).ok).toBe(false);
  });
  test("el cambio de cuenta bancaria queda como sensible", () => {
    const created = saveSupplier(input(), compras);
    if (!created.ok) throw new Error(created.error);
    const bank = { bankCode: "012", type: "Vista/RUT" as const, number: "12345678", holder: "Proveedor Uno", holderRut: "76.123.450-1", paymentEmail: "pagos@uno.example" };
    expect(saveSupplier({ ...input(), bank }, compras, created.value.id).ok).toBe(true);
    saveSupplier({ ...input(), bank, tradeName: "Uno" }, compras, created.value.id);
    const audit = readStore<Array<{ action: string; sensitive?: boolean; before?: unknown; after?: unknown }>>(keys.auditLog, []);
    expect(audit.map((item) => item.sensitive)).toEqual([undefined, true, undefined]);
    expect(audit[1].before).toBeDefined();
    expect(audit[1].after).toBeDefined();
  });
  test("lista de bancos con código y grupo aparte para cuentas digitales", () => {
    expect(chileBanks.find((item) => item.code === "012")?.name).toBe("BancoEstado");
    expect(chileBanks.filter((item) => item.group !== "Bancos").map((item) => item.name)).toContain("Coopeuch");
  });
});

describe("eliminar y desactivar", () => {
  test("no se elimina un proveedor con OC; solo se desactiva", () => {
    const created = saveSupplier(input(), compras);
    if (!created.ok) throw new Error(created.error);
    store.set(keys.purchaseOrders, JSON.stringify([{ id: "31000001", supplier: "Proveedor Uno" }]));
    const result = deleteSupplier(created.value.id, compras);
    expect(result.ok).toBe(false);
    expect(readSuppliers()).toHaveLength(1);
    const off = setSupplierActive(created.value.id, false, compras);
    expect(off.ok && off.value.active).toBe(false);
  });
  test("sin OC ni cotizaciones sí se elimina", () => {
    const created = saveSupplier(input(), compras);
    if (!created.ok) throw new Error(created.error);
    expect(deleteSupplier(created.value.id, compras).ok).toBe(true);
    expect(readSuppliers()).toHaveLength(0);
  });
  test("cotizaciones también bloquean la eliminación", () => {
    const created = saveSupplier(input(), compras);
    if (!created.ok) throw new Error(created.error);
    store.set(keys.purchaseRequests, JSON.stringify([{ id: "21000001", quotes: [{ supplier: "proveedor uno" }] }]));
    expect(deleteSupplier(created.value.id, compras).ok).toBe(false);
  });
});

describe("plazo de pago", () => {
  test("aviso Ley 21.131 cuando supera 30 días", () => {
    expect(paymentTermWarning(30)).toBeNull();
    expect(paymentTermWarning(0)).toBeNull();
    expect(paymentTermWarning(45)).toMatch(/acuerdo por escrito/);
    expect(paymentTermWarning(90)).toMatch(/tope de 60/);
  });
  test("el aviso no bloquea el guardado", () => {
    expect(saveSupplier(input({ paymentTerm: { mode: "Otro", days: 90, condition: "" } }), compras).ok).toBe(true);
  });
  test("vencimiento = fecha de factura + plazo de la OC", () => {
    expect(dueDateFromTerm("2026-11-10", 30)).toBe("2026-12-10");
    expect(dueDateFromTerm("2026-12-20", 15)).toBe("2027-01-04");
    expect(dueDateFromTerm("2026-11-10", 0)).toBe("2026-11-10");
    const suppliers = [{ name: "P", paymentTerm: { mode: "45", days: 45, condition: "" } }] as never;
    expect(orderPaymentDays({ supplier: "P", paymentTermDays: 60 }, suppliers)).toBe(60);
    expect(orderPaymentDays({ supplier: "P" }, suppliers)).toBe(45);
    expect(orderPaymentDays({ supplier: "X" }, suppliers)).toBeNull();
  });
});

describe("migración", () => {
  test("proveedores antiguos pasan al modelo nuevo y se agregan los nombres de OC", () => {
    store.set(keys.suppliers, JSON.stringify([{ id: "PROV-1", name: "Antiguo" }]));
    store.set(keys.purchaseOrders, JSON.stringify([{ id: "31000001", supplier: "Histórico" }]));
    const list = migrateSuppliers();
    expect(list.map((item) => item.name)).toEqual(["Antiguo", "Histórico"]);
    expect(list.every((item) => item.active && item.paymentTerm.days === 30 && item.address.country === "Chile")).toBe(true);
    expect(readStore<unknown[]>(keys.suppliers, [])).toHaveLength(2);
  });
});
