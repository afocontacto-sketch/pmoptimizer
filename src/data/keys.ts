// Única fuente de claves de localStorage. Prohibido escribir literales "pmoptimizer-" fuera de este archivo.
export const SCHEMA = "v3";
export const APP_PREFIX = "pmoptimizer-";
export const KEY_PREFIX = `${APP_PREFIX}${SCHEMA}-`;
export const schemaKey = `${APP_PREFIX}schema`;

const k = (name: string) => `${KEY_PREFIX}${name}`;

export const keys = {
  session: k("session"),
  clients: k("clients"),
  materialMaster: k("material-master"),
  materialDocuments: k("material-documents"),
  equipment: k("equipment"),
  maintenanceRoutes: k("maintenance-routes"),
  maintenancePlans: k("maintenance-plans"),
  maintenancePlanFields: k("maintenance-plan-fields"),
  workOrders: k("work-orders"),
  timeEntries: k("time-entries"),
  warehouseBins: k("warehouse-bins"),
  warehouseMovements: k("warehouse-movements"),
  transferOrders: k("transfer-orders"),
  purchaseRequests: k("purchase-requests"),
  purchaseOrders: k("purchase-orders"),
  suppliers: k("suppliers"),
  quotations: k("quotations"),
  financeState: k("finance-state"),
  payrollRuns: k("payroll-runs"),
  payrollPayments: k("payroll-payments"),
  hrEmployees: k("hr-employees"),
  hrLeaves: k("hr-leaves"),
  hrContracts: k("hr-contracts"),
  hrDocuments: k("hr-documents"),
  hrCompany: k("hr-company"),
  payrollParams: k("payroll-params"),
  docCounters: k("doc-counters"),
  auditLog: k("audit-log"),
  eacSnapshots: k("eac-snapshots"),
  approvedBudget: k("approved-budget"),
  // Módulos de Copilot sin commit (QualityPage, ClientsPage, ProductionPage); a consolidar luego.
  contractFiles: k("contracts-files"),
  qualityChecklists: k("quality-checklists"),
  qualityMaterials: k("quality-materials"),
  productionOrders: k("production-orders"),
} as const;

// Formato del archivo de respaldo.
export const backupFormat = `${APP_PREFIX}local-data`;
export const backupFilePrefix = `${APP_PREFIX}respaldo`;
