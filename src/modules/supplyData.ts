import { keys } from "../data/keys";

export const purchaseRequestsStorageKey = keys.purchaseRequests;
export const purchaseOrdersStorageKey = keys.purchaseOrders;
export const suppliersStorageKey = keys.suppliers;
export const quotationsStorageKey = keys.quotations;

export type SupplierMaster = {
  id: string;
  name: string;
};

export type PurchaseRequestStatus =
  | "Pendiente cotización"
  | "Cotización en curso"
  | "OC pendiente aprobación"
  | "OC aprobada"
  | "Cerrada";

export type PurchaseRequest = {
  id: string;
  materialCode: string;
  materialName: string;
  unit: string;
  quantity: number;
  needDate: string;
  callIds: string[];
  wbs?: string;
  contract?: string;
  createdBy?: string;
  status: PurchaseRequestStatus;
  supplier?: string;
  quotedUnitCost?: number;
  purchaseOrderId?: string;
  expectedDate?: string;
  quotes?: PurchaseQuote[];
};

export type QuotationStatus = "Pendiente" | "Ganadora" | "Rechazada" | "Expirada";

export type PurchaseQuote = {
  id: string;
  supplier: string;
  unitCost: number;
  expectedDate: string;
  status?: QuotationStatus;
  discount?: number;
  paymentTerms?: string;
  awardedDate?: string;
};

export type PurchaseOrder = {
  id: string;
  requestId: string;
  materialCode: string;
  materialName: string;
  unit: string;
  quantity: number;
  supplier: string;
  unitCost: number;
  expectedDate: string;
  receivedQuantity?: number;
  wbs?: string;
  contract?: string;
  createdBy?: string;
  status: "Pendiente aprobación" | "Aprobada" | "Rechazada" | "Recepcionada";
  approvedBy?: string;
  selectedQuoteId?: string;
  winningQuoteId?: string;
};

export type AwardHistory = {
  id: string;
  requestId: string;
  materialCode: string;
  materialName: string;
  quantity: number;
  unit: string;
  winningQuoteId: string;
  supplier: string;
  unitCost: number;
  awardedDate: string;
  expectedDate: string;
  purchaseOrderId: string;
};

export function readStoredList<T>(key: string): T[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed as T[];
    console.warn(`Los datos guardados no tienen formato de lista (${key}).`);
  } catch (error) {
    console.warn(`No se pudieron leer los datos guardados (${key}).`, error);
  }
  return [];
}

export function makeSupplyId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

export type CostAssignment = { contract: string; wbs: string };

// WBS/contrato de una solicitud: el guardado en ella o, si viene del MRP, el del plan de su primera llamada.
export function requestCostAssignment(
  request: Pick<PurchaseRequest, "callIds" | "wbs" | "contract">,
  calls: { id: string; plan: { contract: string; wbs: string } }[],
): CostAssignment | null {
  if (request.wbs && request.contract) return { contract: request.contract, wbs: request.wbs };
  const call = calls.find((item) => request.callIds.includes(item.id) && item.plan.wbs);
  return call ? { contract: call.plan.contract, wbs: call.plan.wbs } : null;
}

// Una factura de compra sin OC debe imputarse a un WBS; con OC hereda el de la OC.
export function purchaseInvoiceWbsError(input: { kind: string; purchaseOrder?: string; wbs?: string }): string | null {
  if (input.kind !== "Compra" || input.purchaseOrder?.trim()) return null;
  return input.wbs?.trim() ? null : "Las facturas de compra sin OC exigen contrato y elemento WBS.";
}
