import { keys } from "../data/keys";

export const financeStateStorageKey = keys.financeState;

export type AccountType = "Activo" | "Pasivo" | "Patrimonio" | "Ingreso" | "Gasto";
export type FinanceAccount = { code: string; name: string; type: AccountType };
export type InvoiceKind = "Compra" | "Venta";
export type InvoiceStatus = "Contabilizada" | "Pagada" | "Borrador" | "Emitida (demo)";
export type FinanceCurrency = "CLP" | "USD" | "UF";

export type FinanceInvoice = {
  id: string;
  kind: InvoiceKind;
  documentType: string;
  number: string;
  counterparty: string;
  issueDate: string;
  dueDate: string;
  currency: FinanceCurrency;
  exchangeRate: number;
  netAmount: number;
  vatAmount: number;
  totalAmount: number;
  totalClp: number;
  accountCode: string;
  purchaseOrder?: string;
  contract?: string;
  wbs?: string;
  status: InvoiceStatus;
  paymentDate?: string;
  paymentReference?: string;
};

export type JournalLine = {
  accountCode: string;
  accountName: string;
  debit: number;
  credit: number;
};

export type JournalEntry = {
  id: string;
  date: string;
  description: string;
  sourceId: string;
  lines: JournalLine[];
};
export type FinanceState = {
  invoices: FinanceInvoice[];
  entries: JournalEntry[];
  accounts: FinanceAccount[];
};

export const defaultAccounts: FinanceAccount[] = [
  { code: "110101", name: "Banco moneda nacional", type: "Activo" },
  { code: "110201", name: "Clientes nacionales", type: "Activo" },
  { code: "110301", name: "IVA crédito fiscal", type: "Activo" },
  { code: "210101", name: "Proveedores nacionales", type: "Pasivo" },
  { code: "210201", name: "IVA débito fiscal", type: "Pasivo" },
  { code: "310101", name: "Capital", type: "Patrimonio" },
  { code: "410101", name: "Ingresos por servicios", type: "Ingreso" },
  { code: "510101", name: "Gastos de mantenimiento", type: "Gasto" },
  { code: "510201", name: "Gastos de servicios externos", type: "Gasto" },
];

export const emptyFinanceState: FinanceState = {
  invoices: [],
  entries: [],
  accounts: defaultAccounts,
};

export function readFinanceList<T>(key: string, fallback: T[] = []): T[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed as T[];
    console.warn(`Los datos financieros guardados no tienen formato de lista (${key}).`);
  } catch (error) {
    console.warn(`No se pudieron leer los datos financieros guardados (${key}).`, error);
  }
  return fallback;
}

export function readFinanceState(): FinanceState {
  try {
    const raw = localStorage.getItem(financeStateStorageKey);
    if (!raw) return emptyFinanceState;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed === "object" && parsed !== null &&
      "invoices" in parsed && Array.isArray(parsed.invoices) &&
      "entries" in parsed && Array.isArray(parsed.entries) &&
      "accounts" in parsed && Array.isArray(parsed.accounts)) {
      return parsed as FinanceState;
    }
    console.warn("El estado financiero guardado no tiene el formato esperado; se inicia sin movimientos.");
  } catch (error) {
    console.error("No se pudo leer el estado financiero guardado.", error);
  }
  return emptyFinanceState;
}

export function saveFinanceState(value: FinanceState): boolean {
  try {
    localStorage.setItem(financeStateStorageKey, JSON.stringify(value));
    return true;
  } catch (error) {
    console.error("No se pudo guardar el estado financiero.", error);
    return false;
  }
}

export function makeFinanceId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

export function roundCurrency(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
