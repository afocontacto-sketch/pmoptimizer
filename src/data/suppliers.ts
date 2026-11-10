import { can } from "../app/permissions";
import type { Role } from "../app/roles";
import { appendAudit } from "./audit";
import { chileBanks } from "./chileBanks";
import { keys } from "./keys";
import { fail, ok } from "./result";
import type { Result } from "./result";
import { readJson, runAtomic, updateJson } from "./storage";

export const chileRegions = [
  "Arica y Parinacota", "Tarapacá", "Antofagasta", "Atacama", "Coquimbo", "Valparaíso", "Metropolitana de Santiago",
  "Libertador General Bernardo O'Higgins", "Maule", "Ñuble", "Biobío", "La Araucanía", "Los Ríos", "Los Lagos",
  "Aysén del General Carlos Ibáñez del Campo", "Magallanes y de la Antártica Chilena",
] as const;

export const accountTypes = ["Corriente", "Vista/RUT", "Ahorro"] as const;
export type AccountType = (typeof accountTypes)[number];

export const paymentModes = ["Contado", "15", "30", "45", "60", "Otro"] as const;
export type PaymentMode = (typeof paymentModes)[number];

// Ley 21.131: pago a 30 días; más de 30 requiere acuerdo escrito y tope de 60.
export const LEGAL_PAYMENT_DAYS = 30;
export const MAX_PAYMENT_DAYS = 60;

export type SupplierContact = { name: string; role: string; email: string; phone: string; primary: boolean };
export type BankAccount = { bankCode: string; type: AccountType | ""; number: string; holder: string; holderRut: string; paymentEmail: string };
export type PaymentTerm = { mode: PaymentMode; days: number; condition: string };
export type SupplierAddress = { street: string; commune: string; city: string; region: string; country: string };

export type Supplier = {
  id: string;
  name: string; // razón social; las OC y cotizaciones lo referencian por este nombre
  tradeName: string;
  rut: string;
  activity: string; // giro
  address: SupplierAddress;
  contacts: SupplierContact[];
  bank: BankAccount;
  paymentTerm: PaymentTerm;
  categories: string[];
  active: boolean;
};

export type SupplierInput = Omit<Supplier, "id">;
type Actor = { user: string; role: Role };

export const emptySupplierInput = (): SupplierInput => ({
  name: "", tradeName: "", rut: "", activity: "",
  address: { street: "", commune: "", city: "", region: "", country: "Chile" },
  contacts: [{ name: "", role: "", email: "", phone: "", primary: true }],
  bank: { bankCode: "", type: "", number: "", holder: "", holderRut: "", paymentEmail: "" },
  paymentTerm: { mode: "30", days: 30, condition: "" },
  categories: [],
  active: true,
});

// ---- RUT ----
export const normalizeRut = (value: string): string => value.replace(/[.\s-]/g, "").toUpperCase();

export function isValidRut(value: string): boolean {
  const rut = normalizeRut(value);
  if (!/^\d{7,8}[\dK]$/.test(rut)) return false;
  let sum = 0;
  let factor = 2;
  for (const digit of rut.slice(0, -1).split("").reverse()) {
    sum += Number(digit) * factor;
    factor = factor === 7 ? 2 : factor + 1;
  }
  const rest = 11 - (sum % 11);
  return (rest === 11 ? "0" : rest === 10 ? "K" : String(rest)) === rut.slice(-1);
}

export function formatRut(value: string): string {
  const rut = normalizeRut(value);
  if (rut.length < 2) return rut;
  return `${rut.slice(0, -1).replace(/\B(?=(\d{3})+(?!\d))/g, ".")}-${rut.slice(-1)}`;
}

// ---- Plazo de pago ----
export function paymentTermWarning(days: number): string | null {
  if (days > MAX_PAYMENT_DAYS) {
    return `Ley 21.131: el plazo de ${days} días supera el tope de ${MAX_PAYMENT_DAYS}. Más de ${LEGAL_PAYMENT_DAYS} días requiere acuerdo por escrito y no puede pasar de ${MAX_PAYMENT_DAYS}.`;
  }
  if (days > LEGAL_PAYMENT_DAYS) {
    return `Ley 21.131 (pago a ${LEGAL_PAYMENT_DAYS} días): un plazo de ${days} días requiere acuerdo por escrito, con tope de ${MAX_PAYMENT_DAYS}.`;
  }
  return null;
}

export const termDays = (mode: PaymentMode, customDays: number): number => mode === "Contado" ? 0 : mode === "Otro" ? customDays : Number(mode);

export const paymentTermLabel = (term: PaymentTerm): string => term.days === 0 ? "Contado" : `${term.days} días`;

export function dueDateFromTerm(issueDate: string, days: number): string {
  const [year, month, day] = issueDate.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

// Plazo de una OC: el copiado al crearla o, en OC antiguas, el vigente del proveedor.
export function orderPaymentDays(order: { supplier: string; paymentTermDays?: number }, suppliers: Supplier[]): number | null {
  if (order.paymentTermDays !== undefined) return order.paymentTermDays;
  const supplier = suppliers.find((item) => item.name === order.supplier);
  return supplier ? supplier.paymentTerm.days : null;
}

// ---- Lectura y migración ----
export function normalizeSupplier(raw: { id: string; name: string } & Partial<Supplier>): Supplier {
  const base = emptySupplierInput();
  return {
    ...base, ...raw,
    address: { ...base.address, ...raw.address },
    bank: { ...base.bank, ...raw.bank },
    paymentTerm: { ...base.paymentTerm, ...raw.paymentTerm },
    contacts: raw.contacts ?? [],
    categories: raw.categories ?? [],
    active: raw.active ?? true,
  };
}

export const readSuppliers = (): Supplier[] =>
  readJson<Array<{ id: string; name: string } & Partial<Supplier>>>(keys.suppliers, []).map(normalizeSupplier);

type NamedRef = { supplier: string };

function references(name: string): { orders: number; quotes: number } {
  const same = (value: string) => value.trim().toLowerCase() === name.trim().toLowerCase();
  const orders = readJson<NamedRef[]>(keys.purchaseOrders, []).filter((item) => same(item.supplier)).length;
  const requests = readJson<Array<{ quotes?: NamedRef[] }>>(keys.purchaseRequests, []);
  const awards = readJson<NamedRef[]>(keys.quotations, []).filter((item) => same(item.supplier)).length;
  const quotes = requests.flatMap((request) => request.quotes ?? []).filter((item) => same(item.supplier)).length;
  return { orders, quotes: quotes + awards };
}

export const supplierReferences = references;

// Lleva los proveedores antiguos ({id, name}) y los nombres usados en OC/cotizaciones al modelo completo.
export function migrateSuppliers(): Supplier[] {
  const stored = readJson<Array<{ id: string; name: string } & Partial<Supplier>>>(keys.suppliers, []);
  const names = new Set(stored.map((item) => item.name.trim().toLowerCase()));
  const historical = [
    ...readJson<NamedRef[]>(keys.purchaseOrders, []).map((item) => item.supplier),
    ...readJson<Array<{ quotes?: NamedRef[] }>>(keys.purchaseRequests, []).flatMap((item) => item.quotes?.map((quote) => quote.supplier) ?? []),
  ].filter((name) => name && !names.has(name.trim().toLowerCase()));
  const added = [...new Set(historical)].map((name, index) => ({ id: `PROV-MIG-${Date.now().toString(36).toUpperCase()}-${index + 1}`, name }));
  const legacy = stored.some((item) => item.active === undefined || item.address === undefined);
  if (added.length === 0 && !legacy) return stored.map(normalizeSupplier);
  const next = [...stored, ...added].map(normalizeSupplier);
  updateJson<Supplier[]>(keys.suppliers, [], () => next);
  return next;
}

// ---- Escritura ----
const emailOk = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());

export function validateSupplierInput(input: SupplierInput): string | null {
  if (!input.name.trim()) return "Ingresa la razón social.";
  if (!isValidRut(input.rut)) return "El RUT no es válido (revisa el dígito verificador).";
  if (!input.activity.trim()) return "Ingresa el giro.";
  if (input.contacts.length === 0) return "Agrega al menos un contacto.";
  for (const contact of input.contacts) {
    if (!contact.name.trim()) return "Cada contacto necesita nombre.";
    if (contact.email.trim() && !emailOk(contact.email)) return `El correo del contacto ${contact.name} no es válido.`;
  }
  if (input.contacts.filter((contact) => contact.primary).length !== 1) return "Marca exactamente un contacto principal.";
  const { bank } = input;
  if (Object.values(bank).some((value) => value.trim())) {
    if (!bank.bankCode || !chileBanks.some((item) => item.code === bank.bankCode)) return "Selecciona el banco de la cuenta de pago.";
    if (!bank.type || !accountTypes.includes(bank.type)) return "Selecciona el tipo de cuenta.";
    if (!/^\d{4,20}$/.test(bank.number.trim())) return "El número de cuenta debe tener solo dígitos (4 a 20).";
    if (!bank.holder.trim()) return "Ingresa el titular de la cuenta.";
    if (!isValidRut(bank.holderRut)) return "El RUT del titular no es válido.";
    if (!emailOk(bank.paymentEmail)) return "Ingresa un correo válido para el aviso de pago.";
  }
  const days = input.paymentTerm.days;
  if (!Number.isInteger(days) || days < 0 || days > 365) return "El plazo de pago debe ser un número entero de días (0 a 365).";
  return null;
}

const bankOf = (supplier: Pick<Supplier, "bank">) => JSON.stringify(supplier.bank);

export function saveSupplier(input: SupplierInput, actor: Actor, id?: string): Result<Supplier> {
  if (!can(actor.role, "supplier.edit")) return fail("Solo Compras o Administrador puede crear o editar proveedores.");
  const error = validateSupplierInput(input);
  if (error) return fail(error);
  const list = readSuppliers();
  const current = id ? list.find((item) => item.id === id) : undefined;
  if (id && !current) return fail("El proveedor no existe.");
  const rut = formatRut(input.rut);
  const others = list.filter((item) => item.id !== id);
  if (others.some((item) => item.rut && normalizeRut(item.rut) === normalizeRut(rut))) return fail(`El RUT ${rut} ya está registrado en otro proveedor.`);
  if (others.some((item) => item.name.trim().toLowerCase() === input.name.trim().toLowerCase())) return fail("Ya existe un proveedor con esa razón social.");
  if (current && current.name !== input.name.trim()) {
    const refs = references(current.name);
    if (refs.orders + refs.quotes > 0) return fail("No se puede cambiar la razón social: el proveedor tiene OC o cotizaciones asociadas.");
  }
  const holderRut = input.bank.holderRut.trim() ? formatRut(input.bank.holderRut) : "";
  const saved: Supplier = normalizeSupplier({
    ...input, id: current?.id ?? `PROV-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
    name: input.name.trim(), rut, bank: { ...input.bank, holderRut },
  });
  const bankChanged = current ? bankOf(current) !== bankOf(saved) : Object.values(saved.bank).some((value) => value.trim() !== "");
  const done = runAtomic([keys.suppliers, keys.auditLog], [
    () => updateJson<Supplier[]>(keys.suppliers, [], (stored) => current ? stored.map((item) => item.id === saved.id ? saved : item) : [...stored, saved]) !== null,
    () => appendAudit({
      user: actor.user, role: actor.role, entity: "supplier", entityId: saved.id, action: current ? "update" : "create",
      before: current, after: saved, sensitive: bankChanged || undefined,
    }),
  ]);
  return done ? ok(saved) : fail("No se pudo guardar el proveedor en este navegador.");
}

export function setSupplierActive(id: string, active: boolean, actor: Actor): Result<Supplier> {
  if (!can(actor.role, "supplier.edit")) return fail("Solo Compras o Administrador puede activar o desactivar proveedores.");
  const current = readSuppliers().find((item) => item.id === id);
  if (!current) return fail("El proveedor no existe.");
  if (current.active === active) return ok(current);
  const updated = { ...current, active };
  const done = runAtomic([keys.suppliers, keys.auditLog], [
    () => updateJson<Supplier[]>(keys.suppliers, [], (stored) => stored.map((item) => item.id === id ? updated : item)) !== null,
    () => appendAudit({ user: actor.user, role: actor.role, entity: "supplier", entityId: id, action: active ? "activate" : "deactivate", before: { active: current.active }, after: { active } }),
  ]);
  return done ? ok(updated) : fail("No se pudo guardar el cambio de estado.");
}

// Un proveedor con OC o cotizaciones no se elimina; solo se desactiva.
export function deleteSupplier(id: string, actor: Actor): Result<void> {
  if (!can(actor.role, "supplier.edit")) return fail("Solo Compras o Administrador puede eliminar proveedores.");
  const current = readSuppliers().find((item) => item.id === id);
  if (!current) return fail("El proveedor no existe.");
  const refs = references(current.name);
  if (refs.orders + refs.quotes > 0) return fail(`${current.name} tiene ${refs.orders} OC y ${refs.quotes} cotizaciones; solo se puede desactivar.`);
  const done = runAtomic([keys.suppliers, keys.auditLog], [
    () => updateJson<Supplier[]>(keys.suppliers, [], (stored) => stored.filter((item) => item.id !== id)) !== null,
    () => appendAudit({ user: actor.user, role: actor.role, entity: "supplier", entityId: id, action: "delete", before: current }),
  ]);
  return done ? ok(undefined) : fail("No se pudo eliminar el proveedor.");
}
