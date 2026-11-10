import { describe, expect, test } from "vitest";
import { allowedOrderTypes, can, permissions } from "../src/app/permissions";
import type { Action } from "../src/app/permissions";
import { canAccessRoute, defaultRoute, demoAccounts, isRole, roleModules, roles } from "../src/app/roles";
import { legacyRedirects, navItemsForRole } from "../src/app/navigation";

describe("permisos", () => {
  test("Administrador puede todo", () => {
    for (const action of Object.keys(permissions) as Action[]) expect(can("Administrador", action)).toBe(true);
  });

  test("cierre y reapertura: Supervisor y Admin (Q3)", () => {
    for (const action of ["order.close", "order.reopen"] as const) {
      expect(can("Supervisor", action)).toBe(true);
      expect(can("Técnico", action)).toBe(false);
      expect(can("Planificador", action)).toBe(false);
    }
  });

  test("recepción de OC: Almacén y Compras (Q5)", () => {
    expect(can("Almacén", "warehouse.receivePO")).toBe(true);
    expect(can("Compras", "warehouse.receivePO")).toBe(true);
    expect(can("Calidad", "warehouse.receivePO")).toBe(false);
  });

  test("quality.markInspection solo Calidad (Q4)", () => {
    expect(can("Calidad", "quality.markInspection")).toBe(true);
    expect(can("Almacén", "quality.markInspection")).toBe(false);
  });

  test("acciones solo Admin", () => {
    for (const action of ["client.edit", "backup.manage", "warehouse.skipQuality"] as const) {
      expect(roles.filter((role) => can(role, action))).toEqual(["Administrador"]);
    }
  });

  test("tipos de OT por rol", () => {
    expect(allowedOrderTypes("Supervisor")).toEqual(["COR", "ESPERA"]);
    expect(allowedOrderTypes("Planificador")).not.toContain("COR");
    expect(allowedOrderTypes("Planificador")).toContain("GAR");
    expect(allowedOrderTypes("Técnico")).toEqual([]);
    expect(allowedOrderTypes("Administrador")).toHaveLength(6);
  });
});

describe("roles y navegación", () => {
  test("el rol Producción ya no existe y su usuario demo es Técnico (Q1)", () => {
    expect(isRole("Producción")).toBe(false);
    expect(demoAccounts.find((account) => account.username === "tecnico")?.role).toBe("Técnico");
    expect(demoAccounts.some((account) => account.username === "produccion")).toBe(false);
  });

  test("todas las cuentas demo tienen rol válido", () => {
    for (const account of demoAccounts) expect(roles).toContain(account.role);
  });

  test("rutas por defecto", () => {
    expect(defaultRoute("Técnico")).toBe("/bandeja");
    expect(defaultRoute("Supervisor")).toBe("/produccion");
    expect(defaultRoute("Almacén")).toBe("/almacen");
    expect(defaultRoute("Contabilidad")).toBe("/dashboard");
  });

  test("Ingeniería e Industrial ve /ingenieria y /produccion (Q6)", () => {
    expect(canAccessRoute("Ingeniería e Industrial", "/ingenieria")).toBe(true);
    expect(canAccessRoute("Ingeniería e Industrial", "/produccion")).toBe(true);
    expect(can("Ingeniería e Industrial", "order.create")).toBe(false);
    expect(can("Ingeniería e Industrial", "order.reopen")).toBe(false);
  });

  test("menú de cada rol coincide con roleModules", () => {
    for (const role of roles) {
      const expected = roleModules[role].includes("*") ? null : [...roleModules[role]].sort();
      const actual = navItemsForRole(role).map((item) => item.to).sort();
      if (expected) expect(actual).toEqual(expected.filter((path) => path !== "/planes-mantenimiento"));
      else expect(actual.length).toBeGreaterThan(0);
    }
    expect(navItemsForRole("Técnico").map((item) => item.to)).toEqual(["/bandeja"]);
  });

  test("redirects legacy", () => {
    expect(legacyRedirects["/ordenes"]).toBe("/produccion");
    expect(legacyRedirects["/personal"]).toBe("/produccion?tab=equipo");
    expect(legacyRedirects["/hojas-ruta"]).toBe("/ingenieria");
  });
});
