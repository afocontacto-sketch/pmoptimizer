export const purchaseRequestsStorageKey = "pmoptimizer-purchase-requests";
export const purchaseOrdersStorageKey = "pmoptimizer-purchase-orders";

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
  status: PurchaseRequestStatus;
  supplier?: string;
  quotedUnitCost?: number;
  purchaseOrderId?: string;
  expectedDate?: string;
  quotes?: PurchaseQuote[];
};

export type PurchaseQuote = {
  id: string;
  supplier: string;
  unitCost: number;
  expectedDate: string;
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
  status: "Pendiente aprobación" | "Aprobada" | "Rechazada" | "Recepcionada";
  approvedBy?: string;
  selectedQuoteId?: string;
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
