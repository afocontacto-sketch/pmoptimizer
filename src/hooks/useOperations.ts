import { useCallback, useEffect, useMemo, useState } from "react";
import type { Role } from "../app/roles";
import { keys } from "../data/keys";
import type { StockBin } from "../data/stock";
import { readJson } from "../data/storage";
import { getEmployeeHourlyRate, readHrEmployees } from "../modules/HumanResourcesPage";
import { plannedCallRecords, planStorageKey, routeStorageKey, samplePlans, sampleRoutes } from "../modules/maintenanceData";
import type { MaintenancePlan, PlannedCallRecord, RouteTemplate } from "../modules/maintenanceData";
import {
  readContracts,
  readMovements,
  readOrders,
  readStock,
  writeMovements,
  writeOrders,
  writeStock,
} from "../modules/operationsData";
import type { StockMovement, TimedOrder, WorkOrder } from "../modules/operationsData";
import { purchaseOrdersStorageKey } from "../modules/supplyData";
import { useStoredValue } from "./useStore";

const readOrdersNow = () => readOrders(getEmployeeHourlyRate);

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
  const orders = useStoredValue<WorkOrder[]>(keys.workOrders, readOrdersNow);
  const stock = useStoredValue<StockBin[]>(keys.warehouseBins, readStock, [purchaseOrdersStorageKey]);
  const movements = useStoredValue<StockMovement[]>(keys.warehouseMovements, readMovements);
  const [elapsedNow, setElapsedNow] = useState(Date.now());
  const timerRunning = orders.some((order) => order.timerStartedAt !== null);

  useEffect(() => {
    if (!timerRunning) return;
    const timerId = window.setInterval(() => setElapsedNow(Date.now()), 1000);
    return () => window.clearInterval(timerId);
  }, [timerRunning]);

  const visibleOrders: TimedOrder[] = useMemo(() => orders.map((order) => ({
    ...order,
    currentSeconds: order.elapsedSeconds + (
      order.timerStartedAt !== null ? Math.max(0, Math.floor((elapsedNow - order.timerStartedAt) / 1000)) : 0
    ),
  })), [orders, elapsedNow]);

  // Todas devuelven false si el guardado falló, para que quien orquesta varias escrituras pueda revertir.
  const setOrders = useCallback((fn: (current: WorkOrder[]) => WorkOrder[]): boolean =>
    writeOrders(getEmployeeHourlyRate, fn), []);
  const updateOrder = useCallback((orderId: string, update: (order: WorkOrder) => WorkOrder): boolean =>
    setOrders((current) => current.map((order) => order.id === orderId ? update(order) : order)), [setOrders]);
  const setStock = useCallback((fn: (current: StockBin[]) => StockBin[]): boolean => writeStock(fn), []);
  const recordMovement = useCallback((movement: StockMovement): boolean =>
    writeMovements((current) => [movement, ...current]), []);

  return { orders, visibleOrders, stock, movements, setOrders, updateOrder, setStock, recordMovement };
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
  const assignableTeam = supervisorTeam.filter((employee) =>
    employee.direct && technicianProfiles.some((technician) => technician.name === employee.name));
  const supervisorTeamNames = new Set(supervisorTeam.map((employee) => employee.name));
  const supervisorCanSeeOrder = (order: WorkOrder) => role !== "Supervisor" ||
    supervisorTeamNames.has(order.assignees[0]?.name ?? "") ||
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
