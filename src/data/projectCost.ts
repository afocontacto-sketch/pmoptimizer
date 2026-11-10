import type { ApprovedBudget, Contract, EacSnapshot } from "./contracts";
import type { FinanceInvoice } from "../modules/financeData";
import type { PlannedCallRecord, RouteTemplate } from "../modules/maintenanceData";
import type { PurchaseOrder, PurchaseRequest } from "../modules/supplyData";
import { averageCost } from "./stock";
import type { StockBin, StockMovement } from "./stock";
import type { TimeEntry, WorkOrder } from "./workOrders";

// PM-07 EAC: función pura (sin React ni localStorage). Supuesto A9 del plan 6.6.
export const OUTSIDE_CONTRACT = "Fuera de contrato";
export const eacCategories = ["OVH", "PRE", "COR", "GAR", "Otros"] as const;
export type EacCategory = (typeof eacCategories)[number];
export type EacScale = 1 | 100 | 10000;
export const eacScales: readonly EacScale[] = [1, 100, 10000];

export type Cost = { materials: number; labor: number; services: number };
export type IndirectCost = { contract: string; date: string; amount: number };
export type EacRowKind = "category" | "result" | "outside" | "total";

export type EacRow = {
  key: string;
  kind: EacRowKind;
  contract: string;
  category: string;
  real: number;
  etc: number;
  eac: number;
  realDetail: Cost;
  etcDetail: Cost;
  previousEac: number | null;
  variation: number | null;
  budget: number | null;
  varBudget: number | null;
};

export type EacInput = {
  contracts: Contract[];
  orders: WorkOrder[];
  timeEntries: TimeEntry[];
  movements: StockMovement[];
  invoices: FinanceInvoice[];
  purchaseOrders: PurchaseOrder[];
  requests: PurchaseRequest[];
  calls: PlannedCallRecord[];
  routes: RouteTemplate[];
  bins: StockBin[];
  indirectPayroll: IndirectCost[];
  budgets: ApprovedBudget[];
  snapshots: EacSnapshot[];
  year: number;
  month: number; // 1-12
  nowMs: number;
  contractCodes?: string[]; // vacío o ausente = todos
};

const zero = (): Cost => ({ materials: 0, labor: 0, services: 0 });
export const costTotal = (cost: Cost): number => cost.materials + cost.labor + cost.services;
const addCost = (target: Cost, source: Cost): void => {
  target.materials += source.materials;
  target.labor += source.labor;
  target.services += source.services;
};

export function mapCategory(type: string): EacCategory {
  return type === "OVH" || type === "PRE" || type === "COR" || type === "GAR" ? type : "Otros";
}

export const periodOf = (year: number, month: number): string => `${year}-${String(month).padStart(2, "0")}`;

export function previousPeriod(period: string): string {
  const [year, month] = period.split("-").map(Number);
  return month === 1 ? periodOf(year - 1, 12) : periodOf(year, month - 1);
}

export function cutoffDate(year: number, month: number): string {
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${periodOf(year, month)}-${String(last).padStart(2, "0")}`;
}

type Bucket = { real: Cost; etc: Cost };

export function computeEac(input: EacInput): EacRow[] {
  const period = periodOf(input.year, input.month);
  const cutoff = cutoffDate(input.year, input.month);
  const cutoffMs = Date.parse(`${cutoff}T23:59:59.999Z`);
  const monthStart = `${period}-01`;
  const selected = input.contractCodes?.length ? new Set(input.contractCodes) : null;
  const wbsIndex = new Map<string, { contract: string; category: EacCategory }>();
  for (const contract of input.contracts) {
    for (const element of contract.wbs) {
      if (!wbsIndex.has(element.code)) wbsIndex.set(element.code, { contract: contract.code, category: mapCategory(element.type) });
    }
  }
  const contractByCode = new Map(input.contracts.map((contract): [string, Contract] => [contract.code, contract]));
  const buckets = new Map<string, Bucket>();
  const slot = (contract: string, category: EacCategory): Bucket => {
    const key = `${contract}|${category}`;
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = { real: zero(), etc: zero() };
      buckets.set(key, bucket);
    }
    return bucket;
  };
  const place = (wbs: string | undefined, forceOtros = false) => {
    const found = wbs ? wbsIndex.get(wbs) : undefined;
    if (!found) return { contract: OUTSIDE_CONTRACT, category: "Otros" as EacCategory };
    return { contract: found.contract, category: forceOtros ? ("Otros" as EacCategory) : found.category };
  };
  const add = (where: { contract: string; category: EacCategory }, kind: "real" | "etc", part: keyof Cost, amount: number) => {
    if (!Number.isFinite(amount) || amount === 0) return;
    slot(where.contract, where.category)[kind][part] += amount;
  };

  // REAL: picking, horas, facturas de servicio con WBS (sin OC) y nómina indirecta, hasta el fin del mes de corte.
  for (const movement of input.movements) {
    if (movement.type !== "Salida picking OT" || movement.date.slice(0, 10) > cutoff) continue;
    add(place(movement.wbs), "real", "materials", movement.quantity * (movement.unitCost ?? 0));
  }
  for (const entry of input.timeEntries) {
    const start = Date.parse(entry.start);
    const end = Math.min(entry.end ? Date.parse(entry.end) : input.nowMs, cutoffMs);
    if (!(end > start)) continue;
    add(place(entry.wbs), "real", "labor", ((end - start) / 3600000) * entry.hourlyRate);
  }
  for (const invoice of input.invoices) {
    if (invoice.kind !== "Compra" || invoice.status === "Borrador" || !invoice.wbs || invoice.purchaseOrder) continue;
    if (invoice.issueDate.slice(0, 10) > cutoff) continue;
    add(place(invoice.wbs, true), "real", "services", invoice.netAmount * (invoice.exchangeRate || 1));
  }
  for (const cost of input.indirectPayroll) {
    if (cost.date.slice(0, 10) > cutoff) continue;
    const contract = contractByCode.has(cost.contract) ? cost.contract : OUTSIDE_CONTRACT;
    add({ contract, category: "Otros" }, "real", "labor", cost.amount);
  }

  // ETC: comprometido (sin callIds), OT abiertas y llamadas sin OT hasta el fin del contrato.
  const requestById = new Map(input.requests.map((request): [string, PurchaseRequest] => [request.id, request]));
  for (const order of input.purchaseOrders) {
    if (order.status !== "Aprobada" || !order.wbs) continue;
    if (requestById.get(order.requestId)?.callIds?.length) continue;
    add(place(order.wbs), "etc", "materials", Math.max(0, order.quantity - (order.receivedQuantity ?? 0)) * order.unitCost);
  }
  const orderIds = new Set(input.purchaseOrders.map((order) => order.id));
  for (const request of input.requests) {
    if (request.status !== "OC aprobada" || !request.wbs || request.callIds?.length) continue;
    if (request.purchaseOrderId && orderIds.has(request.purchaseOrderId)) continue;
    add(place(request.wbs), "etc", "materials", request.quantity * (request.quotedUnitCost ?? 0));
  }
  const workedHours = new Map<string, number>();
  for (const entry of input.timeEntries) {
    const end = entry.end ? Date.parse(entry.end) : input.nowMs;
    workedHours.set(entry.orderId, (workedHours.get(entry.orderId) ?? 0) + Math.max(0, (end - Date.parse(entry.start)) / 3600000));
  }
  for (const order of input.orders) {
    if (order.status === "Cerrada") continue;
    const where = place(order.wbs);
    const ops = order.routeOperations ?? [];
    const opsHours = ops.reduce((sum, op) => sum + op.durationHours, 0);
    const rate = order.projectedLaborCost && order.projectedHours > 0
      ? order.projectedLaborCost / order.projectedHours
      : opsHours > 0 ? ops.reduce((sum, op) => sum + op.durationHours * op.hourlyCost, 0) / opsHours : 0;
    add(where, "etc", "labor", Math.max(0, order.projectedHours - (workedHours.get(order.id) ?? 0)) * rate);
    for (const line of order.materials ?? []) {
      const unitCost = averageCost(line.code, input.bins) || line.unitCostAvg || 0;
      add(where, "etc", "materials", Math.max(0, line.required - line.picked) * unitCost);
    }
  }
  const callsWithOrder = new Set(input.orders.map((order) => order.plannedCallId).filter(Boolean));
  const routeById = new Map(input.routes.map((route): [string, RouteTemplate] => [route.id, route]));
  for (const call of input.calls) {
    const due = call.dueDate.slice(0, 10);
    const route = routeById.get(call.routeId);
    if (callsWithOrder.has(call.id) || !route || due < monthStart) continue;
    const endDate = contractByCode.get(call.plan.contract)?.endDate;
    if (endDate && due > endDate) continue;
    const where = place(call.plan.wbs);
    for (const op of route.operations) {
      add(where, "etc", "labor", op.durationHours * op.hourlyCost);
      for (const material of op.materials) {
        add(where, "etc", "materials", material.quantity * (averageCost(material.code, input.bins) || material.unitCost));
      }
    }
  }

  // Presupuesto aprobado: última versión por contrato x categoría de origen, agrupado a categoría EAC.
  const latest = new Map<string, ApprovedBudget>();
  for (const budget of input.budgets) {
    const key = `${budget.contract}|${budget.category}`;
    const current = latest.get(key);
    if (!current || budget.version > current.version) latest.set(key, budget);
  }
  const budgetOf = (contract: string, category: EacCategory): number | null => {
    const lines = [...latest.values()].filter((item) => item.contract === contract && mapCategory(item.category) === category);
    return lines.length ? lines.reduce((sum, item) => sum + item.amount, 0) : null;
  };
  const previousOf = (contract: string, category: EacCategory): number | null => {
    const prior = previousPeriod(period);
    const pool = input.snapshots.filter((item) => item.contract === contract && item.category === category && item.period === prior);
    const chosen = pool.find((item) => item.closed) ?? pool[0];
    return chosen ? chosen.eac : null;
  };
  const sumNullable = (values: (number | null)[]): number | null => {
    const present = values.filter((value): value is number => value !== null);
    return present.length ? present.reduce((sum, value) => sum + value, 0) : null;
  };
  const diff = (a: number | null, b: number | null): number | null => (a === null || b === null ? null : a - b);
  const makeRow = (key: string, kind: EacRowKind, contract: string, category: string, bucket: Bucket,
    previousEac: number | null, budget: number | null): EacRow => {
    const real = costTotal(bucket.real);
    const etc = costTotal(bucket.etc);
    const eac = real + etc;
    return {
      key, kind, contract, category, real, etc, eac, realDetail: bucket.real, etcDetail: bucket.etc,
      previousEac, variation: diff(previousEac === null ? null : eac, previousEac), budget, varBudget: diff(budget === null ? null : eac, budget),
    };
  };

  const rows: EacRow[] = [];
  const grand: Bucket = { real: zero(), etc: zero() };
  const grandPrev: (number | null)[] = [];
  for (const contract of input.contracts) {
    if (selected && !selected.has(contract.code)) continue;
    const total: Bucket = { real: zero(), etc: zero() };
    const prevs: (number | null)[] = [];
    const budgets: (number | null)[] = [];
    for (const category of eacCategories) {
      const bucket = slot(contract.code, category);
      const previous = previousOf(contract.code, category);
      const budget = budgetOf(contract.code, category);
      rows.push(makeRow(`${contract.code}|${category}`, "category", contract.code, category, bucket, previous, budget));
      addCost(total.real, bucket.real);
      addCost(total.etc, bucket.etc);
      prevs.push(previous);
      budgets.push(budget);
    }
    const previous = sumNullable(prevs);
    rows.push(makeRow(`${contract.code}|Resultado`, "result", contract.code, "Resultado", total, previous, sumNullable(budgets)));
    addCost(grand.real, total.real);
    addCost(grand.etc, total.etc);
    grandPrev.push(previous);
  }
  if (!selected) {
    const outside = slot(OUTSIDE_CONTRACT, "Otros");
    const previous = previousOf(OUTSIDE_CONTRACT, "Otros");
    rows.push(makeRow(OUTSIDE_CONTRACT, "outside", OUTSIDE_CONTRACT, OUTSIDE_CONTRACT, outside, previous, null));
    addCost(grand.real, outside.real);
    addCost(grand.etc, outside.etc);
    grandPrev.push(previous);
  }
  const rowsBudget = sumNullable(rows.filter((row) => row.kind === "result").map((row) => row.budget));
  rows.push(makeRow("TOTAL", "total", "", "Resultado total", grand, sumNullable(grandPrev), rowsBudget));
  return rows;
}

// Escala: solo presentación. Divide el monto; null muestra "-".
export function scaleValue(value: number, scale: EacScale): number {
  return value / scale;
}

export function formatScaled(value: number | null, scale: EacScale): string {
  if (value === null) return "-";
  const text = new Intl.NumberFormat("es-CL", { maximumFractionDigits: 0 }).format(Math.round(scaleValue(value, scale)));
  return text === "-0" ? "0" : text;
}

// ---------------------------------------------------------------------------
// Costos indirectos prorrateados por contrato (A9): líneas de nómina de empleados no directos.
// ---------------------------------------------------------------------------
export type PayrollLike = {
  period: string;
  lines: { employeeId: string; allocations: { contract: string; amount: number }[] }[];
};

export function indirectPayrollCosts(runs: PayrollLike[], directEmployeeIds: ReadonlySet<string>): IndirectCost[] {
  return runs.flatMap((run) => run.lines
    .filter((line) => !directEmployeeIds.has(line.employeeId))
    .flatMap((line) => line.allocations.map((allocation) => ({
      contract: allocation.contract,
      date: cutoffDate(Number(run.period.slice(0, 4)), Number(run.period.slice(5, 7))),
      amount: allocation.amount,
    }))));
}

// ---------------------------------------------------------------------------
// Presupuesto aprobado versionado: cada cambio crea una versión nueva (no se edita la anterior).
// ---------------------------------------------------------------------------
export type BudgetLineInput = { category: string; amount: number };

export function nextBudgetVersions(
  current: ApprovedBudget[],
  contract: string,
  lines: BudgetLineInput[],
  approvedBy: string,
  approvedAt: string,
): ApprovedBudget[] {
  const latest = new Map<string, ApprovedBudget>();
  for (const item of current.filter((entry) => entry.contract === contract)) {
    const known = latest.get(item.category);
    if (!known || item.version > known.version) latest.set(item.category, item);
  }
  return lines
    .filter((line) => Number.isFinite(line.amount) && line.amount >= 0 && latest.get(line.category)?.amount !== line.amount)
    .map((line) => ({
      contract, category: line.category, amount: line.amount,
      version: (latest.get(line.category)?.version ?? 0) + 1, approvedBy, approvedAt,
    }));
}

// ---------------------------------------------------------------------------
// Snapshots por contrato x categoría. Un período cerrado no se recalcula.
// ---------------------------------------------------------------------------
export function snapshotsFromRows(rows: EacRow[], period: string, savedAt: string, closedBy?: string): EacSnapshot[] {
  return rows.filter((row) => row.kind === "category" || row.kind === "outside").map((row) => ({
    contract: row.contract,
    period,
    category: row.kind === "outside" ? "Otros" : row.category,
    real: row.real, etc: row.etc, eac: row.eac, savedAt,
    closed: closedBy !== undefined,
    ...(closedBy !== undefined ? { closedBy } : {}),
  }));
}

export function isPeriodClosed(snapshots: EacSnapshot[], contract: string, period: string): boolean {
  return snapshots.some((item) => item.contract === contract && item.period === period && item.closed);
}

// Reemplaza snapshots del mismo contrato+período+categoría salvo que ya estén cerrados.
export function mergeSnapshots(existing: EacSnapshot[], fresh: EacSnapshot[], onlyIfMissing: boolean): EacSnapshot[] {
  const keyOf = (item: EacSnapshot) => `${item.contract}|${item.period}|${item.category}`;
  const byKey = new Map(existing.map((item): [string, EacSnapshot] => [keyOf(item), item]));
  for (const item of fresh) {
    const key = keyOf(item);
    const known = byKey.get(key);
    if (known && (known.closed || onlyIfMissing)) continue;
    byKey.set(key, item);
  }
  return [...byKey.values()];
}
