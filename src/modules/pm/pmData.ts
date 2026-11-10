import { keys } from "../../data/keys";
import { indirectPayrollCosts } from "../../data/projectCost";
import type { EacInput, PayrollLike } from "../../data/projectCost";
import { readApprovedBudgets, readEacSnapshots } from "../../data/projectCostStore";
import { readBins, readMovements } from "../../data/stock";
import { readJson } from "../../data/storage";
import { readTimeEntries } from "../../data/workOrders";
import { readFinanceState } from "../financeData";
import { readHrEmployees } from "../HumanResourcesPage";
import { readPlannedCalls, routeStorageKey, sampleRoutes } from "../maintenanceData";
import type { RouteTemplate } from "../maintenanceData";
import { readContracts, readOrders } from "../operationsData";
import { purchaseOrdersStorageKey, purchaseRequestsStorageKey, readStoredList } from "../supplyData";
import type { PurchaseOrder, PurchaseRequest } from "../supplyData";

// Lectura de insumos de PM-07 y de los dashboards PM (la lógica pura vive en data/projectCost.ts).
export type PmData = Omit<EacInput, "year" | "month" | "nowMs" | "contractCodes">;

export function loadPmData(): PmData {
  const directIds = new Set(readHrEmployees().filter((employee) => employee.direct).map((employee) => employee.id));
  const runs = readJson<PayrollLike[]>(keys.payrollRuns, []);
  return {
    contracts: readContracts(),
    orders: readOrders(),
    timeEntries: readTimeEntries(),
    movements: readMovements(),
    invoices: readFinanceState().invoices,
    purchaseOrders: readStoredList<PurchaseOrder>(purchaseOrdersStorageKey),
    requests: readStoredList<PurchaseRequest>(purchaseRequestsStorageKey),
    calls: readPlannedCalls(),
    routes: readJson<RouteTemplate[]>(routeStorageKey, sampleRoutes),
    bins: readBins(),
    indirectPayroll: indirectPayrollCosts(runs, directIds),
    budgets: readApprovedBudgets(),
    snapshots: readEacSnapshots(),
  };
}
