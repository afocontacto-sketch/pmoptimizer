import { useCallback, useEffect, useMemo, useState } from "react";
import type { Role } from "../app/roles";
import { keys } from "../data/keys";
import type { StockBin } from "../data/stock";
import { readJson } from "../data/storage";
import { assignableEmployees, readTimeEntries } from "../data/workOrders";
import type { TimeEntry } from "../data/workOrders";
import { getEmployeeHourlyRate, readHrEmployees } from "../modules/HumanResourcesPage";
import { plannedCallRecords, planStorageKey, routeStorageKey, samplePlans, sampleRoutes } from "../modules/maintenanceData";
import type { MaintenancePlan, PlannedCallRecord, RouteTemplate } from "../modules/maintenanceData";
import {
  readContracts,
  readMovements,
  readOrders,
  readStock,
  timedOrders,
  writeMovements,
  writeOrders,
  writeStock,
} from "../modules/operationsData";
import type { StockMovement, TimedOrder, WorkOrder } from "../modules/operationsData";
import { purchaseOrdersStorageKey } from "../modules/supplyData";
import { useStoredValue } from "./useStore";

export type Feedback = { setMessage: (value: string) => void; setError: (value: string) => void };

export function useFeedback() {
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  return { message, error, setMessage, setError };
}

export function readTechnicianProfiles() {
  const profiles = readHrEmployees().filter((employee) => employee.direct).map((employee) => ({
    name: employee.name,
    rate: getEmployeeHourlyRate(employee.name, 0),
    supervisor: "Supervisor",
  }));
  return profiles.length ? profiles : [{ name: "Sin técnico directo", rate: 0, supervisor: "Supervisor" }];
}

// Estado compartido de OT, stock y kardex: se lee de localStorage y se escribe con updateJson (sin useEffect de persistencia).
export function useOperations() {
  const orders = useStoredValue<WorkOrder[]>(keys.workOrders, readOrders);
  const entries = useStoredValue<TimeEntry[]>(keys.timeEntries, readTimeEntries);
  const stock = useStoredValue<StockBin[]>(keys.warehouseBins, readStock, [purchaseOrdersStorageKey]);
  const movements = useStoredValue<StockMovement[]>(keys.warehouseMovements, readMovements);
  const [elapsedNow, setElapsedNow] = useState(Date.now());
  const timerRunning = entries.some((entry) => entry.end === null);

  useEffect(() => {
    if (!timerRunning) return;
    const timerId = window.setInterval(() => setElapsedNow(Date.now()), 1000);
    return () => window.clearInterval(timerId);
  }, [timerRunning]);

  // Tiempo y costo de mano de obra derivados de timeEntries (las entradas abiertas crecen con el reloj).
  const visibleOrders: TimedOrder[] = useMemo(
    () => timedOrders(orders, entries, elapsedNow),
    [orders, entries, elapsedNow],
  );

  // Todas devuelven false si el guardado falló, para que quien orquesta varias escrituras pueda revertir.
  const setOrders = useCallback((fn: (current: WorkOrder[]) => WorkOrder[]): boolean =>
    writeOrders(fn), []);
  const updateOrder = useCallback((orderId: string, update: (order: WorkOrder) => WorkOrder): boolean =>
    setOrders((current) => current.map((order) => order.id === orderId ? update(order) : order)), [setOrders]);
  const setStock = useCallback((fn: (current: StockBin[]) => StockBin[]): boolean => writeStock(fn), []);
  const recordMovement = useCallback((movement: StockMovement): boolean =>
    writeMovements((current) => [movement, ...current]), []);

  return { orders, entries, visibleOrders, nowMs: elapsedNow, stock, movements, setOrders, updateOrder, setStock, recordMovement };
}

// Equipo del supervisor (RRHH) y filtro de OT visibles; para otros roles no restringe.
export function useSupervisorScope(role: Role, user: string) {
  const employees = useMemo(() => readHrEmployees(), []);
  const technicianProfiles = useMemo(() => readTechnicianProfiles(), []);
  const supervisorEmployee = role === "Supervisor"
    ? employees.find((employee) => employee.supervisorLogin === user)
    : undefined;
  const supervisorTeam = supervisorEmployee
    ? employees.filter((employee) => employee.supervisorId === supervisorEmployee.id)
    : [];
  const supervisorContractCodes = supervisorEmployee?.contractCodes?.length
    ? supervisorEmployee.contractCodes
    : supervisorEmployee?.contractCode ? [supervisorEmployee.contractCode] : [];
  const teamContractCodes = new Set([
    ...supervisorContractCodes,
    ...supervisorTeam.flatMap((employee) => employee.contractCodes?.length
      ? employee.contractCodes
      : employee.contractCode ? [employee.contractCode] : []),
  ]);
  const assignableTeam = assignableEmployees(employees, { user, role });
  const supervisorTeamNames = new Set(supervisorTeam.map((employee) => employee.name));
  const supervisorCanSeeOrder = (order: WorkOrder) => role !== "Supervisor" ||
    order.assignees.some((assignee) => supervisorTeamNames.has(assignee.name)) ||
    teamContractCodes.has(order.contract);
  return { employees, technicianProfiles, supervisorEmployee, supervisorTeam, assignableTeam, supervisorCanSeeOrder };
}


// Catálogos de lectura para crear OT: hojas de ruta, planes, llamadas derivadas y contratos.
export function useCatalog() {
  const [routes] = useState<RouteTemplate[]>(() => readJson<RouteTemplate[]>(routeStorageKey, sampleRoutes));
  const [plans] = useState<MaintenancePlan[]>(() => readJson<MaintenancePlan[]>(planStorageKey, samplePlans));
  const [plannedCalls] = useState<PlannedCallRecord[]>(() => plannedCallRecords(plans, routes));
  const contracts = useMemo(() => readContracts(), []);
  return { routes, plans, plannedCalls, contracts };
}
