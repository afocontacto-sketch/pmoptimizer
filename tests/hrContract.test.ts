import { beforeEach, describe, expect, test } from "vitest";
import type { AuditRecord } from "../src/data/audit";
import { keys } from "../src/data/keys";
import { seedPayrollParams } from "../src/data/payroll";
import { contractBlocks, createContractDraft } from "../src/modules/hr/contractDocx";
import { buildContractContext, emptyContractData, generateContractText, isValidRut, numberToWords, renderTemplate, validateContract } from "../src/modules/hr/contractTemplate";
import type { ContractInput } from "../src/modules/hr/contractTemplate";
import { addEmployeeDocument, deleteEmployeeDocument, readEmployeeDocuments } from "../src/modules/hr/employeeDocuments";
import { defaultHrCompany, readHrCompany, saveHrCompany } from "../src/modules/hr/hrCompany";
import { installStorage, readStore } from "./helpers/storageMock";

const company = {
  ...defaultHrCompany, rut: "76.123.456-0", giro: "Mantenimiento industrial", representante: "Marta Pérez", representanteRut: "12.345.678-5",
  domicilio: "Av. Los Leones 100, Providencia", ciudad: "Santiago", correo: "contacto@demo.cl", correoDatos: "datos@demo.cl",
  protocoloKarinVersion: "1.0", protocoloKarinFecha: "2026-08-01", canalDenunciaKarin: "denuncias@demo.cl",
  defaults: { ...defaultHrCompany.defaults, formaPago: "depósito" },
};
const input = (overrides: Partial<ContractInput["employee"]> = {}, data: Partial<ContractInput["data"]> = {}): ContractInput => ({
  employee: {
    id: "EMP-9", name: "Luis Soto", rut: "11.111.111-1", position: "Técnico mecánico", contractType: "Indefinido", contractStart: "2026-12-01", workplace: "Planta Quilicura",
    monthlySalary: 900000, weeklyHours: 42, afp: "Habitat", healthSystem: "FONASA", familyCharges: 0, gratificationMode: "Art50", fixedAllowances: [], recurringDeductions: [], ...overrides,
  },
  data: { ...emptyContractData, fechaNacimiento: "1990-05-10", domicilio: "Calle 1, Maipú", funciones: "Mantenimiento preventivo y correctivo de equipos mecánicos de la planta, con registro en OT.", lugarTrabajoComuna: "Quilicura", lugarTrabajoCiudad: "Santiago", distribucionJornada: "Lunes a viernes de 8:00 a 17:20", ...data },
  company, params: seedPayrollParams, today: "2026-11-25",
});
const text = (value: ContractInput) => {
  const result = generateContractText(value);
  if (!result.ok) throw new Error(result.error);
  return result.value.text;
};

const flat = (value: string) => value.replace(/\s+/g, " ");

beforeEach(installStorage);

describe("validaciones de bloqueo", () => {
  test("sueldo bajo el mínimo bloquea y muestra el error", () => {
    const result = generateContractText(input({ monthlySalary: 500000 }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("menor que el ingreso mínimo");
    expect(generateContractText(input({ monthlySalary: 553553 })).ok).toBe(true);
  });

  test("jornada sobre el máximo, menor de edad, plazo fijo largo, extranjero y Karin", () => {
    expect(validateContract(input({ weeklyHours: 45 })).errors.join(" ")).toContain("supera el máximo legal");
    expect(validateContract(input({}, { fechaNacimiento: "2010-01-01" })).errors.join(" ")).toContain("menor de 18");
    expect(validateContract(input({ contractType: "Plazo fijo", contractEnd: "2028-01-01" })).errors.join(" ")).toContain("no puede durar más de 1");
    expect(validateContract(input({ contractType: "Plazo fijo", contractEnd: "2028-01-01" }, { esProfesionalOGerente: true })).errors).toEqual([]);
    expect(validateContract(input({}, { nacionalidad: "peruana" })).errors.join(" ")).toContain("permiso migratorio");
    expect(validateContract({ ...input(), company: { ...company, protocoloKarinVersion: "" } }).errors.join(" ")).toContain("Ley Karin");
    expect(validateContract({ ...input(), company: { ...company, numTrabajadores: 12 } }).errors.join(" ")).toContain("RIOHS");
    expect(validateContract(input({ contractType: "Honorarios" })).errors).toHaveLength(1);
  });

  test("RUT con módulo 11", () => {
    expect(isValidRut("11.111.111-1")).toBe(true);
    expect(isValidRut("11.111.111-2")).toBe(false);
  });
});

describe("plantilla", () => {
  test("reemplaza variables con formato", () => {
    const out = text(input());
    expect(out).toContain("En Santiago, 25 de noviembre de 2026, entre Mantenciones Industriales Demo SpA, RUT 76.123.456-0");
    expect(out).toContain("Sueldo base mensual: $900.000 (novecientos mil pesos)");
    expect(out).toContain("cargo de Técnico mecánico");
    expect(out).toContain("cédula de identidad N° 11.111.111-1");
    expect(out).not.toMatch(/\{\{|\}\}/);
    expect(numberToWords(1234567)).toBe("un millón doscientos treinta y cuatro mil quinientos sesenta y siete");
    expect(numberToWords(21000)).toBe("veintiún mil");
  });

  test("bloques condicionales por tipo de contrato", () => {
    const indefinido = text(input());
    expect(indefinido).toContain("(PLAZO INDEFINIDO)");
    expect(flat(indefinido)).toContain("Este contrato es de duración indefinida");
    expect(indefinido).not.toContain("a plazo fijo y vence");
    const fijo = text(input({ contractType: "Plazo fijo", contractEnd: "2027-06-01" }));
    expect(fijo).toContain("(PLAZO FIJO)");
    expect(flat(fijo)).toContain("vence el 01 de junio de 2027");
    expect(fijo).not.toContain("duración indefinida. Las partes");
    const obra = text(input({ contractType: "Obra o faena" }, { obraDescripcion: "Overhaul de la línea de producción 3 de la planta Quilicura", obraFechaEstimadaTermino: "2027-02-01" }));
    expect(obra).toContain("(POR OBRA O FAENA)");
    expect(flat(obra)).toContain("cuya fecha estimada de término es el 01 de febrero de 2027");
    expect(obra).not.toContain("Este contrato es a plazo fijo");
  });

  test("condicionales de salud, jornada y gratificación; anidados se resuelven", () => {
    const isapre = text(input({ healthSystem: "ISAPRE", isapreName: "Colmena", isaprePlanUF: 3.5 }));
    expect(flat(isapre)).toContain("Salud: Colmena, con un plan pactado de 3,5 UF mensuales");
    expect(text(input())).toContain("Salud: FONASA.");
    expect(text(input({ gratificationMode: "Art47" }))).toContain("gratificación del artículo 47");
    expect(text(input({ gratificationMode: "Art47" }))).not.toContain("artículo 50 del Código");
    const parcial = text(input({ weeklyHours: 28, monthlySalary: 400000 }, { jornada: "parcial" }));
    expect(parcial).toContain("tiempo parcial de 28 horas semanales");
    const ctx = buildContractContext(input());
    expect(renderTemplate("a{{#si indefinido}}b{{#si plazoFijo}}X{{/si}}c{{/si}}d {{cargo}}", ctx).text).toBe("abcd Técnico mecánico");
    expect(renderTemplate("{{#si noExiste}}x{{/si}}{{variable.rara}}", ctx).missing).toEqual(["condición noExiste", "variable.rara"]);
  });

  test("bloques para docx separan título, cláusulas y firmas", () => {
    const blocks = contractBlocks(text(input()));
    expect(blocks[0]).toMatchObject({ kind: "title", text: "CONTRATO INDIVIDUAL DE TRABAJO" });
    expect(blocks.filter((block) => block.kind === "heading").length).toBeGreaterThan(10);
    expect(blocks.some((block) => block.kind === "body" && block.text.length > 300)).toBe(true);
  });
});

describe("borrador .docx y carpeta del trabajador", () => {
  const actor = { user: "conta", role: "Contabilidad" as const };

  test("genera el .docx, lo guarda como Contrato (borrador) y lo reemplaza al regenerar", async () => {
    const first = await createContractDraft(input(), actor);
    expect(first.ok).toBe(true);
    if (first.ok) expect(first.value.document).toMatchObject({ type: "Contrato", name: "Contrato (borrador)", employeeId: "EMP-9" });
    await createContractDraft(input(), actor);
    const docs = readEmployeeDocuments("EMP-9");
    expect(docs).toHaveLength(1);
    expect(docs[0].dataUrl.startsWith("data:application/vnd.openxmlformats-officedocument.wordprocessingml.document;base64,UEs")).toBe(true);
    const blocked = await createContractDraft(input({ monthlySalary: 1000 }), actor);
    expect(blocked.ok).toBe(false);
    expect(readEmployeeDocuments("EMP-9")).toHaveLength(1);
  });

  test("documentos: límite 2 MB, formato, permisos y audit", () => {
    const doc = { employeeId: "EMP-9", type: "Cédula" as const, name: "Cédula", date: "2026-11-10", fileName: "ci.pdf", size: 1000, dataUrl: "data:application/pdf;base64,AAAA" };
    expect(addEmployeeDocument({ ...doc, size: 2 * 1024 * 1024 + 1 }, actor).ok).toBe(false);
    expect(addEmployeeDocument({ ...doc, fileName: "ci.exe" }, actor).ok).toBe(false);
    expect(addEmployeeDocument(doc, { user: "x", role: "Técnico" }).ok).toBe(false);
    const saved = addEmployeeDocument(doc, actor);
    expect(saved.ok).toBe(true);
    if (!saved.ok) return;
    expect(deleteEmployeeDocument(saved.value.id, { user: "x", role: "Supervisor" }).ok).toBe(false);
    expect(deleteEmployeeDocument(saved.value.id, actor).ok).toBe(true);
    expect(readEmployeeDocuments()).toHaveLength(0);
    expect(readStore<AuditRecord[]>(keys.auditLog, []).map((item) => item.action)).toEqual(["addDocument", "deleteDocument"]);
  });

  test("datos de la empresa editables por Contabilidad o Administrador", () => {
    expect(saveHrCompany(company, { user: "x", role: "Calidad" }).ok).toBe(false);
    expect(saveHrCompany(company, { user: "a", role: "Administrador" }).ok).toBe(true);
    expect(readHrCompany().representante).toBe("Marta Pérez");
  });
});
