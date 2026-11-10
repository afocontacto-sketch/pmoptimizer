import { keys } from "./keys";
import { readJson } from "./storage";

export type StockStatus = "Libre utilización" | "Bloqueado calidad" | "En tránsito";

export type StockBin = {
  id: string;
  code: string;
  name: string;
  warehouse: string;
  location: string;
  status: StockStatus;
  quantity: number;
  reserved: number; // deprecado: siempre 0
  unit: string;
  unitCost: number;
  reference?: string;
  receivedAt?: string;
  releasedAt?: string;
  releasedBy?: string;
};

export type StockMovementType =
  | "Recepción OC"
  | "Salida picking OT"
  | "Liberación de calidad"
  | "Ubicación"
  | "Ajuste inventario"
  | "Traspaso emitido"
  | "Traspaso recibido"
  | "Diferencia traspaso";

export type StockMovement = {
  id: string;
  date: string;
  type: StockMovementType;
  code: string;
  quantity: number;
  from: string;
  to: string;
  reference: string;
  user: string;
  orderId?: string;
  orderType?: string;
  wbs?: string;
  unitCost?: number;
  transferId?: string;
};

export type TransferStatus = "En tránsito" | "Recibido" | "Recibido con diferencia";

export type TransferLine = {
  code: string;
  name: string;
  unit: string;
  unitCost: number;
  sent: number;
  received?: number;
};

export type TransferOrder = {
  id: string;
  createdAt: string;
  createdBy: string;
  fromWarehouse: string;
  toWarehouse: string;
  status: TransferStatus;
  lines: TransferLine[];
  receivedAt?: string;
  receivedBy?: string;
  toQuality: boolean;
};

export function readBins(): StockBin[] {
  return readJson<StockBin[]>(keys.warehouseBins, []);
}

export function readMovements(): StockMovement[] {
  return readJson<StockMovement[]>(keys.warehouseMovements, []);
}

export function readTransfers(): TransferOrder[] {
  return readJson<TransferOrder[]>(keys.transferOrders, []);
}

// Agrupa bins por material y estado (suma de cantidades).
export function aggregateBins(bins: StockBin[]): Map<string, { free: number; quality: number; transit: number; total: number }> {
  const result = new Map<string, { free: number; quality: number; transit: number; total: number }>();
  for (const bin of bins) {
    const row = result.get(bin.code) ?? { free: 0, quality: 0, transit: 0, total: 0 };
    if (bin.status === "Libre utilización") row.free += bin.quantity;
    else if (bin.status === "Bloqueado calidad") row.quality += bin.quantity;
    else row.transit += bin.quantity;
    row.total += bin.quantity;
    result.set(bin.code, row);
  }
  return result;
}

// Costo medio ponderado sobre todos los bins del material con cantidad > 0.
export function averageCost(code: string, bins: StockBin[]): number {
  const own = bins.filter((bin) => bin.code === code && bin.quantity > 0);
  const qty = own.reduce((sum, bin) => sum + bin.quantity, 0);
  return qty === 0 ? 0 : own.reduce((sum, bin) => sum + bin.quantity * bin.unitCost, 0) / qty;
}
