import type { OrderType } from "./docNumbering";

export type WbsElement = {
  code: string;
  type: OrderType;
  description: string;
  budget: number;
};

export type Contract = {
  code: string;
  customer: string;
  description: string;
  startDate?: string;
  endDate?: string;
  wbs: WbsElement[];
};

export type ApprovedBudget = {
  contract: string;
  category: string;
  amount: number;
  version: number;
  approvedBy: string;
  approvedAt: string;
};

export type EacSnapshot = {
  contract: string;
  period: string;
  category: string;
  real: number;
  etc: number;
  eac: number;
  savedAt: string;
  closed: boolean;
  closedBy?: string;
};

// Vigencia: sin fechas el contrato se considera siempre vigente.
export function isContractActive(contract: Contract, isoDate: string): boolean {
  if (contract.startDate && isoDate < contract.startDate) return false;
  if (contract.endDate && isoDate > contract.endDate) return false;
  return true;
}

export const demoContract: Contract = {
  code: "CT1234",
  customer: "Fiat Chile",
  description: "Contrato ficticio de mantenimiento de flota",
  startDate: "2026-01-01",
  endDate: "2027-12-31",
  wbs: [
    { code: "CT1234-CL-B2N4-PRE", type: "PRE", description: "Mantenimiento preventivo", budget: 2500000 },
    { code: "CT1234-CL-B2N4-OVH", type: "OVH", description: "Overhaul", budget: 8000000 },
    { code: "CT1234-CL-B2N4-COR", type: "COR", description: "Correctivo", budget: 3500000 },
    { code: "CT1234-CL-B2N4-GAR", type: "GAR", description: "Garantías", budget: 1000000 },
    { code: "CT1234-CL-B2N4-REP", type: "REP", description: "Reparaciones", budget: 2000000 },
    { code: "CT1234-CL-B2N4-IND", type: "ESPERA", description: "Tiempo improductivo", budget: 0 },
  ],
};

// Presupuesto aprobado v1: una línea por elemento WBS con presupuesto, categorizada por su tipo.
export function approvedBudgetFromContract(contract: Contract, isoDate: string): ApprovedBudget[] {
  return contract.wbs
    .filter((element) => element.budget > 0)
    .map((element) => ({
      contract: contract.code,
      category: element.type,
      amount: element.budget,
      version: 1,
      approvedBy: "Administrador",
      approvedAt: isoDate,
    }));
}

// Sufijos WBS configurables por contrato (IND = tiempo improductivo).
export const wbsSuffixes = ["PRE", "OVH", "COR", "GAR", "REP", "IND"] as const;

// Contratos nuevos exigen vigencia completa y coherente (fin no anterior al inicio). Devuelve el error o null.
export function validateContractDates(startDate?: string, endDate?: string): string | null {
  const iso = /^\d{4}-\d{2}-\d{2}$/;
  if (!startDate || !endDate) return "Indica fecha de inicio y de fin del contrato.";
  if (!iso.test(startDate) || !iso.test(endDate)) return "Las fechas del contrato no son válidas.";
  if (endDate < startDate) return "La fecha de fin no puede ser anterior a la de inicio.";
  return null;
}
