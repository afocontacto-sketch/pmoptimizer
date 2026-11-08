import { useEffect, useMemo, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  Divider,
  Grid,
  MenuItem,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import { Add, Download, UploadFile } from "@mui/icons-material";
import { Link } from "react-router-dom";
import {
  maintenanceCallsStorageKey,
  planStorageKey,
  routeStorageKey,
  samplePlans,
  sampleRoutes,
} from "./maintenanceData";
import type {
  CalendarUnit,
  MaintenancePlan,
  MeterUnit,
  RouteTemplate,
  TriggerType,
} from "./maintenanceData";
import { readEquipmentMaster } from "./masterData";

type CustomFieldDefinition = {
  key: string;
  label: string;
};

type PlannedCall = {
  id: string;
  plan: MaintenancePlan;
  dueDate: Date;
  route: RouteTemplate;
};
type ClientContract = { name: string; contractCode: string; wbs: string[] };

const customFieldStorageKey = "pmoptimizer-maintenance-plan-fields";

function readStored<T>(key: string, fallback: T): T {
  const raw = localStorage.getItem(key);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch (error) {
    console.warn(`No se pudo leer la configuración guardada (${key}).`, error);
    return fallback;
  }
}

function makeId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function addCalendarInterval(date: Date, amount: number, unit: CalendarUnit): Date {
  const result = new Date(date);
  if (unit === "days") result.setDate(result.getDate() + amount);
  if (unit === "months") {
    const day = result.getDate();
    result.setDate(1);
    result.setMonth(result.getMonth() + amount);
    const lastDay = new Date(result.getFullYear(), result.getMonth() + 1, 0).getDate();
    result.setDate(Math.min(day, lastDay));
  }
  if (unit === "years") {
    const month = result.getMonth();
    const day = result.getDate();
    result.setFullYear(result.getFullYear() + amount);
    if (result.getMonth() !== month) {
      result.setDate(0);
    } else {
      const lastDay = new Date(result.getFullYear(), month + 1, 0).getDate();
      result.setDate(Math.min(day, lastDay));
    }
  }
  return result;
}

function generateCalls(plan: MaintenancePlan, route: RouteTemplate): PlannedCall[] {
  if (
    !isValidDateOnly(plan.startDate) ||
    !Number.isInteger(plan.horizonMonths) ||
    plan.horizonMonths < 1
  ) return [];
  const start = new Date(`${plan.startDate}T12:00:00`);
  const end = addCalendarInterval(start, plan.horizonMonths, "months");
  const calendarEnabled = plan.triggerType === "calendar" || plan.triggerType === "first";
  const meterEnabled = plan.triggerType !== "calendar";
  if (
    (calendarEnabled && (!Number.isFinite(plan.calendarInterval) || plan.calendarInterval < 1)) ||
    (meterEnabled && (!Number.isFinite(plan.meterInterval) || plan.meterInterval < 1 ||
      !Number.isFinite(plan.averageUsagePerDay) || plan.averageUsagePerDay <= 0))
  ) return [];
  const meterDays = plan.averageUsagePerDay > 0
    ? plan.meterInterval / plan.averageUsagePerDay
    : Number.POSITIVE_INFINITY;
  const lastExecutionMeter = plan.lastExecutionMeter ?? 0;
  const currentMeterReading = plan.currentMeterReading ?? lastExecutionMeter;
  const meterUsedSinceExecution = Math.max(0, currentMeterReading - lastExecutionMeter);
  const meterDaysRemaining = plan.averageUsagePerDay > 0
    ? Math.max(0, plan.meterInterval - meterUsedSinceExecution) / plan.averageUsagePerDay
    : Number.POSITIVE_INFINITY;
  let calendarDue = calendarEnabled
    ? addCalendarInterval(start, plan.calendarInterval, plan.calendarUnit)
    : null;
  let meterDue = meterEnabled && Number.isFinite(meterDays) && Number.isFinite(meterDaysRemaining)
    ? new Date(start.getTime() + meterDaysRemaining * 86400000)
    : null;
  const calls: PlannedCall[] = [];

  while (calls.length < 120) {
    const nextDue = calendarDue && meterDue
      ? (calendarDue <= meterDue ? calendarDue : meterDue)
      : calendarDue ?? meterDue;
    if (!nextDue || nextDue > end) break;
    calls.push({ id: `${plan.id}-${calls.length + 1}`, plan, dueDate: nextDue, route });
    if (calendarEnabled) {
      calendarDue = addCalendarInterval(nextDue, plan.calendarInterval, plan.calendarUnit);
    }
    if (meterEnabled && Number.isFinite(meterDays)) {
      meterDue = new Date(nextDue.getTime() + meterDays * 86400000);
    }
  }
  return calls;
}

function csvEscape(value: string | number): string {
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function downloadCsv(filename: string, headers: string[], rows: (string | number)[][]): void {
  const content = [headers, ...rows].map((row) => row.map(csvEscape).join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob(["\uFEFF", content], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function parseCsvRow(row: string): string[] {
  const values: string[] = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < row.length; index += 1) {
    const char = row[index];
    if (char === '"' && row[index + 1] === '"' && quoted) {
      value += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      values.push(value);
      value = "";
    } else {
      value += char;
    }
  }
  values.push(value);
  return values;
}

function formatClp(value: number): string {
  return new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 }).format(value);
}

function formatDate(value: Date): string {
  return new Intl.DateTimeFormat("es-CL").format(value);
}

function isValidDateOnly(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

const planHeaders = [
  "name", "equipmentId", "contract", "wbs", "routeId", "triggerType", "calendarInterval",
  "calendarUnit", "meterUnit", "meterInterval", "lastExecutionMeter", "currentMeterReading",
  "averageUsagePerDay", "startDate", "horizonMonths",
];
const routeHeaders = [
  "routeId", "routeName", "operationOrder", "operation", "durationHours", "hourlyCost",
  "materialCode", "materialName", "quantity", "unit", "unitCost",
];

export default function MaintenancePlanning({ role = "Administrador" }: { role?: string }) {
  const [routes, setRoutes] = useState<RouteTemplate[]>(() => readStored(routeStorageKey, sampleRoutes));
  const [plans, setPlans] = useState<MaintenancePlan[]>(() => readStored(planStorageKey, samplePlans));
  const equipmentOptions = useMemo(() => {
    const master = readEquipmentMaster();
    const byCode = new Map(master.map((equipment): [string, { code: string; name: string }] => [equipment.code, equipment]));
    for (const plan of plans) {
      if (plan.equipmentId && !byCode.has(plan.equipmentId)) {
        byCode.set(plan.equipmentId, { code: plan.equipmentId, name: "Equipo de plan existente" });
      }
    }
    return [...byCode.values()];
  }, [plans]);
  const [clientContracts] = useState(() => readStored<ClientContract[]>("pmoptimizer-clients", []));
  const [workOrders] = useState(() => readStored<{ plannedCallId?: string; status: string }[]>("pmoptimizer-work-orders", []));
  const [customFieldDefinitions, setCustomFieldDefinitions] = useState<CustomFieldDefinition[]>(
    () => readStored(customFieldStorageKey, []),
  );
  const [customFieldValues, setCustomFieldValues] = useState<Record<string, string>>({});
  const [customFieldName, setCustomFieldName] = useState("");
  const [importMessage, setImportMessage] = useState("");
  const [importError, setImportError] = useState("");
  const [ganttFrom, setGanttFrom] = useState("");
  const [ganttTo, setGanttTo] = useState("");
  const [ganttContract, setGanttContract] = useState("");
  const [ganttYear, setGanttYear] = useState("");
  const [newPlan, setNewPlan] = useState({
    name: "",
    equipmentId: "",
    contract: "",
    wbs: "",
    routeId: routes[0]?.id ?? "",
    triggerType: "calendar" as TriggerType,
    calendarInterval: "3",
    calendarUnit: "months" as CalendarUnit,
    meterUnit: "kilometers" as MeterUnit,
    meterInterval: "10000",
    lastExecutionMeter: "0",
    currentMeterReading: "0",
    averageUsagePerDay: "120",
    startDate: new Date().toISOString().slice(0, 10),
    horizonMonths: "12",
  });

  const routeById = useMemo(
    () => new Map<string, RouteTemplate>(routes.map((route): [string, RouteTemplate] => [route.id, route])),
    [routes],
  );
  const plannedCalls = useMemo(
    () => plans.flatMap((plan) => {
      const route = routeById.get(plan.routeId);
      return route ? generateCalls(plan, route) : [];
    }).sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime()),
    [plans, routeById],
  );
  useEffect(() => {
    localStorage.setItem(maintenanceCallsStorageKey, JSON.stringify(plannedCalls.map((call) => ({
      id: call.id,
      plan: call.plan,
      routeId: call.route.id,
      dueDate: call.dueDate.toISOString(),
    }))));
  }, [plannedCalls]);
  const projectedHours = plannedCalls.reduce(
    (sum, call) => sum + call.route.operations.reduce((total, operation) => total + operation.durationHours, 0),
    0,
  );
  const projectedCost = plannedCalls.reduce((sum, call) => sum + call.route.operations.reduce(
    (routeTotal, operation) => routeTotal
      + operation.durationHours * operation.hourlyCost
      + operation.materials.reduce((materialsTotal, material) => materialsTotal + material.quantity * material.unitCost, 0),
    0,
  ), 0);
  const monthlyForecast = useMemo(() => {
    const periods = new Map<string, { calls: number; hours: number; cost: number }>();
    for (const call of plannedCalls) {
      const period = call.dueDate.toISOString().slice(0, 7);
      const totals = periods.get(period) ?? { calls: 0, hours: 0, cost: 0 };
      totals.calls += 1;
      for (const operation of call.route.operations) {
        totals.hours += operation.durationHours;
        totals.cost += operation.durationHours * operation.hourlyCost;
        totals.cost += operation.materials.reduce((sum, material) => sum + material.quantity * material.unitCost, 0);
      }
      periods.set(period, totals);
    }
    return [...periods.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [plannedCalls]);
  const materialNeeds = useMemo(() => {
    const needs = new Map<string, {
      code: string;
      name: string;
      unit: string;
      quantity: number;
      date: string;
    }>();
    for (const call of plannedCalls) {
      const date = call.dueDate.toISOString().slice(0, 10);
      for (const operation of call.route.operations) {
        for (const material of operation.materials) {
          const key = `${material.code}|${date}`;
          const item = needs.get(key) ?? {
            code: material.code,
            name: material.name,
            unit: material.unit,
            quantity: 0,
            date,
          };
          item.quantity += material.quantity;
          needs.set(key, item);
        }
      }
    }
    return [...needs.values()].sort((a, b) => a.date.localeCompare(b.date) || a.code.localeCompare(b.code));
  }, [plannedCalls]);
  const availableContracts = [...new Set(plannedCalls.map((call) => call.plan.contract).filter(Boolean))].sort();
  const contractOptions = [...new Set([
    "CT1234",
    ...clientContracts.map((contract) => contract.contractCode),
    ...plans.map((plan) => plan.contract),
  ].filter(Boolean))].sort();
  const getContractWbs = (contractCode: string) => {
    const configured = clientContracts.find((item) => item.contractCode === contractCode)?.wbs ?? [];
    return contractCode === "CT1234"
      ? [...new Set([...configured, "CT1234-CL-B2N4-PRE", "CT1234-CL-B2N4-OVH", "CT1234-CL-B2N4-COR", "CT1234-CL-B2N4-REP", "CT1234-CL-B2N4-IND"])]
      : configured;
  };
  const availableYears = [...new Set(plannedCalls.map((call) => String(call.dueDate.getFullYear())))].sort();
  const filteredCalls = plannedCalls.filter((call) => {
    const date = call.dueDate.toISOString().slice(0, 10);
    return (!ganttFrom || date >= ganttFrom) &&
      (!ganttTo || date <= ganttTo) &&
      (!ganttContract || call.plan.contract === ganttContract) &&
      (!ganttYear || String(call.dueDate.getFullYear()) === ganttYear);
  });
  const pmGanttTotals = useMemo(() => {
    const totals = new Map<string, { contract: string; year: string; month: string; calls: number; hours: number; cost: number }>();
    for (const call of filteredCalls) {
      const month = call.dueDate.toISOString().slice(0, 7);
      const year = month.slice(0, 4);
      const contract = call.plan.contract || "Sin contrato";
      const key = `${contract}|${year}|${month}`;
      const value = totals.get(key) ?? { contract, year, month, calls: 0, hours: 0, cost: 0 };
      value.calls += 1;
      for (const operation of call.route.operations) {
        value.hours += operation.durationHours;
        value.cost += operation.durationHours * operation.hourlyCost +
          operation.materials.reduce((sum, material) => sum + material.quantity * material.unitCost, 0);
      }
      totals.set(key, value);
    }
    return [...totals.values()].sort((a, b) => a.contract.localeCompare(b.contract) || a.month.localeCompare(b.month));
  }, [filteredCalls]);
  const pmAnnualTotals = useMemo(() => {
    const totals = new Map<string, { contract: string; year: string; calls: number; hours: number; cost: number }>();
    for (const item of pmGanttTotals) {
      const key = `${item.contract}|${item.year}`;
      const current = totals.get(key) ?? { contract: item.contract, year: item.year, calls: 0, hours: 0, cost: 0 };
      current.calls += item.calls;
      current.hours += item.hours;
      current.cost += item.cost;
      totals.set(key, current);
    }
    return [...totals.values()];
  }, [pmGanttTotals]);

  useEffect(() => {
    localStorage.setItem(routeStorageKey, JSON.stringify(routes));
  }, [routes]);

  useEffect(() => {
    localStorage.setItem(planStorageKey, JSON.stringify(plans));
  }, [plans]);

  const savePlans = (next: MaintenancePlan[]) => {
    setPlans(next);
    localStorage.setItem(planStorageKey, JSON.stringify(next));
  };

  const saveRoutes = (next: RouteTemplate[]) => {
    setRoutes(next);
    localStorage.setItem(routeStorageKey, JSON.stringify(next));
  };

  const handleCreatePlan = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const calendarInterval = Number(newPlan.calendarInterval);
    const meterInterval = Number(newPlan.meterInterval);
    const lastExecutionMeter = Number(newPlan.lastExecutionMeter);
    const currentMeterReading = Number(newPlan.currentMeterReading);
    const averageUsagePerDay = Number(newPlan.averageUsagePerDay);
    const horizonMonths = Number(newPlan.horizonMonths);
    if (
      !newPlan.name.trim() ||
      !newPlan.equipmentId.trim() ||
      !newPlan.routeId ||
      !isValidDateOnly(newPlan.startDate) ||
      !Number.isInteger(horizonMonths) ||
      horizonMonths < 1 ||
      ((newPlan.triggerType === "calendar" || newPlan.triggerType === "first") &&
        (!Number.isFinite(calendarInterval) || calendarInterval < 1)) ||
      (newPlan.triggerType !== "calendar" &&
        (!Number.isFinite(meterInterval) || meterInterval < 1 ||
          !Number.isFinite(lastExecutionMeter) || lastExecutionMeter < 0 ||
          !Number.isFinite(currentMeterReading) || currentMeterReading < lastExecutionMeter ||
          !Number.isFinite(averageUsagePerDay) || averageUsagePerDay <= 0))
    ) {
      setImportError("Completa equipo, plan, hoja de ruta e intervalos válidos. El uso promedio diario debe ser mayor que cero.");
      return;
    }
    const plan: MaintenancePlan = {
      ...newPlan,
      id: makeId("PL"),
      name: newPlan.name.trim(),
      equipmentId: newPlan.equipmentId.trim(),
      contract: newPlan.contract.trim(),
      wbs: newPlan.wbs.trim(),
      calendarInterval,
      meterInterval,
      lastExecutionMeter,
      currentMeterReading,
      averageUsagePerDay,
      horizonMonths,
      customFields: { ...customFieldValues },
    };
    savePlans([...plans, plan]);
    setNewPlan((current) => ({ ...current, name: "", equipmentId: "", contract: "", wbs: "" }));
    setCustomFieldValues({});
    setImportError("");
    setImportMessage("Plan creado y llamadas futuras recalculadas.");
  };

  const handlePlanImport = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (role !== "Administrador") {
      setImportError("Solo el Administrador puede realizar cargas masivas.");
      setImportMessage("");
      return;
    }
    try {
      const lines = (await file.text()).replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => line.trim());
      if (lines.length < 2) throw new Error("El archivo no contiene filas para importar.");
      const headers = parseCsvRow(lines[0]).map((value) => value.trim());
      const index = (name: string) => headers.indexOf(name);
      for (const required of planHeaders) {
        if (index(required) < 0) throw new Error(`Falta la columna requerida: ${required}.`);
      }
      const imported: MaintenancePlan[] = [];
      for (const [rowNumber, line] of lines.slice(1).entries()) {
        const values = parseCsvRow(line);
        const get = (name: string) => values[index(name)]?.trim() ?? "";
        const triggerType = get("triggerType") as TriggerType;
        const calendarUnit = get("calendarUnit") as CalendarUnit;
        const meterUnit = get("meterUnit") as MeterUnit;
        const numbers = ["calendarInterval", "meterInterval", "lastExecutionMeter", "currentMeterReading", "averageUsagePerDay", "horizonMonths"]
          .map((field) => Number(get(field)));
        const routeId = get("routeId");
        const isCalendar = triggerType === "calendar" || triggerType === "first";
        const isMeter = triggerType !== "calendar";
        if (
          !get("name") || !get("equipmentId") || !routeById.has(routeId) ||
          !["calendar", "kilometers", "hours", "first"].includes(triggerType) ||
          !["days", "months", "years"].includes(calendarUnit) ||
          !["kilometers", "hours"].includes(meterUnit) ||
          !isValidDateOnly(get("startDate")) || numbers.some((number) => !Number.isFinite(number)) ||
          (isCalendar && numbers[0] < 1) ||
          (isMeter && (numbers[1] < 1 || numbers[2] < 0 || numbers[3] < numbers[2] || numbers[4] <= 0)) ||
          (triggerType === "kilometers" && meterUnit !== "kilometers") ||
          (triggerType === "hours" && meterUnit !== "hours") ||
          !Number.isInteger(numbers[5]) || numbers[5] < 1
        ) {
          throw new Error(`Fila ${rowNumber + 2}: datos incompletos o inválidos (revisa también routeId).`);
        }
        imported.push({
          id: makeId("PL"),
          name: get("name"),
          equipmentId: get("equipmentId"),
          contract: get("contract"),
          wbs: get("wbs"),
          routeId,
          triggerType,
          calendarInterval: numbers[0],
          calendarUnit,
          meterUnit,
          meterInterval: numbers[1],
          lastExecutionMeter: numbers[2],
          currentMeterReading: numbers[3],
          averageUsagePerDay: numbers[4],
          startDate: get("startDate"),
          horizonMonths: numbers[5],
          customFields: Object.fromEntries(
            headers
              .filter((header) => header.startsWith("custom:"))
              .map((header) => [header.slice("custom:".length), get(header)]),
          ),
        });
      }
      if (!imported.length) throw new Error("No se encontraron planes válidos.");
      savePlans([...plans, ...imported]);
      setImportError("");
      setImportMessage(`Importación correcta: ${imported.length} plan(es).`);
    } catch (error) {
      setImportError(error instanceof Error ? error.message : "No se pudo procesar el archivo CSV.");
      setImportMessage("");
    }
  };

  const handleRouteImport = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (role !== "Administrador") {
      setImportError("Solo el Administrador puede realizar cargas masivas.");
      setImportMessage("");
      return;
    }
    try {
      const lines = (await file.text()).replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => line.trim());
      if (lines.length < 2) throw new Error("El archivo no contiene filas para importar.");
      const headers = parseCsvRow(lines[0]).map((value) => value.trim());
      const index = (name: string) => headers.indexOf(name);
      for (const required of routeHeaders) {
        if (index(required) < 0) throw new Error(`Falta la columna requerida: ${required}.`);
      }
      const groups = new Map<string, RouteTemplate>();
      for (const [rowNumber, line] of lines.slice(1).entries()) {
        const values = parseCsvRow(line);
        const get = (name: string) => values[index(name)]?.trim() ?? "";
        const id = get("routeId");
        const name = get("routeName");
        const order = Number(get("operationOrder"));
        const operationName = get("operation");
        const durationHours = Number(get("durationHours"));
        const hourlyCost = Number(get("hourlyCost"));
        const materialCode = get("materialCode");
        const materialName = get("materialName");
        const quantity = Number(get("quantity"));
        const unit = get("unit");
        const unitCost = Number(get("unitCost"));
        if (
          !id || !name || !Number.isInteger(order) || order < 1 || !operationName ||
          !Number.isFinite(durationHours) || durationHours <= 0 ||
          !Number.isFinite(hourlyCost) || hourlyCost < 0 ||
          ((materialCode || materialName) && (
            !materialCode || !materialName || !Number.isFinite(quantity) || quantity <= 0 ||
            !unit || !Number.isFinite(unitCost) || unitCost < 0
          ))
        ) {
          throw new Error(`Fila ${rowNumber + 2}: datos de hoja de ruta incompletos o inválidos.`);
        }
        let route = groups.get(id);
        if (!route) {
          route = { id, name, operations: [] };
          groups.set(id, route);
        } else if (route.name !== name) {
          throw new Error(`Fila ${rowNumber + 2}: un routeId no puede tener varios nombres.`);
        }
        let operation = route.operations.find((item) => item.name === operationName);
        if (!operation) {
          operation = { order, name: operationName, durationHours, hourlyCost, materials: [] };
          route.operations.push(operation);
        } else if (operation.order !== order || operation.durationHours !== durationHours || operation.hourlyCost !== hourlyCost) {
          throw new Error(`Fila ${rowNumber + 2}: una operación repetida tiene orden o costos distintos.`);
        }
        if (materialCode && materialName) {
          operation.materials.push({ code: materialCode, name: materialName, quantity, unit, unitCost });
        }
      }
      if (!groups.size) throw new Error("No se encontraron hojas de ruta válidas.");
      saveRoutes([
        ...routes.filter((route) => !groups.has(route.id)),
        ...[...groups.values()].map((route) => ({
          ...route,
          operations: route.operations.sort((a, b) => a.order - b.order),
        })),
      ]);
      setImportError("");
      setImportMessage(`Importación correcta: ${groups.size} hoja(s) de ruta. Los planes se actualizaron automáticamente.`);
    } catch (error) {
      setImportError(error instanceof Error ? error.message : "No se pudo procesar el archivo CSV.");
      setImportMessage("");
    }
  };

  const addCustomField = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const label = customFieldName.trim();
    const keyBase = label.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
    if (!keyBase) {
      setImportError("Escribe un nombre válido para el campo personalizable.");
      return;
    }
    if (customFieldDefinitions.some((field) => field.label.toLowerCase() === label.toLowerCase())) {
      setImportError("Ya existe un campo con ese nombre.");
      return;
    }
    const definition = { key: `${keyBase}_${Date.now().toString(36)}`, label };
    const next = [...customFieldDefinitions, definition];
    setCustomFieldDefinitions(next);
    localStorage.setItem(customFieldStorageKey, JSON.stringify(next));
    setCustomFieldName("");
    setImportError("");
    setImportMessage("Campo personalizable agregado.");
  };

  const removeCustomField = (key: string) => {
    const next = customFieldDefinitions.filter((field) => field.key !== key);
    setCustomFieldDefinitions(next);
    localStorage.setItem(customFieldStorageKey, JSON.stringify(next));
    setCustomFieldValues((current) => {
      const { [key]: removed, ...remaining } = current;
      void removed;
      return remaining;
    });
  };

  const updatePlanForm = (field: keyof typeof newPlan, value: string) => {
    setNewPlan((current) => {
      switch (field) {
        case "name": return { ...current, name: value };
        case "equipmentId": return { ...current, equipmentId: value };
        case "contract": return { ...current, contract: value };
        case "wbs": return { ...current, wbs: value };
        case "routeId": return { ...current, routeId: value };
        case "triggerType":
          if (value === "calendar" || value === "kilometers" || value === "hours" || value === "first") {
            return {
              ...current,
              triggerType: value,
              meterUnit: value === "hours" ? "hours" : value === "kilometers" ? "kilometers" : current.meterUnit,
            };
          }
          return current;
        case "calendarInterval": return { ...current, calendarInterval: value };
        case "calendarUnit":
          if (value === "days" || value === "months" || value === "years") {
            return { ...current, calendarUnit: value };
          }
          return current;
        case "meterUnit":
          if (value === "hours" || value === "kilometers") return { ...current, meterUnit: value };
          return current;
        case "meterInterval": return { ...current, meterInterval: value };
        case "lastExecutionMeter": return { ...current, lastExecutionMeter: value };
        case "currentMeterReading": return { ...current, currentMeterReading: value };
        case "averageUsagePerDay": return { ...current, averageUsagePerDay: value };
        case "startDate": return { ...current, startDate: value };
        case "horizonMonths": return { ...current, horizonMonths: value };
        default: return current;
      }
    });
  };

  const draftRoute = routeById.get(newPlan.routeId);
  const ganttMonths = useMemo(() => {
    if (filteredCalls.length === 0) return [];
    const dates = filteredCalls.map((call) => call.dueDate.getTime());
    const first = new Date(Math.min(...dates));
    first.setDate(1);
    const last = new Date(Math.max(...dates));
    last.setDate(1);
    const months: string[] = [];
    while (first <= last && months.length < 60) {
      months.push(first.toISOString().slice(0, 7));
      first.setMonth(first.getMonth() + 1);
    }
    return months;
  }, [filteredCalls]);
  const ganttStart = ganttMonths.length ? new Date(`${ganttMonths[0]}-01T00:00:00`) : null;
  const ganttEnd = ganttMonths.length ? new Date(`${ganttMonths[ganttMonths.length - 1]}-01T00:00:00`) : null;
  if (ganttEnd) ganttEnd.setMonth(ganttEnd.getMonth() + 1);
  const ganttSpan = ganttStart && ganttEnd ? Math.max(1, ganttEnd.getTime() - ganttStart.getTime()) : 1;

  return (
    <Stack spacing={3}>
      <Box>
        <Typography variant="h4" sx={{ fontWeight: 700 }}>Planning · planes de mantenimiento</Typography>
        <Typography color="text.secondary">
          Configura ciclos por equipo y proyecta llamadas, materiales, horas y costos. Equivale de forma simplificada a planes IP y hojas de ruta de SAP PM.
        </Typography>
        {role !== "PM Proyecto" && <Button component={Link} to="/supply" variant="outlined" sx={{ mt: 2 }}>Consultar Supply · MRP por material</Button>}
      </Box>

      <Alert severity="info">
        Esta proyección usa el promedio de uso diario indicado y costos de referencia de la hoja de ruta; no reemplaza lecturas reales ni contabilización.
      </Alert>
      {importError && <Alert severity="error">{importError}</Alert>}
      {importMessage && <Alert severity="success">{importMessage}</Alert>}

      <Paper sx={{ p: 3 }}>
        <Typography variant="h6" sx={{ mb: 2 }}>Planning · carta Gantt de mantenimiento</Typography>
        <Grid container spacing={2} sx={{ mb: 2 }}>
          <Grid size={{ xs: 12, sm: 6, md: 3 }}><TextField label="Desde" type="date" value={ganttFrom} onChange={(event) => setGanttFrom(event.target.value)} slotProps={{ inputLabel: { shrink: true } }} fullWidth /></Grid>
          <Grid size={{ xs: 12, sm: 6, md: 3 }}><TextField label="Hasta" type="date" value={ganttTo} onChange={(event) => setGanttTo(event.target.value)} slotProps={{ inputLabel: { shrink: true } }} fullWidth /></Grid>
          <Grid size={{ xs: 12, sm: 6, md: 3 }}><TextField select label="Contrato" value={ganttContract} onChange={(event) => setGanttContract(event.target.value)} fullWidth><MenuItem value="">Todos</MenuItem>{availableContracts.map((contract) => <MenuItem key={contract} value={contract}>{contract}</MenuItem>)}</TextField></Grid>
          <Grid size={{ xs: 12, sm: 6, md: 3 }}><TextField select label="Año" value={ganttYear} onChange={(event) => setGanttYear(event.target.value)} fullWidth><MenuItem value="">Todos</MenuItem>{availableYears.map((year) => <MenuItem key={year} value={year}>{year}</MenuItem>)}</TextField></Grid>
        </Grid>
        {filteredCalls.length === 0 ? (
          <Typography color="text.secondary">Al crear planes y sus llamadas aparecerán aquí por fecha.</Typography>
        ) : role === "PM Proyecto" ? (
          <Stack spacing={3}>
            <Box><Typography variant="subtitle1" sx={{ mb: 1 }}>Totales mensuales</Typography>
              <Table size="small">
                <TableHead><TableRow><TableCell>Contrato</TableCell><TableCell>Año</TableCell><TableCell>Mes</TableCell><TableCell align="right">Llamadas</TableCell><TableCell align="right">Horas</TableCell><TableCell align="right">Costo proyectado</TableCell></TableRow></TableHead>
                <TableBody>{pmGanttTotals.map((item) => <TableRow key={`${item.contract}-${item.month}`}><TableCell>{item.contract}</TableCell><TableCell>{item.year}</TableCell><TableCell>{new Intl.DateTimeFormat("es-CL", { month: "long" }).format(new Date(`${item.month}-15T12:00:00`))}</TableCell><TableCell align="right">{item.calls}</TableCell><TableCell align="right">{item.hours.toFixed(1)} h</TableCell><TableCell align="right">{formatClp(item.cost)}</TableCell></TableRow>)}</TableBody>
              </Table>
            </Box>
            <Box><Typography variant="subtitle1" sx={{ mb: 1 }}>Totales anuales</Typography>
              <Table size="small">
                <TableHead><TableRow><TableCell>Contrato</TableCell><TableCell>Año</TableCell><TableCell align="right">Llamadas</TableCell><TableCell align="right">Horas</TableCell><TableCell align="right">Costo proyectado</TableCell></TableRow></TableHead>
                <TableBody>{pmAnnualTotals.map((item) => <TableRow key={`${item.contract}-${item.year}`}><TableCell>{item.contract}</TableCell><TableCell>{item.year}</TableCell><TableCell align="right">{item.calls}</TableCell><TableCell align="right">{item.hours.toFixed(1)} h</TableCell><TableCell align="right">{formatClp(item.cost)}</TableCell></TableRow>)}</TableBody>
              </Table>
            </Box>
          </Stack>
        ) : (
          <Box sx={{ overflowX: "auto" }}>
            <Box sx={{ minWidth: Math.max(760, 260 + ganttMonths.length * 116) }}>
              <Stack direction="row" sx={{ mb: 1 }}>
                <Box sx={{ width: 260, flexShrink: 0 }}><Typography variant="caption" color="text.secondary">Plan / equipo</Typography></Box>
                <Box sx={{ flex: 1, display: "grid", gridTemplateColumns: `repeat(${ganttMonths.length}, minmax(116px, 1fr))` }}>
                  {ganttMonths.map((month) => (
                    <Box key={month} sx={{ px: 1, borderLeft: "1px solid", borderColor: "divider" }}>
                      <Typography variant="caption">{new Intl.DateTimeFormat("es-CL", { month: "short", year: "numeric" }).format(new Date(`${month}-15T12:00:00`))}</Typography>
                    </Box>
                  ))}
                </Box>
              </Stack>
              {filteredCalls.map((call) => {
                const left = Math.max(0, ((call.dueDate.getTime() - (ganttStart?.getTime() ?? 0)) / ganttSpan) * 100);
                const durationHours = call.route.operations.reduce((sum, item) => sum + item.durationHours, 0);
                const width = Math.min(12, Math.max(1.5, durationHours / 8 * 86400000 / ganttSpan * 100));
                return (
                  <Stack key={call.id} direction="row" sx={{ minHeight: 40, alignItems: "center", borderTop: "1px solid", borderColor: "divider" }}>
                    <Box sx={{ width: 260, flexShrink: 0, pr: 1 }}>
                      <Typography variant="caption" sx={{ display: "block", fontWeight: 700 }}>{call.plan.name}</Typography>
                      <Typography variant="caption" color="text.secondary">{call.plan.equipmentId} · {formatDate(call.dueDate)}</Typography>
                      <Typography variant="caption" sx={{ display: "block" }} color={workOrders.find((order) => order.plannedCallId === call.id)?.status === "Cerrada" ? "success.main" : "text.secondary"}>
                        OT: {workOrders.find((order) => order.plannedCallId === call.id)?.status ?? "Pendiente"}
                      </Typography>
                    </Box>
                    <Box sx={{
                      flex: 1,
                      height: 28,
                      position: "relative",
                      backgroundImage: `linear-gradient(to right, transparent calc(100% - 1px), #e2e8f0 calc(100% - 1px))`,
                      backgroundSize: `${100 / Math.max(1, ganttMonths.length)}% 100%`,
                    }}>
                      <Box title={`${call.id} · ${durationHours.toFixed(1)} h`} sx={{
                        position: "absolute",
                        top: 5,
                        left: `${left}%`,
                        width: `${width}%`,
                        minWidth: 18,
                        height: 18,
                        borderRadius: 1,
                        backgroundColor: "primary.main",
                      }} />
                    </Box>
                  </Stack>
                );
              })}
            </Box>
          </Box>
        )}
      </Paper>

      {role !== "PM Proyecto" && (
        <>
      <Grid container spacing={2}>
        {[
          { label: "Llamadas proyectadas", value: String(plannedCalls.length) },
          { label: "Horas de ruta", value: `${projectedHours.toFixed(1)} h` },
          { label: "Costo proyectado", value: formatClp(projectedCost) },
          { label: "Necesidades materiales", value: String(materialNeeds.length) },
        ].map((item) => (
          <Grid size={{ xs: 12, sm: 6, md: 3 }} key={item.label}>
            <Paper sx={{ p: 2, height: "100%" }}>
              <Typography variant="body2" color="text.secondary">{item.label}</Typography>
              <Typography variant="h5" sx={{ mt: 1, fontWeight: 700 }}>{item.value}</Typography>
            </Paper>
          </Grid>
        ))}
      </Grid>

      <Paper sx={{ p: 3 }}>
        <Typography variant="h6" sx={{ mb: 2 }}>Forecast mensual de mantenimiento</Typography>
        {monthlyForecast.length === 0 ? (
          <Typography color="text.secondary">No hay costos proyectados para este horizonte.</Typography>
        ) : (
          <Table size="small">
            <TableHead><TableRow><TableCell>Período</TableCell><TableCell align="right">Llamadas</TableCell><TableCell align="right">Horas estimadas</TableCell><TableCell align="right">Costo estimado</TableCell></TableRow></TableHead>
            <TableBody>{monthlyForecast.map(([period, totals]) => (
              <TableRow key={period}>
                <TableCell>{new Intl.DateTimeFormat("es-CL", { month: "long", year: "numeric" }).format(new Date(`${period}-15T12:00:00`))}</TableCell>
                <TableCell align="right">{totals.calls}</TableCell>
                <TableCell align="right">{totals.hours.toFixed(1)} h</TableCell>
                <TableCell align="right">{formatClp(totals.cost)}</TableCell>
              </TableRow>
            ))}</TableBody>
          </Table>
        )}
      </Paper>

      <Paper sx={{ p: 3 }}>
        <Stack spacing={2}>
          <Typography variant="h6">Crear plan y asociar hoja de ruta</Typography>
          <Stack component="form" onSubmit={handleCreatePlan} spacing={2}>
            <Grid container spacing={2}>
              <Grid size={{ xs: 12, md: 4 }}>
                <TextField label="Nombre del plan" value={newPlan.name} onChange={(event) => updatePlanForm("name", event.target.value)} required fullWidth />
              </Grid>
              <Grid size={{ xs: 12, md: 4 }}>
                <TextField select label="Equipo / activo (maestro)" value={newPlan.equipmentId} onChange={(event) => {
                  const selectedEquipment = readEquipmentMaster().find((item) => item.code === event.target.value);
                  setNewPlan((current) => ({
                    ...current,
                    equipmentId: event.target.value,
                    contract: selectedEquipment?.contractCode && clientContracts.some((contract) => contract.contractCode === selectedEquipment.contractCode)
                      ? selectedEquipment.contractCode
                      : current.contract,
                    wbs: "",
                  }));
                }} required fullWidth>
                  {equipmentOptions.map((equipment) => {
                    const masterEquipment = readEquipmentMaster().find((item) => item.code === equipment.code);
                    return <MenuItem key={equipment.code} value={equipment.code}>
                      {equipment.code}{masterEquipment?.serialNumber ? ` · Serie ${masterEquipment.serialNumber}` : ""} · {equipment.name}{masterEquipment?.contractCode ? ` · ${masterEquipment.contractCode}` : ""}
                    </MenuItem>;
                  })}
                </TextField>
              </Grid>
              <Grid size={{ xs: 12, md: 4 }}>
                <TextField select label="Hoja de ruta" value={newPlan.routeId} onChange={(event) => updatePlanForm("routeId", event.target.value)} required fullWidth>
                  {routes.map((route) => <MenuItem key={route.id} value={route.id}>{route.id} · {route.name}</MenuItem>)}
                </TextField>
              </Grid>
              <Grid size={{ xs: 12, md: 3 }}>
                <TextField select label="Contrato" value={newPlan.contract} onChange={(event) => {
                  const contract = event.target.value;
                  setNewPlan((current) => ({ ...current, contract, wbs: getContractWbs(contract)[0] ?? "" }));
                }} fullWidth>
                  <MenuItem value="">Sin contrato</MenuItem>
                  {contractOptions.map((contractCode) => <MenuItem key={contractCode} value={contractCode}>{contractCode} · {clientContracts.find((item) => item.contractCode === contractCode)?.name ?? "Contrato"}</MenuItem>)}
                </TextField>
              </Grid>
              <Grid size={{ xs: 12, md: 5 }}>
                <TextField select label="Elemento WBS" value={newPlan.wbs} onChange={(event) => updatePlanForm("wbs", event.target.value)} fullWidth>
                  <MenuItem value="">Sin WBS</MenuItem>
                  {getContractWbs(newPlan.contract).map((wbs) => <MenuItem key={wbs} value={wbs}>{wbs}</MenuItem>)}
                </TextField>
              </Grid>
              <Grid size={{ xs: 12, md: 4 }}>
                <TextField select label="Disparador" value={newPlan.triggerType} onChange={(event) => updatePlanForm("triggerType", event.target.value)} fullWidth>
                  <MenuItem value="calendar">Por calendario</MenuItem>
                  <MenuItem value="kilometers">Por kilometraje</MenuItem>
                  <MenuItem value="hours">Por horas de operación</MenuItem>
                  <MenuItem value="first">Primera condición (calendario o medidor)</MenuItem>
                </TextField>
              </Grid>
              {(newPlan.triggerType === "calendar" || newPlan.triggerType === "first") && (
                <>
                  <Grid size={{ xs: 12, md: 3 }}>
                    <TextField label="Cada" type="number" slotProps={{ htmlInput: { min: 1 } }} value={newPlan.calendarInterval} onChange={(event) => updatePlanForm("calendarInterval", event.target.value)} required fullWidth />
                  </Grid>
                  <Grid size={{ xs: 12, md: 3 }}>
                    <TextField select label="Unidad de tiempo" value={newPlan.calendarUnit} onChange={(event) => updatePlanForm("calendarUnit", event.target.value)} fullWidth>
                      <MenuItem value="days">Días</MenuItem>
                      <MenuItem value="months">Meses</MenuItem>
                      <MenuItem value="years">Años</MenuItem>
                    </TextField>
                  </Grid>
                </>
              )}
              {newPlan.triggerType !== "calendar" && (
                <>
                  <Grid size={{ xs: 12, md: 3 }}>
                    <TextField label={`Cada ${newPlan.meterUnit === "hours" ? "horas" : "km"}`} type="number" slotProps={{ htmlInput: { min: 1 } }} value={newPlan.meterInterval} onChange={(event) => updatePlanForm("meterInterval", event.target.value)} required fullWidth />
                  </Grid>
                  {newPlan.triggerType === "first" && (
                    <Grid size={{ xs: 12, md: 3 }}>
                      <TextField select label="Tipo de medidor" value={newPlan.meterUnit} onChange={(event) => updatePlanForm("meterUnit", event.target.value)} fullWidth>
                        <MenuItem value="kilometers">Kilómetros</MenuItem>
                        <MenuItem value="hours">Horas de operación</MenuItem>
                      </TextField>
                    </Grid>
                  )}
                  <Grid size={{ xs: 12, md: 3 }}>
                    <TextField label={`Uso promedio diario (${newPlan.meterUnit === "hours" ? "h" : "km"})`} type="number" slotProps={{ htmlInput: { min: 0.1, step: 0.1 } }} value={newPlan.averageUsagePerDay} onChange={(event) => updatePlanForm("averageUsagePerDay", event.target.value)} required fullWidth />
                  </Grid>
                  <Grid size={{ xs: 12, md: 3 }}>
                    <TextField label={`Lectura en última ejecución (${newPlan.meterUnit === "hours" ? "h" : "km"})`} type="number" slotProps={{ htmlInput: { min: 0 } }} value={newPlan.lastExecutionMeter} onChange={(event) => updatePlanForm("lastExecutionMeter", event.target.value)} required fullWidth />
                  </Grid>
                  <Grid size={{ xs: 12, md: 3 }}>
                    <TextField label={`Lectura actual (${newPlan.meterUnit === "hours" ? "h" : "km"})`} type="number" slotProps={{ htmlInput: { min: 0 } }} value={newPlan.currentMeterReading} onChange={(event) => updatePlanForm("currentMeterReading", event.target.value)} required fullWidth />
                  </Grid>
                </>
              )}
              <Grid size={{ xs: 12, md: 3 }}>
                <TextField label="Inicio de proyección" type="date" value={newPlan.startDate} onChange={(event) => updatePlanForm("startDate", event.target.value)} slotProps={{ inputLabel: { shrink: true } }} required fullWidth />
              </Grid>
              <Grid size={{ xs: 12, md: 3 }}>
                <TextField label="Horizonte (meses)" type="number" slotProps={{ htmlInput: { min: 1, max: 120 } }} value={newPlan.horizonMonths} onChange={(event) => updatePlanForm("horizonMonths", event.target.value)} required fullWidth />
              </Grid>
              {customFieldDefinitions.map((field) => (
                <Grid size={{ xs: 12, md: 4 }} key={field.key}>
                  <TextField
                    label={field.label}
                    value={customFieldValues[field.key] ?? ""}
                    onChange={(event) => setCustomFieldValues((current) => ({ ...current, [field.key]: event.target.value }))}
                    fullWidth
                  />
                </Grid>
              ))}
            </Grid>
            {draftRoute && (
              <Alert severity="success">
                Hoja seleccionada: <strong>{draftRoute.name}</strong> · {draftRoute.operations.length} operaciones ·{" "}
                {draftRoute.operations.reduce((total, operation) => total + operation.durationHours, 0).toFixed(1)} h estimadas ·{" "}
                {new Set(draftRoute.operations.flatMap((operation) => operation.materials.map((material) => material.code))).size} materiales distintos.
              </Alert>
            )}
            <Box><Button type="submit" variant="contained" startIcon={<Add />}>Guardar plan</Button></Box>
          </Stack>
        </Stack>
      </Paper>

      <Paper sx={{ p: 3 }}>
        <Stack spacing={2}>
          <Box>
            <Typography variant="h6">Campos personalizables del plan</Typography>
            <Typography variant="body2" color="text.secondary">
              Agrega datos propios de la empresa; también se incluyen como columnas custom en la plantilla CSV.
            </Typography>
          </Box>
          <Stack component="form" direction={{ xs: "column", sm: "row" }} spacing={1} onSubmit={addCustomField}>
            <TextField label="Nombre del nuevo campo" value={customFieldName} onChange={(event) => setCustomFieldName(event.target.value)} size="small" />
            <Button type="submit" variant="outlined" startIcon={<Add />}>Agregar campo</Button>
          </Stack>
          <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap" }}>
            {customFieldDefinitions.map((field) => (
              <Chip key={field.key} label={field.label} onDelete={() => removeCustomField(field.key)} />
            ))}
            {customFieldDefinitions.length === 0 && <Typography variant="caption" color="text.secondary">Sin campos adicionales configurados.</Typography>}
          </Stack>
        </Stack>
      </Paper>

      <Paper sx={{ p: 3 }}>
        <Stack direction={{ xs: "column", md: "row" }} sx={{ justifyContent: "space-between", alignItems: { xs: "flex-start", md: "center" }, gap: 2, mb: 2 }}>
          <Box>
            <Typography variant="h6">Carga masiva y plantillas</Typography>
            <Typography variant="body2" color="text.secondary">CSV editable en Excel; respeta los encabezados de la plantilla.</Typography>
          </Box>
          <Stack direction={{ xs: "column", sm: "row" }} spacing={1} sx={{ flexWrap: "wrap" }}>
            <Button startIcon={<Download />} onClick={() => downloadCsv("plantilla_planes_mantenimiento.csv", [
              ...planHeaders,
              ...customFieldDefinitions.map((field) => `custom:${field.key}`),
            ], [[
                  "PM-001", "VEH-001", "CT1234", "CT1234-CL-B2N4-PRE", routes[0]?.id ?? "HR-VEH-001",
                  "first", 3, "months", "kilometers", 10000, 0, 0, 120, new Date().toISOString().slice(0, 10), 12,
                  ...customFieldDefinitions.map(() => ""),
            ]])}>Plantilla planes</Button>
            <Button startIcon={<Download />} onClick={() => downloadCsv("plantilla_hojas_de_ruta.csv", routeHeaders, [[
              "HR-001", "Preventivo vehículo", 10, "Inspección de rodamiento", 2, 18000, "MAT-422", "Rodamiento SKF 6205", 1, "unidad", 7800,
            ]])}>Plantilla rutas</Button>
            {role === "Administrador" && <>
              <Button component="label" startIcon={<UploadFile />}>
                Importar planes
                <input hidden type="file" accept=".csv,text/csv" onChange={handlePlanImport} />
              </Button>
              <Button component="label" startIcon={<UploadFile />}>
                Importar rutas
                <input hidden type="file" accept=".csv,text/csv" onChange={handleRouteImport} />
              </Button>
            </>}
          </Stack>
        </Stack>
        <Alert severity="warning" sx={{ mt: 1 }}>
          Las cargas masivas CSV están habilitadas solo para el Administrador. Los archivos cargan planes u hojas de ruta según su plantilla.
        </Alert>
      </Paper>

      <Paper sx={{ p: 3 }}>
        <Typography variant="h6" sx={{ mb: 2 }}>Planes por equipo</Typography>
        {plans.length === 0 ? (
          <Typography color="text.secondary">Aún no hay planes. Crea uno o importa una plantilla.</Typography>
        ) : (
          <Table size="small">
            <TableHead><TableRow>
              <TableCell>Plan / equipo</TableCell><TableCell>Disparador</TableCell><TableCell>Contrato / WBS</TableCell><TableCell>Hoja de ruta</TableCell><TableCell align="right">Llamadas</TableCell><TableCell />
            </TableRow></TableHead>
            <TableBody>{plans.map((plan) => {
              const route = routeById.get(plan.routeId);
              const calls = route ? generateCalls(plan, route) : [];
              const trigger = plan.triggerType === "calendar"
                ? `Cada ${plan.calendarInterval} ${plan.calendarUnit}`
                : plan.triggerType === "first"
                  ? `Primero: ${plan.calendarInterval} ${plan.calendarUnit} o ${plan.meterInterval} ${plan.meterUnit === "hours" ? "h" : "km"}`
                  : `Cada ${plan.meterInterval} ${plan.meterUnit === "hours" ? "h" : "km"}`;
              return (
                <TableRow key={plan.id}>
                  <TableCell>
                    <Typography sx={{ fontWeight: 700 }}>{plan.name}</Typography>
                    <Typography variant="caption" color="text.secondary">{plan.equipmentId}</Typography>
                    {customFieldDefinitions.filter((field) => plan.customFields?.[field.key]).map((field) => (
                      <Typography key={field.key} sx={{ display: "block" }} variant="caption" color="text.secondary">
                        {field.label}: {plan.customFields?.[field.key]}
                      </Typography>
                    ))}
                  </TableCell>
                  <TableCell>{trigger}</TableCell>
                  <TableCell>{plan.contract || "—"}<Typography sx={{ display: "block" }} variant="caption" color="text.secondary">{plan.wbs || "Sin WBS"}</Typography></TableCell>
                  <TableCell>{route?.name ?? plan.routeId}</TableCell>
                  <TableCell align="right"><Chip size="small" label={calls.length} color="primary" /></TableCell>
                  <TableCell><Button size="small" color="error" onClick={() => savePlans(plans.filter((item) => item.id !== plan.id))}>Eliminar</Button></TableCell>
                </TableRow>
              );
            })}</TableBody>
          </Table>
        )}
      </Paper>

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, lg: 7 }}>
          <Paper sx={{ p: 3, height: "100%" }}>
            <Typography variant="h6" sx={{ mb: 2 }}>Llamadas futuras · demanda de Supply</Typography>
            {plannedCalls.length === 0 ? (
              <Typography color="text.secondary">No hay llamadas en el horizonte seleccionado.</Typography>
            ) : (
              <Table size="small">
                <TableHead><TableRow><TableCell>Fecha</TableCell><TableCell>Equipo / contrato</TableCell><TableCell>Plan / WBS</TableCell><TableCell>Horas</TableCell></TableRow></TableHead>
                <TableBody>{plannedCalls.slice(0, 50).map((call) => (
                  <TableRow key={call.id}>
                    <TableCell>{formatDate(call.dueDate)}</TableCell>
                    <TableCell>{call.plan.equipmentId}<Typography sx={{ display: "block" }} variant="caption" color="text.secondary">{call.plan.contract || "Sin contrato"}</Typography></TableCell>
                    <TableCell>{call.plan.name}<Typography sx={{ display: "block" }} variant="caption" color="text.secondary">{call.plan.wbs || "Sin WBS"}</Typography></TableCell>
                    <TableCell>{call.route.operations.reduce((sum, operation) => sum + operation.durationHours, 0).toFixed(1)} h</TableCell>
                  </TableRow>
                ))}</TableBody>
              </Table>
            )}
            {plannedCalls.length > 50 && <Typography variant="caption">Se muestran las primeras 50 de {plannedCalls.length} llamadas.</Typography>}
          </Paper>
        </Grid>
        <Grid size={{ xs: 12, lg: 5 }}>
          <Paper sx={{ p: 3, height: "100%" }}>
            <Typography variant="h6" sx={{ mb: 2 }}>Demanda de materiales de llamadas</Typography>
            {materialNeeds.length === 0 ? (
              <Typography color="text.secondary">Sin necesidades proyectadas.</Typography>
            ) : (
              <Table size="small">
                <TableHead><TableRow><TableCell>Material</TableCell><TableCell align="right">Cantidad requerida</TableCell><TableCell>Fecha de necesidad</TableCell></TableRow></TableHead>
                <TableBody>{materialNeeds.map((item) => (
                  <TableRow key={`${item.code}-${item.date}`}>
                    <TableCell>{item.name}<Typography sx={{ display: "block" }} variant="caption" color="text.secondary">{item.code}</Typography></TableCell>
                    <TableCell align="right">{item.quantity} {item.unit}</TableCell>
                    <TableCell>{formatDate(new Date(`${item.date}T12:00:00`))}</TableCell>
                  </TableRow>
                ))}</TableBody>
              </Table>
            )}
            <Divider sx={{ my: 2 }} />
            <Typography variant="body2">Forecast de referencia (materiales + horas): <strong>{formatClp(projectedCost)}</strong></Typography>
            <Typography variant="caption" color="text.secondary">Supply calcula stock disponible por fecha. El costo real del material se confirma al consumirlo en la OT.</Typography>
          </Paper>
        </Grid>
      </Grid>

      <Paper sx={{ p: 3 }}>
        <Typography variant="h6" sx={{ mb: 2 }}>Hojas de ruta disponibles</Typography>
        <Grid container spacing={2}>
          {routes.map((route) => (
            <Grid size={{ xs: 12, md: 6 }} key={route.id}>
              <Paper variant="outlined" sx={{ p: 2, height: "100%" }}>
                <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "flex-start", gap: 1 }}>
                  <Box><Typography sx={{ fontWeight: 700 }}>{route.name}</Typography><Typography variant="caption" color="text.secondary">{route.id}</Typography></Box>
                  <Chip size="small" label={`${route.operations.length} operaciones`} />
                </Stack>
                <Stack spacing={1} sx={{ mt: 2 }}>
                  {[...route.operations].sort((a, b) => a.order - b.order).map((operation, index) => (
                    <Box key={`${route.id}-${operation.name}`}>
                      <Typography variant="body2">{index + 1}. {operation.name} · {operation.durationHours} h</Typography>
                      <Typography variant="caption" color="text.secondary">
                        {operation.materials.map((material) => `${material.quantity} ${material.unit} ${material.name}`).join(" · ")}
                      </Typography>
                    </Box>
                  ))}
                </Stack>
              </Paper>
            </Grid>
          ))}
        </Grid>
      </Paper>
        </>
      )}
    </Stack>
  );
}
