import { keys } from "../data/keys";
import { nextDocNumber, orderTypeSeries } from "../data/docNumbering";
import { useEffect, useMemo, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControlLabel,
  Grid,
  MenuItem,
  Paper,
  Stack,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Tabs,
  TextField,
  Typography,
} from "@mui/material";
import { Add, Download, PlayArrow, Stop } from "@mui/icons-material";
import {
  maintenanceCallsStorageKey,
  planStorageKey,
  routeStorageKey,
  samplePlans,
  sampleRoutes,
} from "./maintenanceData";
import type {
  MaintenancePlan,
  RouteOperation,
  RouteTemplate,
} from "./maintenanceData";
import {
  purchaseOrdersStorageKey,
  readStoredList,
} from "./supplyData";
import type { PurchaseOrder } from "./supplyData";
import { getEmployeeHourlyRate, readHrEmployees } from "./HumanResourcesPage";
import { readEquipmentMaster } from "./masterData";

type OrderType = "PRE" | "OVH" | "COR" | "REP" | "ESPERA";
type OrderStatus = "Asignada" | "En ejecución" | "Cierre provisorio" | "Cerrada";
type StockStatus = "Libre utilización" | "Bloqueado calidad" | "En tránsito";
type RoleName = "Administrador" | "Supervisor" | "Planificador" | "PM Proyecto" | "Compras" | "Contabilidad" | "Producción" | "Industrial" | "Ingeniería" | "Calidad";

type WbsElement = {
  code: string;
  type: OrderType;
  description: string;
  budget: number;
};

type Contract = {
  code: string;
  customer: string;
  description: string;
  wbs: WbsElement[];
};

type OrderMaterial = {
  code: string;
  quantity: number;
  unitCost?: number;
  name?: string;
  unit?: string;
};
type ReservedPick = { binId: string; code: string; quantity: number };
type StockMovementType =
  | "Recepción OC"
  | "Reserva picking"
  | "Liberación picking"
  | "Liberación de calidad"
  | "Ubicación"
  | "Consumo OT"
  | "Ajuste inventario"
  | "Traslado";

type StockMovement = {
  id: string;
  date: string;
  type: StockMovementType;
  code: string;
  quantity: number;
  from: string;
  to: string;
  reference: string;
  user: string;
};

type StatusChangeRecord = {
  date: string;
  previousStatus: OrderStatus;
  newStatus: OrderStatus;
  user: string;
  reason?: string;
};

type WorkOrder = {
  id: string;
  contract: string;
  wbs: string;
  planId?: string;
  plannedCallId?: string;
  routeId?: string;
  routeName?: string;
  routeOperations?: RouteOperation[];
  type: OrderType;
  equipment: string;
  description: string;
  technician: string;
  hourlyRate: number;
  projectedHours: number;
  projectedLaborCost?: number;
  elapsedSeconds: number;
  timerStartedAt: number | null;
  status: OrderStatus;
  requiredMaterials: OrderMaterial[];
  consumedMaterials: OrderMaterial[];
  reservedPicks?: ReservedPick[];
  qualityChecklist?: Record<string, boolean>;
  qualityApproved?: boolean;
  qualityApprovedBy?: string | null;
  supervisorClosedBy: string | null;
  closedAt?: string;
  closedBy?: string;
  statusHistory?: StatusChangeRecord[];
};

type StockBin = {
  id: string;
  code: string;
  name: string;
  warehouse: string;
  location: string;
  status: StockStatus;
  quantity: number;
  reserved: number;
  unit: string;
  unitCost: number;
  reference?: string;
};

type StockBinGroup = StockBin & {
  sourceBins: StockBin[];
};

type PlannedCallRecord = {
  id: string;
  plan: MaintenancePlan;
  routeId: string;
  dueDate: string;
};

const demoContracts: Contract[] = [{
  code: "CT1234",
  customer: "Fiat Chile",
  description: "Contrato ficticio de mantenimiento de flota",
  wbs: [
    { code: "CT1234-CL-B2N4-PRE", type: "PRE", description: "Mantenimiento preventivo", budget: 2500000 },
    { code: "CT1234-CL-B2N4-OVH", type: "OVH", description: "Overhaul", budget: 8000000 },
    { code: "CT1234-CL-B2N4-COR", type: "COR", description: "Correctivo", budget: 3500000 },
    { code: "CT1234-CL-B2N4-REP", type: "REP", description: "Reparaciones", budget: 2000000 },
    { code: "CT1234-CL-B2N4-IND", type: "ESPERA", description: "Tiempo improductivo", budget: 0 },
  ],
}];

function readContracts(): Contract[] {
  const savedClients = readStoredList<{ name: string; contractCode?: string; wbs?: string[] }>(keys.clients);
  const configured: Contract[] = savedClients.flatMap((client) => {
    if (!client.contractCode) return [];
    const wbs = (client.wbs ?? []).map((code) => {
      const suffix = code.split("-").pop()?.toUpperCase();
      const type: OrderType = suffix === "OVH" || suffix === "COR" || suffix === "REP" || suffix === "ESPERA"
        ? suffix
        : "PRE";
      return { code, type, description: `${client.contractCode} · ${type}`, budget: 0 };
    });
    return [{
      code: client.contractCode,
      customer: client.name,
      description: `Contrato de servicio de ${client.name}`,
      wbs,
    }];
  });
  return [...new Map<string, Contract>(
    [...demoContracts, ...configured].map((contract): [string, Contract] => [contract.code, contract]),
  ).values()];
}

function readTechnicianProfiles() {
  const profiles = readHrEmployees().filter((employee) => employee.direct).map((employee) => ({
    name: employee.name,
    rate: getEmployeeHourlyRate(employee.name, 0),
    supervisor: "Supervisor",
  }));
  return profiles.length ? profiles : [{ name: "Sin técnico directo", rate: 0, supervisor: "Supervisor" }];
}

const initialOrders: WorkOrder[] = [
  {
    id: "OT-2048",
    contract: "CT1234",
    wbs: "CT1234-CL-B2N4-PRE",
    type: "PRE",
    equipment: "VEH-001 · Camioneta Fiat Ducato",
    description: "Preventivo de 10.000 km · originada por plan PM-VEH-001",
    planId: "PL-VEH-001",
    routeId: "HR-VEH-001",
    routeName: "Mantención preventiva vehículo",
    routeOperations: sampleRoutes[0].operations,
    technician: "Camila Rojas",
    hourlyRate: 18000,
    projectedHours: 3.5,
    elapsedSeconds: 0,
    timerStartedAt: null,
    status: "Asignada",
    requiredMaterials: [{ code: "MAT-114", quantity: 1 }, { code: "MAT-422", quantity: 1 }],
    consumedMaterials: [],
    reservedPicks: [],
    qualityChecklist: {},
    qualityApproved: false,
    qualityApprovedBy: null,
    supervisorClosedBy: null,
  },
  {
    id: "OT-2049",
    contract: "CT1234",
    wbs: "CT1234-CL-B2N4-COR",
    type: "COR",
    equipment: "VEH-002 · Fiat Fiorino",
    description: "Reparación sistema de frenos",
    technician: "Diego Muñoz",
    hourlyRate: 20500,
    projectedHours: 5,
    elapsedSeconds: 8100,
    timerStartedAt: null,
    status: "Cierre provisorio",
    requiredMaterials: [{ code: "MAT-422", quantity: 2 }],
    consumedMaterials: [{ code: "MAT-422", quantity: 1 }],
    reservedPicks: [],
    qualityChecklist: {},
    qualityApproved: false,
    qualityApprovedBy: null,
    supervisorClosedBy: null,
  },
  {
    id: "OT-2050",
    contract: "CT1234",
    wbs: "CT1234-CL-B2N4-OVH",
    type: "OVH",
    equipment: "VEH-003 · Fiat Ducato",
    description: "Overhaul de conjunto de transmisión",
    technician: "Camila Rojas",
    hourlyRate: 18000,
    projectedHours: 16,
    elapsedSeconds: 0,
    timerStartedAt: null,
    status: "Asignada",
    requiredMaterials: [{ code: "MAT-301", quantity: 1 }],
    consumedMaterials: [],
    reservedPicks: [],
    qualityChecklist: {},
    qualityApproved: false,
    qualityApprovedBy: null,
    supervisorClosedBy: null,
  },
  {
    id: "OT-ESPERA-01",
    contract: "CT1234",
    wbs: "CT1234-CL-B2N4-IND",
    type: "ESPERA",
    equipment: "Centro de trabajo · Taller",
    description: "Orden de espera para registrar tiempo no productivo",
    technician: "Camila Rojas",
    hourlyRate: 18000,
    projectedHours: 0,
    elapsedSeconds: 0,
    timerStartedAt: null,
    status: "Asignada",
    requiredMaterials: [],
    consumedMaterials: [],
    reservedPicks: [],
    qualityChecklist: {},
    qualityApproved: false,
    qualityApprovedBy: null,
    supervisorClosedBy: null,
  },
];

const initialStock: StockBin[] = [
  { id: "BIN-01", code: "MAT-114", name: "Cinta aislante 3M", warehouse: "Bodega Central", location: "A-01-02", status: "Libre utilización", quantity: 9, reserved: 0, unit: "rollo", unitCost: 3500 },
  { id: "BIN-02", code: "MAT-114", name: "Cinta aislante 3M", warehouse: "Bodega Central", location: "A-02-01", status: "Bloqueado calidad", quantity: 5, reserved: 0, unit: "rollo", unitCost: 3500 },
  { id: "BIN-03", code: "MAT-114", name: "Cinta aislante 3M", warehouse: "Recepciones", location: "TRANSITO", status: "En tránsito", quantity: 12, reserved: 0, unit: "rollo", unitCost: 3500, reference: "OC-4501" },
  { id: "BIN-04", code: "MAT-422", name: "Rodamiento SKF 6205", warehouse: "Bodega Central", location: "B-01-01", status: "Libre utilización", quantity: 42, reserved: 0, unit: "unidad", unitCost: 7800 },
  { id: "BIN-05", code: "MAT-301", name: "Motor eléctrico 7.5HP", warehouse: "Bodega Central", location: "C-01-03", status: "Libre utilización", quantity: 18, reserved: 0, unit: "unidad", unitCost: 285000 },
  { id: "BIN-06", code: "MAT-422", name: "Rodamiento SKF 6205", warehouse: "Bodega Taller", location: "B-02-01", status: "Libre utilización", quantity: 12, reserved: 0, unit: "unidad", unitCost: 7800 },
  { id: "BIN-07", code: "MAT-422", name: "Rodamiento SKF 6205", warehouse: "Recepciones", location: "TRANSITO", status: "En tránsito", quantity: 8, reserved: 0, unit: "unidad", unitCost: 7800, reference: "OC-4502" },
];

const ordersStorageKey = keys.workOrders;
const stockStorageKey = keys.warehouseBins;
const stockMovementStorageKey = keys.warehouseMovements;
const typeLabels: Record<OrderType, string> = {
  PRE: "Preventivo",
  OVH: "Overhaul",
  COR: "Correctivo",
  REP: "Reparaciones",
  ESPERA: "Espera / no productiva",
};
const qualityCheckItems = [
  "Trabajo ejecutado según hoja de ruta",
  "Materiales utilizados corresponden a la OT",
  "Prueba funcional satisfactoria",
  "Evidencia fotográfica o documental revisada",
];

function readList<T>(key: string, fallback: T[]): T[] {
  const raw = localStorage.getItem(key);
  if (!raw) return fallback;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed as T[];
    console.warn(`Los datos locales de ${key} no tienen formato de lista; se usarán los datos demo.`);
  } catch (error) {
    console.warn(`No se pudieron leer los datos locales de ${key}; se usarán los datos demo.`, error);
  }
  return fallback;
}

function addApprovedPurchaseOrdersToTransit(bins: StockBin[]): StockBin[] {
  const result = [...bins];
  for (const order of readStoredList<PurchaseOrder>(purchaseOrdersStorageKey)) {
    if (order.status !== "Aprobada") continue;
    const remaining = Math.max(0, order.quantity - (order.receivedQuantity ?? 0));
    if (remaining === 0 || result.some((bin) => bin.reference === order.id && bin.code === order.materialCode)) continue;
    result.push({
      id: `BIN-TRANSIT-${order.id}`,
      code: order.materialCode,
      name: order.materialName,
      warehouse: "Recepciones",
      location: "TRANSITO",
      status: "En tránsito",
      quantity: remaining,
      reserved: 0,
      unit: order.unit,
      unitCost: order.unitCost,
      reference: order.id,
    });
  }
  return result;
}

function money(value: number): string {
  return new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 }).format(value);
}

function durationLabel(seconds: number): string {
  const totalMinutes = Math.floor(seconds / 60);
  return `${Math.floor(totalMinutes / 60)} h ${String(totalMinutes % 60).padStart(2, "0")} min`;
}

function materialsForRoute(route: RouteTemplate): OrderMaterial[] {
  const grouped = new Map<string, OrderMaterial>();
  for (const operation of route.operations) {
    for (const material of operation.materials) {
      const current = grouped.get(material.code);
      if (!current) {
        grouped.set(material.code, {
          code: material.code,
          name: material.name,
          quantity: material.quantity,
          unit: material.unit,
          unitCost: material.unitCost,
        });
        continue;
      }
      const totalQuantity = current.quantity + material.quantity;
      current.unitCost = ((current.unitCost ?? 0) * current.quantity + material.unitCost * material.quantity)
        / totalQuantity;
      current.quantity = totalQuantity;
    }
  }
  return [...grouped.values()];
}

function routeLaborCost(route: RouteTemplate): number {
  return route.operations.reduce((sum, operation) => sum + operation.durationHours * operation.hourlyCost, 0);
}

function plannedLaborCost(order: WorkOrder): number {
  return order.projectedLaborCost ?? order.projectedHours * order.hourlyRate;
}

function plannedMaterialCost(item: OrderMaterial, fallbackUnitCost: number): number {
  return item.quantity * (item.unitCost ?? fallbackUnitCost);
}

function csvCell(value: string | number): string {
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function parseCsvRow(row: string): string[] {
  const values: string[] = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < row.length; index += 1) {
    const character = row[index];
    if (character === '"' && row[index + 1] === '"' && quoted) {
      value += '"';
      index += 1;
    } else if (character === '"') {
      quoted = !quoted;
    } else if (character === "," && !quoted) {
      values.push(value);
      value = "";
    } else {
      value += character;
    }
  }
  if (quoted) throw new Error("Hay una comilla sin cerrar en el archivo CSV.");
  values.push(value);
  return values;
}

function makeMovement(
  type: StockMovementType,
  code: string,
  quantity: number,
  from: string,
  to: string,
  reference: string,
  user: string,
): StockMovement {
  return {
    id: `MOV-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    date: new Date().toISOString(),
    type,
    code,
    quantity,
    from,
    to,
    reference,
    user,
  };
}

function isPickableLocation(location: string): boolean {
  return !["REC-UBICAR", "REC-CALIDAD", "TRANSITO"].includes(location.toUpperCase());
}

function aggregateStockBins(bins: StockBin[]): StockBinGroup[] {
  const grouped = new Map<string, StockBinGroup>();
  for (const bin of bins) {
    const key = [bin.code, bin.warehouse, bin.location, bin.status, bin.unit].join("|");
    const current = grouped.get(key);
    if (!current) {
      grouped.set(key, { ...bin, sourceBins: [bin] });
      continue;
    }
    const priorQuantity = current.quantity;
    const totalQuantity = priorQuantity + bin.quantity;
    current.unitCost = totalQuantity > 0
      ? (current.unitCost * priorQuantity + bin.unitCost * bin.quantity) / totalQuantity
      : current.unitCost;
    current.quantity = totalQuantity;
    current.reserved += bin.reserved;
    current.sourceBins.push(bin);
  }
  return [...grouped.values()];
}

function downloadTemplate(filename: string, headers: string[], sample: (string | number)[]): void {
  downloadCsvRows(filename, headers, [sample]);
}

function downloadCsvRows(filename: string, headers: (string | number)[], rows: (string | number)[][]): void {
  const csv = [headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function allocatedCost(order: WorkOrder, stock: StockBin[], elapsedSeconds = order.elapsedSeconds): number {
  const materialCost = order.consumedMaterials.reduce((sum, item) => {
    const weightedBins = stock.filter((candidate) => candidate.code === item.code && candidate.quantity > 0);
    const totalQuantity = weightedBins.reduce((total, bin) => total + bin.quantity, 0);
    const averageCost = weightedBins.reduce((total, bin) => total + bin.quantity * bin.unitCost, 0)
      / Math.max(1, totalQuantity);
    return sum + item.quantity * (item.unitCost ?? averageCost);
  }, 0);
  return elapsedSeconds / 3600 * order.hourlyRate + materialCost;
}

function OrderStatusChip({ status }: { status: OrderStatus }) {
  const color = status === "Cerrada" ? "success" : status === "Cierre provisorio" ? "warning" : status === "En ejecución" ? "info" : "default";
  return <Chip size="small" label={status} color={color} />;
}

export default function WorkOrders({
  user,
  role,
  defaultTab = 0,
  scope = "operations",
}: {
  user: string;
  role: RoleName;
  defaultTab?: number;
  scope?: "operations" | "warehouse" | "quality" | "team";
}) {
  const [orders, setOrders] = useState<WorkOrder[]>(() =>
    readList<WorkOrder>(ordersStorageKey, initialOrders).map((order) =>
      order.type === "ESPERA" && !order.wbs
        ? { ...order, wbs: "CT1234-CL-B2N4-IND" }
        : order,
    ),
  );
  const [routes] = useState<RouteTemplate[]>(() =>
    readList<RouteTemplate>(routeStorageKey, sampleRoutes),
  );
  const [plans] = useState<MaintenancePlan[]>(() =>
    readList<MaintenancePlan>(planStorageKey, samplePlans),
  );
  const [plannedCalls] = useState<PlannedCallRecord[]>(() =>
    readList<PlannedCallRecord>(maintenanceCallsStorageKey, []),
  );
  const [stock, setStock] = useState<StockBin[]>(() =>
    addApprovedPurchaseOrdersToTransit(readList<StockBin>(stockStorageKey, initialStock)).map((bin) =>
      bin.status === "En tránsito"
        ? {
          ...bin,
          warehouse: "Recepciones",
          location: "TRANSITO",
          reference: bin.reference ?? (bin.code === "MAT-114" ? "OC-4501" : "OC-4502"),
        }
        : bin,
    ),
  );
  const [movements, setMovements] = useState<StockMovement[]>(() =>
    readList<StockMovement>(stockMovementStorageKey, []),
  );
  const [tab, setTab] = useState(defaultTab);
  const [selectedWarehouseOrderId, setSelectedWarehouseOrderId] = useState("");
  const [selectedQualityOrderId, setSelectedQualityOrderId] = useState("");
  const [pickingTaken, setPickingTaken] = useState<Record<string, string>>({});
  const [elapsedNow, setElapsedNow] = useState(Date.now());
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [receipt, setReceipt] = useState({ code: "MAT-114", purchaseOrder: "OC-4501", quantity: "1", qualityHold: true });
  const [stockFilter, setStockFilter] = useState("");
  const [putawayLocations, setPutawayLocations] = useState<Record<string, string>>({});
  const [cycleCount, setCycleCount] = useState({ binId: "", countedQuantity: "" });
  const [transfer, setTransfer] = useState({ binId: "", quantity: "1", warehouse: "Bodega Taller", location: "A-01-01", toQuality: false });
  const [warehouseImportMessage, setWarehouseImportMessage] = useState("");
  const [warehouseImportError, setWarehouseImportError] = useState("");
  const [assignmentDrafts, setAssignmentDrafts] = useState<Record<string, string>>({});
  const [operationsTab, setOperationsTab] = useState(0);
  const [reopenModalOpen, setReopenModalOpen] = useState(false);
  const [reopenOrderId, setReopenOrderId] = useState("");
  const [reopenReason, setReopenReason] = useState("");
  const contracts = useMemo(readContracts, []);
  const employees = useMemo(readHrEmployees, []);
  const equipmentOptions = useMemo(() => {
    const masterEquipment = readEquipmentMaster();
    const allValues = [
      ...masterEquipment.map((item) => item.code),
      ...plans.map((plan) => plan.equipmentId),
      ...orders.map((order) => order.equipment),
    ];
    return [...new Set(allValues.filter(Boolean))].map((value) => ({
      value,
      label: (() => {
        const equipment = masterEquipment.find((item) => item.code === value);
        return equipment
          ? `${value}${equipment.serialNumber ? ` · Serie ${equipment.serialNumber}` : ""} · ${equipment.name}${equipment.contractCode ? ` · ${equipment.contractCode}` : ""}`
          : value;
      })(),
    }));
  }, [orders, plans]);
  const technicianProfiles = useMemo(readTechnicianProfiles, []);
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
    supervisorTeamNames.has(order.technician) ||
    teamContractCodes.has(order.contract);
  const [newOrder, setNewOrder] = useState({
    type: "PRE" as OrderType,
    contract: contracts[0].code,
    planId: "",
    routeId: routes[0]?.id ?? "",
    equipment: "",
    description: "",
    technician: technicianProfiles[0].name,
  });

  const isSupervisor = role === "Supervisor";
  const canCloseOrders = role === "Administrador";
  const canOperate = ["Administrador", "Producción", "Industrial", "Ingeniería"].includes(role);
  const canInspect = role === "Administrador" || role === "Calidad";
  const canReceive = role === "Administrador" || role === "Compras";
  const canPutaway = ["Administrador", "Compras", "Producción", "Industrial"].includes(role);
  const canCount = ["Administrador", "Compras", "Producción", "Industrial"].includes(role);
  const canChangePicking = ["Administrador", "Producción", "Industrial"].includes(role);
  const currentContract = contracts.find((contract) => contract.code === newOrder.contract) ?? contracts[0];
  const selectedRoute = routes.find((route) => route.id === newOrder.routeId);
  const selectedPlan = plans.find((plan) => plan.id === newOrder.planId);
  const availableOrders = orders.filter((order) =>
    order.type !== "ESPERA" && order.status !== "Cerrada" && supervisorCanSeeOrder(order));
  const qualityOrders = orders.filter((order) => order.type !== "ESPERA" && order.status !== "Cerrada");
  const selectedQualityOrder = qualityOrders.find((order) => order.id === selectedQualityOrderId) ?? qualityOrders[0];
  const activeOrder = orders.find((order) => order.timerStartedAt !== null && supervisorCanSeeOrder(order));
  const visibleOrders = orders.map((order) => ({
    ...order,
    currentSeconds: order.elapsedSeconds + (
      order.timerStartedAt !== null ? Math.max(0, Math.floor((elapsedNow - order.timerStartedAt) / 1000)) : 0
    ),
  }));
  
  const activeWorkOrders = visibleOrders.filter((order) => order.status !== "Cerrada" && supervisorCanSeeOrder(order));
  const closedWorkOrders = visibleOrders.filter((order) => order.status === "Cerrada" && (isSupervisor || role === "Administrador"));
  
  const totalsByWbs = currentContract.wbs.map((element) => {
    const linked = visibleOrders.filter((order) => order.wbs === element.code);
    const actual = linked.reduce((sum, order) => sum + allocatedCost(order, stock, order.currentSeconds), 0);
    const committed = linked.filter((order) => order.status !== "Cerrada").reduce((sum, order) => {
      const required = order.requiredMaterials.reduce((materialSum, item) => {
        const alreadyConsumed = order.consumedMaterials.find((consumed) => consumed.code === item.code)?.quantity ?? 0;
        const unitCost = item.unitCost ?? averageUnitCost(item.code);
        return materialSum + Math.max(0, item.quantity - alreadyConsumed) * unitCost;
      }, 0);
      const actualHours = order.currentSeconds / 3600;
      const remainingHours = Math.max(0, order.projectedHours - actualHours);
      const remainingLabor = order.projectedHours > 0
        ? plannedLaborCost(order) * remainingHours / order.projectedHours
        : 0;
      return sum + required + remainingLabor;
    }, 0);
    const projected = linked.reduce((sum, order) => sum + plannedLaborCost(order) +
      order.requiredMaterials.reduce((materialSum, item) =>
        materialSum + plannedMaterialCost(item, averageUnitCost(item.code)), 0), 0);
    return { element, actual, committed, projected, linked: linked.length };
  });
  const transitLines = stock.filter((bin) => bin.status === "En tránsito" && bin.quantity > 0);
  const selectedTransitLine = transitLines.find((bin) =>
    bin.reference === receipt.purchaseOrder && bin.code === receipt.code,
  ) ?? transitLines[0];
  const physicalBins = stock.filter((bin) => bin.status !== "En tránsito");
  const pendingPutawayBins = stock.filter((bin) =>
    bin.status === "Libre utilización" && bin.location === "REC-UBICAR",
  );
  const countableBins = physicalBins;
  const transferableBins = stock.filter((bin) =>
    bin.status === "Libre utilización" && isPickableLocation(bin.location) && bin.quantity > bin.reserved,
  );
  const stockSearch = stockFilter.trim().toLowerCase();
  const visibleStock = aggregateStockBins(stock).filter((bin) =>
    !stockSearch ||
    `${bin.code} ${bin.name} ${bin.warehouse} ${bin.location} ${bin.status}`.toLowerCase().includes(stockSearch) ||
    bin.sourceBins.some((sourceBin) => (sourceBin.reference ?? "").toLowerCase().includes(stockSearch)),
  );
  const supervisorAvailableStock = aggregateStockBins(stock.filter((bin) => {
    const availableQuantity = bin.quantity - bin.reserved;
    return bin.status === "Libre utilización" &&
      isPickableLocation(bin.location) &&
      availableQuantity > 0;
  })).filter((bin) =>
    !stockSearch || `${bin.code} ${bin.name} ${bin.warehouse} ${bin.location}`.toLowerCase().includes(stockSearch),
  );
  const availableMaterials = new Set(stock
    .filter((bin) => bin.status === "Libre utilización" && isPickableLocation(bin.location) && bin.quantity > bin.reserved)
    .map((bin) => bin.code)).size;
  const qualityLots = stock.filter((bin) => bin.status === "Bloqueado calidad" && bin.quantity > 0).length;
  const openPurchaseOrders = new Set(transitLines.map((bin) => bin.reference)).size;
  const physicalInventoryValue = physicalBins.reduce((sum, bin) => sum + bin.quantity * bin.unitCost, 0);
  const tabDefinitions = [
    { index: 0, label: "Órdenes de trabajo" },
    { index: 1, label: "Contrato y costos WBS" },
    { index: 2, label: "Almacén y picking" },
    { index: 3, label: "Kardex y conteos" },
    { index: 4, label: "Calidad" },
    ...(canCloseOrders ? [{ index: 5, label: "OT cerradas" }] : []),
    ...(role === "Supervisor" ? [{ index: 6, label: "Personal" }] : []),
  ];
  const visibleTabs = scope === "warehouse"
    ? tabDefinitions.filter((item) => item.index === 2 || (role !== "Supervisor" && item.index === 3))
    : scope === "quality"
      ? tabDefinitions.filter((item) => item.index === 4)
      : scope === "team"
        ? tabDefinitions.filter((item) => role === "Supervisor" && item.index === 6)
        : tabDefinitions.filter((item) => item.index === 0 || (role !== "Supervisor" && (item.index === 1 || item.index === 5)));
  const supervisorOrdersPanel = (
    <Paper sx={{ p: 3 }}>
      <Typography variant="h6" sx={{ mb: 2 }}>Órdenes de trabajo del equipo</Typography>
      {visibleOrders.filter((order) => order.status !== "Cerrada" && supervisorCanSeeOrder(order)).length === 0 ? (
        <Alert severity="info">No hay órdenes abiertas para los contratos o trabajadores de tu equipo.</Alert>
      ) : (
        <Table size="small">
          <TableHead><TableRow><TableCell>OT / equipo</TableCell><TableCell>Trabajo</TableCell><TableCell>Estado</TableCell><TableCell>Asignado a</TableCell><TableCell>Asignar trabajador</TableCell></TableRow></TableHead>
          <TableBody>{visibleOrders.filter((order) => order.status !== "Cerrada" && supervisorCanSeeOrder(order)).map((order) => (
            <TableRow key={order.id}>
              <TableCell>{order.id}<Typography variant="caption" sx={{ display: "block" }}>{order.equipment}</Typography></TableCell>
              <TableCell>{order.description}</TableCell>
              <TableCell><OrderStatusChip status={order.status} /></TableCell>
              <TableCell>{order.technician || "Sin asignar"}</TableCell>
              <TableCell>
                {order.status === "Asignada" && assignableTeam.length > 0 ? (
                  <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                    <TextField select size="small" label="Trabajador" value={assignmentDrafts[order.id] ?? assignableTeam.find((employee) => employee.name === order.technician)?.id ?? assignableTeam[0].id} onChange={(event) => setAssignmentDrafts((current) => ({ ...current, [order.id]: event.target.value }))}>
                      {assignableTeam.map((employee) => <MenuItem key={employee.id} value={employee.id}>{employee.name}</MenuItem>)}
                    </TextField>
                    <Button size="small" variant="contained" onClick={() => assignOrderToTeamMember(order)}>Asignar</Button>
                  </Stack>
                ) : order.status === "Asignada" ? "No hay técnicos directos configurados" : "Solo consulta"}
              </TableCell>
            </TableRow>
          ))}</TableBody>
        </Table>
      )}
    </Paper>
  );

  useEffect(() => {
    localStorage.setItem(ordersStorageKey, JSON.stringify(orders));
  }, [orders]);

  useEffect(() => {
    localStorage.setItem(stockStorageKey, JSON.stringify(stock));
  }, [stock]);

  useEffect(() => {
    localStorage.setItem(stockMovementStorageKey, JSON.stringify(movements));
  }, [movements]);

  useEffect(() => {
    setTab(defaultTab);
  }, [defaultTab, scope]);

  useEffect(() => {
    if (!activeOrder) return;
    const timerId = window.setInterval(() => setElapsedNow(Date.now()), 1000);
    return () => window.clearInterval(timerId);
  }, [activeOrder]);

  const updateOrder = (orderId: string, update: (order: WorkOrder) => WorkOrder) => {
    setOrders((current) => current.map((order) => order.id === orderId ? update(order) : order));
  };

  function assignOrderToTeamMember(order: WorkOrder) {
    if (role !== "Supervisor" || !supervisorEmployee || order.status !== "Asignada") {
      setError("Solo puedes asignar órdenes pendientes a personal de tu equipo.");
      return;
    }
    const employeeId = assignmentDrafts[order.id] ?? assignableTeam[0]?.id;
    const employee = assignableTeam.find((item) => item.id === employeeId);
    if (!employee) {
      setError("Selecciona un trabajador que pertenezca a tu equipo.");
      return;
    }
    const profile = technicianProfiles.find((item) => item.name === employee.name);
    if (!profile) {
      setError("El trabajador seleccionado no tiene un perfil técnico directo habilitado.");
      return;
    }
    updateOrder(order.id, (current) => ({
      ...current,
      technician: employee.name,
      hourlyRate: profile.rate,
      projectedLaborCost: profile.rate * current.projectedHours,
    }));
    setError("");
    setMessage(`${order.id} asignada a ${employee.name}.`);
  }

  function averageUnitCost(code: string): number {
    const bins = stock.filter((bin) => bin.code === code && bin.quantity > 0);
    const quantity = bins.reduce((sum, bin) => sum + bin.quantity, 0);
    return quantity > 0
      ? bins.reduce((sum, bin) => sum + bin.quantity * bin.unitCost, 0) / quantity
      : 0;
  }

  const recordMovement = (movement: StockMovement) => {
    setMovements((current) => [movement, ...current]);
  };

  const createOrder = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canOperate) {
      setError("Tu rol no tiene permiso para crear órdenes de trabajo.");
      return;
    }
    const route = newOrder.type === "ESPERA"
      ? undefined
      : routes.find((item) => item.id === newOrder.routeId);
    if (newOrder.type !== "ESPERA" && !route) {
      setError("Selecciona una hoja de ruta de Industrial para calcular horas y materiales de la OT.");
      return;
    }
    if (!newOrder.equipment.trim() || !newOrder.description.trim()) {
      setError("Completa equipo y descripción de la OT.");
      return;
    }
    const selectedPlan = plans.find((plan) => plan.id === newOrder.planId);
    const wbs = selectedPlan?.wbs || currentContract.wbs.find((item) => item.type === newOrder.type)?.code || "";
    if (!wbs) {
      setError("El contrato seleccionado no tiene un WBS configurado para este tipo de OT.");
      return;
    }
    const projectedHours = route?.operations.reduce((sum, item) => sum + item.durationHours, 0) ?? 0;
    const selectedContract = contracts.find((contract) => contract.code === selectedPlan?.contract) ?? currentContract;
    const technician = newOrder.technician
      ? technicianProfiles.find((item) => item.name === newOrder.technician) ?? technicianProfiles[0]
      : undefined;
    let id: string;
    try {
      id = nextDocNumber(orderTypeSeries[newOrder.type], (candidate) => orders.some((item) => item.id === candidate));
    } catch (numberError) {
      setError(numberError instanceof Error ? numberError.message : "No se pudo numerar la OT.");
      return;
    }
    setOrders((current) => [...current, {
      id,
      contract: selectedContract.code,
      wbs,
      planId: selectedPlan?.id,
      routeId: route?.id,
      routeName: route?.name,
      routeOperations: route?.operations,
      type: newOrder.type,
      equipment: selectedPlan?.equipmentId || newOrder.equipment.trim(),
      description: `${newOrder.description.trim()}${selectedPlan ? ` · Plan ${selectedPlan.id}` : ""}`,
      technician: technician?.name ?? "",
      hourlyRate: technician?.rate ?? 0,
      projectedHours,
      projectedLaborCost: route ? routeLaborCost(route) : 0,
      elapsedSeconds: 0,
      timerStartedAt: null,
      status: "Asignada",
      requiredMaterials: route ? materialsForRoute(route) : [],
      consumedMaterials: [],
      reservedPicks: [],
      qualityChecklist: {},
      qualityApproved: false,
      qualityApprovedBy: null,
      supervisorClosedBy: null,
    }]);
    setNewOrder((current) => ({ ...current, equipment: "", description: "" }));
    setError("");
    setMessage(`OT ${id} creada con ${route?.name ?? "sin hoja (orden de espera)"}; materiales y horas de ruta asociados a ${wbs}.`);
  };

  const createOrderFromCall = (call: PlannedCallRecord) => {
    if (!canOperate) {
      setError("Tu rol no tiene permiso para crear OT desde llamadas de mantenimiento.");
      return;
    }
    const route = routes.find((item) => item.id === call.routeId);
    if (!route) {
      setError(`La llamada ${call.id} referencia una hoja de ruta que ya no existe (${call.routeId}).`);
      return;
    }
    if (orders.some((order) => order.plannedCallId === call.id)) {
      setError(`La llamada ${call.id} ya tiene una OT asociada.`);
      return;
    }
    const contract = contracts.find((item) => item.code === call.plan.contract) ?? contracts[0];
    const wbsElement = contract.wbs.find((item) => item.code === call.plan.wbs);
    const orderType = wbsElement?.type && wbsElement.type !== "ESPERA" ? wbsElement.type : "PRE";
    let id: string;
    try {
      id = nextDocNumber(orderTypeSeries[orderType], (candidate) => orders.some((item) => item.id === candidate));
    } catch (numberError) {
      setError(numberError instanceof Error ? numberError.message : "No se pudo numerar la OT.");
      return;
    }
    setOrders((current) => [...current, {
      id,
      contract: contract.code,
      wbs: call.plan.wbs || contract.wbs.find((item) => item.type === orderType)?.code || "",
      planId: call.plan.id,
      plannedCallId: call.id,
      routeId: route.id,
      routeName: route.name,
      routeOperations: route.operations,
      type: orderType,
      equipment: call.plan.equipmentId,
      description: `Llamada ${call.id} · ${call.plan.name} · fecha requerida ${call.dueDate.slice(0, 10)}`,
      technician: "",
      hourlyRate: 0,
      projectedHours: route.operations.reduce((sum, operation) => sum + operation.durationHours, 0),
      projectedLaborCost: routeLaborCost(route),
      elapsedSeconds: 0,
      timerStartedAt: null,
      status: "Asignada",
      requiredMaterials: materialsForRoute(route),
      consumedMaterials: [],
      reservedPicks: [],
      qualityChecklist: {},
      qualityApproved: false,
      qualityApprovedBy: null,
      supervisorClosedBy: null,
    }]);
    setMessage(`OT ${id} creada desde ${call.id} con hoja ${route.id}; sus materiales ya están disponibles para picking.`);
    setError("");
  };

  const startTimer = (orderId: string) => {
    if (!canOperate) {
      setError("Tu rol no tiene permiso para registrar horas de trabajo.");
      return;
    }
    if (activeOrder && activeOrder.id !== orderId) {
      setError(`Detén primero el cronómetro de ${activeOrder.id}.`);
      return;
    }
    setError("");
    updateOrder(orderId, (order) => ({
      ...order,
      timerStartedAt: order.timerStartedAt ?? Date.now(),
      status: "En ejecución",
    }));
    setMessage(`Registro de tiempo iniciado en ${orderId}.`);
  };

  const stopTimer = (orderId: string) => {
    if (!canOperate) {
      setError("Tu rol no tiene permiso para registrar horas de trabajo.");
      return;
    }
    const order = orders.find((item) => item.id === orderId);
    if (!order?.timerStartedAt) return;
    const seconds = Math.max(0, Math.floor((Date.now() - order.timerStartedAt) / 1000));
    updateOrder(orderId, (item) => ({
      ...item,
      elapsedSeconds: item.elapsedSeconds + seconds,
      timerStartedAt: null,
      status: item.status === "En ejecución" ? "Asignada" : item.status,
    }));
    setMessage(`Tiempo registrado: ${durationLabel(seconds)} en ${orderId}.`);
  };

  const provisionalClose = (orderId: string) => {
    if (!canOperate) {
      setError("Tu rol no tiene permiso para solicitar el cierre provisorio.");
      return;
    }
    const order = orders.find((item) => item.id === orderId);
    if (order?.timerStartedAt) {
      setError("Detén el cronómetro antes de solicitar el cierre provisorio.");
      return;
    }
    updateOrder(orderId, (item) => ({ ...item, status: "Cierre provisorio" }));
    setMessage(`${orderId} quedó pendiente de revisión y cierre del supervisor.`);
    setError("");
  };

  const supervisorClose = (orderId: string) => {
    if (!canCloseOrders) return;
    const order = orders.find((item) => item.id === orderId);
    if (order?.timerStartedAt) {
      setError("El técnico debe detener el cronómetro antes del cierre final.");
      return;
    }
    if (order?.status !== "Cierre provisorio") {
      setError("Solo se puede cerrar una OT que esté en cierre provisorio.");
      return;
    }
    if (order.type !== "ESPERA" && !order.qualityApproved) {
      setError("Calidad debe aprobar el checklist antes del cierre final.");
      return;
    }
    const previousStatus = order.status;
    updateOrder(orderId, (item) => {
      const now = new Date().toISOString();
      return {
        ...item,
        status: "Cerrada",
        supervisorClosedBy: user,
        closedAt: now,
        closedBy: user,
        statusHistory: [
          ...(item.statusHistory ?? []),
          {
            date: now,
            previousStatus,
            newStatus: "Cerrada",
            user,
          },
        ],
      };
    });
    setMessage(`${orderId} cerrada por ${user}.`);
    setError("");
  };

  const reopenOrder = (orderId: string, reason: string) => {
    if (!isSupervisor) {
      setError("Solo Supervisor puede reabrir una OT cerrada.");
      return;
    }
    if (!reason.trim()) {
      setError("Completa el motivo de reapertura.");
      return;
    }
    const order = orders.find((item) => item.id === orderId);
    if (!order || order.status !== "Cerrada") {
      setError("Solo se pueden reabrir órdenes en estado Cerrada.");
      return;
    }
    const now = new Date().toISOString();
    updateOrder(orderId, (order) => ({
      ...order,
      status: "Asignada",
      supervisorClosedBy: null,
      qualityApproved: false,
      qualityApprovedBy: null,
      statusHistory: [
        ...(order.statusHistory ?? []),
        {
          date: now,
          previousStatus: "Cerrada",
          newStatus: "Asignada",
          user,
          reason: reason.trim(),
        },
      ],
    }));
    setMessage(`${orderId} reabierta por ${user} - Motivo: ${reason}`);
    setError("");
  };

  const updateQualityCheck = (orderId: string, item: string, checked: boolean) => {
    if (!canInspect) {
      setError("Solo Calidad o Administrador puede modificar el checklist.");
      return;
    }
    updateOrder(orderId, (order) => ({
      ...order,
      qualityChecklist: { ...(order.qualityChecklist ?? {}), [item]: checked },
      qualityApproved: false,
      qualityApprovedBy: null,
    }));
    setError("");
  };

  const approveQuality = (order: WorkOrder) => {
    if (!canInspect) {
      setError("Solo Calidad o Administrador puede aprobar la inspección.");
      return;
    }
    if (order.status !== "Cierre provisorio") {
      setError("La OT debe estar en cierre provisorio antes de solicitar aprobación de Calidad.");
      return;
    }
    if (!qualityCheckItems.every((item) => order.qualityChecklist?.[item])) {
      setError(`Completa todos los puntos del checklist para ${order.id}.`);
      return;
    }
    updateOrder(order.id, (current) => ({
      ...current,
      qualityApproved: true,
      qualityApprovedBy: user,
    }));
    setMessage(`Checklist de ${order.id} aprobado por ${user}; queda habilitado para cierre de Supervisor.`);
    setError("");
  };

  const sortedPickList = (order: WorkOrder) => {
    const remaining = order.requiredMaterials.map((item) => ({
      ...item,
      quantity: Math.max(0,
        item.quantity
        - (order.consumedMaterials.find((consumed) => consumed.code === item.code)?.quantity ?? 0)
        - (order.reservedPicks ?? []).filter((pick) => pick.code === item.code).reduce((sum, pick) => sum + pick.quantity, 0),
      ),
    })).filter((item) => item.quantity > 0);
    const picks = remaining.flatMap((item) => {
      let needed = item.quantity;
      return stock
        .filter((bin) =>
          bin.code === item.code &&
          bin.status === "Libre utilización" &&
          isPickableLocation(bin.location),
        )
        .sort((a, b) => a.location.localeCompare(b.location, undefined, { numeric: true }))
        .flatMap((bin) => {
          const canPick = Math.min(needed, bin.quantity - bin.reserved);
          if (canPick <= 0) return [];
          needed -= canPick;
          return [{ bin, quantity: canPick }];
        });
    });
    return { remaining, picks };
  };
  const selectedWarehouseOrder = availableOrders.find((order) => order.id === selectedWarehouseOrderId);
  const warehousePickRows = selectedWarehouseOrder
    ? selectedWarehouseOrder.requiredMaterials.map((material) => {
      const consumed = selectedWarehouseOrder.consumedMaterials.find((item) => item.code === material.code)?.quantity ?? 0;
      const remaining = Math.max(0, material.quantity - consumed);
      const reserved = (selectedWarehouseOrder.reservedPicks ?? [])
        .filter((pick) => pick.code === material.code).reduce((sum, pick) => sum + pick.quantity, 0);
      const planned = sortedPickList(selectedWarehouseOrder).picks
        .filter((pick) => pick.bin.code === material.code).reduce((sum, pick) => sum + pick.quantity, 0);
      const bins = [
        ...(selectedWarehouseOrder.reservedPicks ?? []).filter((pick) => pick.code === material.code).flatMap((pick) => {
          const bin = stock.find((item) => item.id === pick.binId);
          return bin ? [`${bin.warehouse}/${bin.location}`] : [];
        }),
        ...sortedPickList(selectedWarehouseOrder).picks.filter((pick) => pick.bin.code === material.code)
          .map((pick) => `${pick.bin.warehouse}/${pick.bin.location}`),
      ];
      return { ...material, remaining, reserved, planned, locations: [...new Set(bins)].join(", ") };
    }).filter((item) => item.remaining > 0)
    : [];
  const exportPicking = (order: WorkOrder) => {
    downloadCsvRows(`picking_${order.id}.csv`,
      ["Orden", "Material", "Código", "Ubicación sugerida", "Cantidad requerida", "Cantidad tomada"],
      warehousePickRows.map((item) => [
        order.id,
        item.name ?? item.code,
        item.code,
        item.locations,
        item.remaining,
        pickingTaken[`${order.id}:${item.code}`] ?? "",
      ]));
  };

  const preparePicking = (order: WorkOrder) => {
    if (!["Administrador", "Supervisor", "Producción", "Industrial"].includes(role)) {
      setError("Tu rol no tiene permiso para preparar picking.");
      return;
    }
    const { remaining, picks } = sortedPickList(order);
    if (!remaining.length) {
      setError(`No quedan materiales pendientes para ${order.id}.`);
      setMessage("");
      return;
    }
    const availableByCode = new Map<string, number>();
    for (const pick of picks) {
      availableByCode.set(pick.bin.code, (availableByCode.get(pick.bin.code) ?? 0) + pick.quantity);
    }
    const short = remaining.filter((item) => (availableByCode.get(item.code) ?? 0) < item.quantity);
    if (short.length) {
      setError(`Stock libre insuficiente para ${order.id}: ${short.map((item) => item.code).join(", ")}. Revisa Calidad, tránsito o compras.`);
      setMessage("");
      return;
    }
    setStock((current) => current.map((bin) => {
      const reserved = picks.filter((pick) => pick.bin.id === bin.id).reduce((sum, pick) => sum + pick.quantity, 0);
      return reserved ? { ...bin, reserved: bin.reserved + reserved } : bin;
    }));
    picks.forEach((pick) => recordMovement(makeMovement(
      "Reserva picking",
      pick.bin.code,
      pick.quantity,
      `${pick.bin.warehouse}/${pick.bin.location}`,
      order.id,
      order.id,
      user,
    )));
    updateOrder(order.id, (current) => ({
      ...current,
      reservedPicks: [
        ...(current.reservedPicks ?? []),
        ...picks.map((pick) => ({ binId: pick.bin.id, code: pick.bin.code, quantity: pick.quantity })),
      ],
    }));
    setMessage(`Picking reservado para ${order.id} siguiendo ubicación ascendente.`);
    setError("");
  };

  const confirmConsumption = (order: WorkOrder) => {
    if (!["Administrador", "Supervisor", "Producción", "Industrial"].includes(role)) {
      setError("Tu rol no tiene permiso para confirmar el consumo de materiales.");
      return;
    }
    const remaining = order.requiredMaterials.map((item) => ({
      code: item.code,
      quantity: Math.max(0,
        item.quantity - (order.consumedMaterials.find((consumed) => consumed.code === item.code)?.quantity ?? 0),
      ),
    })).filter((item) => item.quantity > 0);
    const picks = (order.reservedPicks ?? []).flatMap((pick) => {
      const bin = stock.find((item) => item.id === pick.binId);
      return bin ? [{ bin, quantity: pick.quantity }] : [];
    });
    const reservedByCode = new Map<string, number>();
    for (const pick of picks) reservedByCode.set(pick.bin.code, (reservedByCode.get(pick.bin.code) ?? 0) + pick.quantity);
    const takenByCode = new Map(remaining.map((item) => {
      const raw = pickingTaken[`${order.id}:${item.code}`];
      return [item.code, raw?.trim() ? Number(raw) : item.quantity];
    }));
    if (!remaining.length || remaining.some((item) => {
      const taken = takenByCode.get(item.code) ?? 0;
      return !Number.isFinite(taken) || taken <= 0 || taken > item.quantity ||
        taken > (reservedByCode.get(item.code) ?? 0);
    })) {
      setError(`Indica cantidades tomadas válidas y no mayores al saldo reservado para ${order.id}.`);
      return;
    }
    if (picks.some((pick) => pick.quantity > pick.bin.quantity || pick.quantity > pick.bin.reserved)) {
      setError("La reserva ya no coincide con el saldo disponible. Libera y vuelve a preparar el picking.");
      return;
    }
    let remainingToConsume = new Map(takenByCode);
    const consumedPicks = picks.map((pick) => {
      const quantity = Math.min(pick.quantity, remainingToConsume.get(pick.bin.code) ?? 0);
      remainingToConsume.set(pick.bin.code, Math.max(0, (remainingToConsume.get(pick.bin.code) ?? 0) - quantity));
      return { ...pick, consumed: quantity };
    });
    setStock((current) => current.map((bin) => {
      const reserved = picks.filter((pick) => pick.bin.id === bin.id).reduce((sum, pick) => sum + pick.quantity, 0);
      const consumed = consumedPicks.filter((pick) => pick.bin.id === bin.id).reduce((sum, pick) => sum + pick.consumed, 0);
      return reserved ? { ...bin, quantity: bin.quantity - consumed, reserved: Math.max(0, bin.reserved - reserved) } : bin;
    }));
    consumedPicks.forEach((pick) => {
      if (pick.consumed > 0) recordMovement(makeMovement(
        "Consumo OT", pick.bin.code, pick.consumed,
        `${pick.bin.warehouse}/${pick.bin.location}`, order.id, `${order.id} · ${order.wbs}`, user,
      ));
      if (pick.quantity > pick.consumed) recordMovement(makeMovement(
        "Liberación picking", pick.bin.code, pick.quantity - pick.consumed,
        order.id, `${pick.bin.warehouse}/${pick.bin.location}`, order.id, user,
      ));
    });
    updateOrder(order.id, (current) => {
      const additions = remaining.map((item) => {
        const materialPicks = consumedPicks.filter((pick) => pick.bin.code === item.code && pick.consumed > 0);
        const pickedQuantity = materialPicks.reduce((sum, pick) => sum + pick.consumed, 0);
        const unitCost = materialPicks.reduce((sum, pick) => sum + pick.consumed * pick.bin.unitCost, 0)
          / Math.max(1, pickedQuantity);
        return { code: item.code, quantity: takenByCode.get(item.code) ?? 0, unitCost };
      });
      const combined = [...current.consumedMaterials];
      for (const item of additions) {
        if (item.quantity <= 0) continue;
        const existing = combined.find((consumed) => consumed.code === item.code);
        if (existing) {
          const previousQuantity = existing.quantity;
          existing.unitCost = ((existing.unitCost ?? 0) * previousQuantity + (item.unitCost ?? 0) * item.quantity)
            / (previousQuantity + item.quantity);
          existing.quantity += item.quantity;
        }
        else combined.push(item);
      }
      return { ...current, consumedMaterials: combined, reservedPicks: [] };
    });
    setPickingTaken((current) => Object.fromEntries(Object.entries(current).filter(([key]) => !key.startsWith(`${order.id}:`))));
    setMessage(`Cantidades tomadas registradas en ${order.id}; el excedente reservado se liberó y el consumo se cargará al costo de la OT/WBS.`);
    setError("");
  };

  const receivePurchase = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canReceive) {
      setError("Solo Compras o Administrador puede registrar recepciones desde OC.");
      return;
    }
    const quantity = Number(receipt.quantity);
    if (!Number.isInteger(quantity) || quantity <= 0) {
      setError("La recepción debe tener una cantidad entera mayor a cero.");
      return;
    }
    const source = selectedTransitLine;
    if (!source) {
      setError("No hay una línea en tránsito para ese material y número de OC.");
      return;
    }
    if (quantity > source.quantity) {
      setError(`La recepción supera lo pendiente en ${receipt.purchaseOrder} (${source.quantity} ${source.unit}).`);
      return;
    }
    const storedOrders = readStoredList<PurchaseOrder>(purchaseOrdersStorageKey);
    const linkedOrder = storedOrders.find((order) => order.id === source.reference && order.status === "Aprobada");
    if (linkedOrder) {
      const receivedQuantity = (linkedOrder.receivedQuantity ?? 0) + quantity;
      const nextOrders = storedOrders.map((order) => order.id === linkedOrder.id
        ? {
          ...order,
          receivedQuantity,
          status: receivedQuantity >= order.quantity ? "Recepcionada" as const : "Aprobada" as const,
        }
        : order);
      try {
        localStorage.setItem(purchaseOrdersStorageKey, JSON.stringify(nextOrders));
      } catch (writeError) {
        console.error("No se pudo actualizar la recepción de la OC.", writeError);
        setError("No se pudo actualizar la OC; no se registró la recepción.");
        return;
      }
    }
    const newBin: StockBin = {
      ...source,
      id: `BIN-REC-${Date.now()}`,
      warehouse: "Bodega Central",
      location: receipt.qualityHold ? "REC-CALIDAD" : "REC-UBICAR",
      status: receipt.qualityHold ? "Bloqueado calidad" : "Libre utilización",
      quantity,
      reserved: 0,
    };
    setStock((current) => current
      .map((bin) => bin.id === source.id ? { ...bin, quantity: bin.quantity - quantity } : bin)
      .concat(newBin));
    recordMovement(makeMovement(
      "Recepción OC",
      source.code,
      quantity,
      `${source.warehouse}/${source.location}`,
      `${newBin.warehouse}/${newBin.location}`,
      source.reference ?? receipt.purchaseOrder,
      user,
    ));
    setError("");
    setMessage(`Recepción de ${source.reference ?? receipt.purchaseOrder} registrada: ${quantity} ${source.unit} de ${source.name}. Pendiente: ${source.quantity - quantity}. ${receipt.qualityHold ? "Quedó bloqueada para inspección de Calidad." : "Quedó en zona de recepción hasta asignar ubicación."}`);
  };

  const releaseQualityStock = (binId: string) => {
    if (role !== "Calidad" && role !== "Administrador") {
      setError("Solo Calidad o Administrador puede liberar material bloqueado.");
      return;
    }
    const bin = stock.find((item) => item.id === binId);
    if (!bin || bin.status !== "Bloqueado calidad") return;
    setStock((current) => current.map((bin) => bin.id === binId
      ? { ...bin, status: "Libre utilización", location: "REC-UBICAR" }
      : bin));
    recordMovement(makeMovement(
      "Liberación de calidad",
      bin.code,
      bin.quantity,
      `${bin.warehouse}/${bin.location}`,
      `${bin.warehouse}/REC-UBICAR`,
      bin.reference ?? bin.id,
      user,
    ));
    setMessage("Lote liberado por Calidad a libre utilización; pendiente de ubicación definitiva.");
    setError("");
  };

  const releasePicking = (order: WorkOrder) => {
    if (!["Administrador", "Supervisor", "Producción", "Industrial"].includes(role)) {
      setError("Tu rol no tiene permiso para liberar reservas de picking.");
      return;
    }
    const reservations = order.reservedPicks ?? [];
    if (!reservations.length) return;
    setStock((current) => current.map((bin) => {
      const reserved = reservations
        .filter((pick) => pick.binId === bin.id)
        .reduce((sum, pick) => sum + pick.quantity, 0);
      return reserved ? { ...bin, reserved: Math.max(0, bin.reserved - reserved) } : bin;
    }));
    reservations.forEach((pick) => {
      const bin = stock.find((item) => item.id === pick.binId);
      recordMovement(makeMovement(
        "Liberación picking",
        pick.code,
        pick.quantity,
        order.id,
        bin ? `${bin.warehouse}/${bin.location}` : "Stock",
        order.id,
        user,
      ));
    });
    updateOrder(order.id, (current) => ({ ...current, reservedPicks: [] }));
    setMessage(`Reservas de ${order.id} liberadas; el stock vuelve a estar disponible.`);
    setError("");
  };

  const putawayStock = (binId: string, requestedLocation?: string) => {
    if (!canPutaway) {
      setError("Tu rol no tiene permiso para ubicar materiales.");
      return;
    }
    const bin = stock.find((item) => item.id === binId);
    const location = (requestedLocation ?? putawayLocations[binId] ?? "").trim().toUpperCase();
    if (!bin || bin.status !== "Libre utilización" || bin.location !== "REC-UBICAR") {
      setError("Solo se pueden ubicar materiales liberados que estén en zona de recepción.");
      return;
    }
    if (!location || location === "REC-UBICAR" || location === "REC-CALIDAD" || location === "TRANSITO") {
      setError("Ingresa una ubicación definitiva válida, por ejemplo A-01-02.");
      return;
    }
    const destinationWarehouse = bin.warehouse === "Recepciones" ? "Bodega Central" : bin.warehouse;
    setStock((current) => current.map((item) => item.id === binId
      ? { ...item, warehouse: destinationWarehouse, location }
      : item));
    recordMovement(makeMovement(
      "Ubicación",
      bin.code,
      bin.quantity,
      `${bin.warehouse}/${bin.location}`,
      `${destinationWarehouse}/${location}`,
      bin.reference ?? bin.id,
      user,
    ));
    setPutawayLocations((current) => ({ ...current, [binId]: "" }));
    setMessage(`${bin.code} ubicado en ${destinationWarehouse}/${location}.`);
    setError("");
  };

  const putawayStockGroup = (group: StockBinGroup) => {
    const location = (putawayLocations[group.id] ?? "").trim().toUpperCase();
    if (!location || location === "REC-UBICAR" || location === "REC-CALIDAD" || location === "TRANSITO") {
      setError("Ingresa una ubicación definitiva válida, por ejemplo A-01-02.");
      return;
    }
    group.sourceBins.forEach((bin) => putawayStock(bin.id, location));
  };

  const performCycleCount = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canCount) {
      setError("Tu rol no tiene permiso para registrar conteos de inventario.");
      return;
    }
    const bin = stock.find((item) => item.id === (cycleCount.binId || countableBins[0]?.id));
    const counted = Number(cycleCount.countedQuantity);
    if (!bin || bin.status === "En tránsito" || !Number.isInteger(counted) || counted < 0) {
      setError("Selecciona una ubicación física e ingresa una cantidad contada válida (entero igual o mayor que cero).");
      return;
    }
    const delta = counted - bin.quantity;
    if (delta === 0) {
      setMessage(`Conteo sin diferencia para ${bin.code} en ${bin.warehouse}/${bin.location}.`);
      setError("");
      return;
    }
    if (counted < bin.reserved) {
      setError(`El conteo no puede quedar bajo las ${bin.reserved} unidades reservadas.`);
      return;
    }
    setStock((current) => current.map((item) => item.id === bin.id ? { ...item, quantity: counted } : item));
    recordMovement(makeMovement(
      "Ajuste inventario",
      bin.code,
      Math.abs(delta),
      delta < 0 ? `${bin.warehouse}/${bin.location}` : "Conteo físico",
      delta > 0 ? `${bin.warehouse}/${bin.location}` : "Diferencia de inventario",
      `Conteo ${new Date().toLocaleDateString("es-CL")}`,
      user,
    ));
    setCycleCount((current) => ({ ...current, countedQuantity: "" }));
    setMessage(`Conteo ajustado para ${bin.code}: ${delta > 0 ? "+" : ""}${delta} ${bin.unit}.`);
    setError("");
  };

  const performTransfer = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canPutaway) {
      setError("Tu rol no tiene permiso para trasladar stock.");
      return;
    }
    const source = stock.find((item) => item.id === (transfer.binId || transferableBins[0]?.id));
    const quantity = Number(transfer.quantity);
    const location = transfer.toQuality ? "QC-INSPECCION" : transfer.location.trim().toUpperCase();
    if (!source || source.status !== "Libre utilización" || source.location === "REC-UBICAR") {
      setError("Selecciona una ubicación de stock libre para trasladar.");
      return;
    }
    if (!Number.isInteger(quantity) || quantity <= 0 || quantity > source.quantity - source.reserved) {
      setError(`Cantidad inválida: hay ${source.quantity - source.reserved} ${source.unit} libres para traslado.`);
      return;
    }
    if (
      (!transfer.toQuality && !transfer.warehouse.trim()) ||
      !location ||
      (!transfer.toQuality && (transfer.warehouse.trim() === "Recepciones" ||
      !isPickableLocation(location) ||
      (transfer.warehouse === source.warehouse && location === source.location)))
    ) {
      setError("Indica un almacén y ubicación destino distintos al origen.");
      return;
    }
    const destination: StockBin = {
      ...source,
      id: `BIN-TR-${Date.now()}`,
      warehouse: transfer.toQuality ? "Almacén Calidad" : transfer.warehouse.trim(),
      location,
      status: transfer.toQuality ? "Bloqueado calidad" : "Libre utilización",
      quantity,
      reserved: 0,
      reference: `Traslado desde ${source.warehouse}/${source.location}`,
    };
    setStock((current) => current
      .map((bin) => bin.id === source.id ? { ...bin, quantity: bin.quantity - quantity } : bin)
      .concat(destination));
    recordMovement(makeMovement(
      "Traslado",
      source.code,
      quantity,
      `${source.warehouse}/${source.location}`,
      `${destination.warehouse}/${destination.location}`,
      source.id,
      user,
    ));
    setMessage(`${quantity} ${source.unit} de ${source.code} trasladados a ${destination.warehouse}/${destination.location}${transfer.toQuality ? " para inspección" : ""}.`);
    setError("");
  };

  const importWarehouseCsv = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    setWarehouseImportError("");
    setWarehouseImportMessage("");
    if (!file) return;
    if (role !== "Administrador") {
      setWarehouseImportError("Solo el Administrador puede realizar cargas masivas de saldos iniciales.");
      return;
    }
    try {
      const lines = (await file.text()).replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => line.trim());
      if (lines.length < 2) throw new Error("El archivo CSV no contiene saldos para importar.");
      const headers = parseCsvRow(lines[0]).map((value) => value.trim());
      const requiredHeaders = ["code", "name", "warehouse", "location", "status", "quantity", "unit", "unitCost"];
      const indexes = new Map(headers.map((header, index) => [header, index]));
      const missing = requiredHeaders.filter((header) => !indexes.has(header));
      if (missing.length) throw new Error(`Faltan columnas requeridas: ${missing.join(", ")}.`);
      const imported = lines.slice(1).map((line, index): StockBin => {
        const values = parseCsvRow(line);
        const get = (key: string) => values[indexes.get(key) ?? -1]?.trim() ?? "";
        const status = get("status") as StockStatus;
        const quantity = Number(get("quantity"));
        const unitCost = Number(get("unitCost"));
        if (!get("code") || !get("name") || !get("warehouse") || !get("location") || !get("unit")) {
          throw new Error(`Fila ${index + 2}: falta completar material, almacén, ubicación o unidad.`);
        }
        if (!["Libre utilización", "Bloqueado calidad", "En tránsito"].includes(status)) {
          throw new Error(`Fila ${index + 2}: estado no válido "${get("status")}".`);
        }
        if (!Number.isInteger(quantity) || quantity < 0 || !Number.isFinite(unitCost) || unitCost < 0) {
          throw new Error(`Fila ${index + 2}: cantidad o costo unitario no válido.`);
        }
        if (!get("quantity") || !get("unitCost")) {
          throw new Error(`Fila ${index + 2}: cantidad y costo unitario son obligatorios.`);
        }
        if (status === "En tránsito" && !get("reference")) {
          throw new Error(`Fila ${index + 2}: el stock en tránsito debe indicar el número de OC en la columna reference.`);
        }
        if (get("location").toUpperCase() === "TRANSITO" && status !== "En tránsito") {
          throw new Error(`Fila ${index + 2}: TRANSITO solo es válido para stock En tránsito.`);
        }
        if (get("location").toUpperCase() === "REC-CALIDAD" && status !== "Bloqueado calidad") {
          throw new Error(`Fila ${index + 2}: REC-CALIDAD requiere estado Bloqueado calidad.`);
        }
        return {
          id: `BIN-IMP-${Date.now()}-${index}`,
          code: get("code"),
          name: get("name"),
          warehouse: get("warehouse"),
          location: get("location"),
          status,
          quantity,
          reserved: 0,
          unit: get("unit"),
          unitCost,
          reference: get("reference") || undefined,
        };
      });
      const locationKeys = new Set(stock.map((bin) => `${bin.code}|${bin.warehouse}|${bin.location}|${bin.status}`));
      for (const [index, bin] of imported.entries()) {
        const key = `${bin.code}|${bin.warehouse}|${bin.location}|${bin.status}`;
        if (locationKeys.has(key)) {
          throw new Error(`Fila ${index + 2}: ya existe saldo para ${bin.code} en ${bin.warehouse}/${bin.location} (${bin.status}). Usa recepción, traslado o conteo para actualizarlo.`);
        }
        locationKeys.add(key);
      }
      setStock((current) => [...current, ...imported]);
      imported.forEach((bin) => recordMovement(makeMovement(
        "Ajuste inventario",
        bin.code,
        bin.quantity,
        "Importación",
        `${bin.warehouse}/${bin.location}`,
        file.name,
        user,
      )));
      setWarehouseImportMessage(`${imported.length} ubicaciones importadas. Se registraron como saldos iniciales en el kardex.`);
    } catch (cause) {
      setWarehouseImportError(cause instanceof Error ? cause.message : "No se pudo importar el archivo CSV.");
    }
  };

  const monthlyActual = visibleOrders.reduce((sum, order) =>
    sum + allocatedCost(order, stock, order.currentSeconds), 0);
  const monthlyCommitted = visibleOrders.filter((order) => order.status !== "Cerrada").reduce((sum, order) =>
    sum + order.requiredMaterials.reduce((materialSum, item) => {
      const consumed = order.consumedMaterials.find((line) => line.code === item.code)?.quantity ?? 0;
      const price = item.unitCost ?? averageUnitCost(item.code);
      return materialSum + Math.max(0, item.quantity - consumed) * price;
    }, 0) + (order.projectedHours > 0
      ? plannedLaborCost(order) * Math.max(0, order.projectedHours - order.currentSeconds / 3600) / order.projectedHours
      : 0), 0);
  const totalBudget = contracts[0].wbs.reduce((sum, item) => sum + item.budget, 0);

  const exportOrderTemplate = () => downloadTemplate("plantilla_ordenes_trabajo.csv",
    ["contract", "type", "equipment", "description", "technician", "projectedHours"],
    ["CT1234", "PRE", "VEH-004", "Servicio preventivo", "Camila Rojas", 3.5]);
  const exportWarehouseTemplate = () => downloadTemplate("plantilla_almacen.csv",
    ["code", "name", "warehouse", "location", "status", "quantity", "unit", "unitCost", "reference"],
    ["MAT-114", "Cinta aislante 3M", "Bodega Central", "A-01-02", "Libre utilización", 10, "rollo", 3500, ""]);

  return (
    <Stack spacing={3}>
      <Box>
        <Typography variant="h4" sx={{ fontWeight: 700 }}>
          {scope === "warehouse" ? "Almacén y logística" : scope === "quality" ? "Calidad e inspecciones" : scope === "team" ? "Personal del equipo" : "Operaciones y órdenes de trabajo"}
        </Typography>
        <Typography color="text.secondary">
          Demostración con datos ficticios del contrato CT1234.
        </Typography>
      </Box>
      <Alert severity="warning">
        Prototipo local: estos datos de prueba se guardan en este navegador. Costos, roles, permisos e inventario requieren validación de backend antes de producción.
      </Alert>
      {message && <Alert severity="success">{message}</Alert>}
      {error && <Alert severity="error">{error}</Alert>}

      {scope === "operations" && role !== "Supervisor" && (
        <Grid container spacing={2}>
          {[
            { label: "Presupuesto CT1234", value: money(totalBudget) },
            { label: "Costo real registrado", value: money(monthlyActual) },
            { label: "Comprometido estimado", value: money(monthlyCommitted) },
            { label: "Proyección actual", value: money(monthlyActual + monthlyCommitted) },
          ].map((item) => (
            <Grid size={{ xs: 12, sm: 6, lg: 3 }} key={item.label}>
              <Paper sx={{ p: 2, height: "100%" }}>
                <Typography variant="body2" color="text.secondary">{item.label}</Typography>
                <Typography variant="h6" sx={{ mt: 1, fontWeight: 700 }}>{item.value}</Typography>
              </Paper>
            </Grid>
          ))}
        </Grid>
      )}

      <Paper sx={{ px: 2 }}>
        <Tabs value={tab} onChange={(_, value: number) => setTab(value)} variant="scrollable" allowScrollButtonsMobile>
          {visibleTabs.map((item) => <Tab key={item.index} value={item.index} label={item.label} />)}
        </Tabs>
      </Paper>

      {tab === 0 && canOperate && (
        <Stack spacing={3}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6">Llamadas de planes de mantenimiento</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Crea la OT desde una llamada para copiar su equipo, contrato, hoja de ruta, horas y materiales requeridos.
            </Typography>
            {plannedCalls.filter((call) => !orders.some((order) => order.plannedCallId === call.id)).length === 0 ? (
              <Alert severity="info">No hay llamadas nuevas. Crea o revisa un plan de mantenimiento para generar necesidades futuras.</Alert>
            ) : (
              <Table size="small">
                <TableHead><TableRow><TableCell>Fecha requerida</TableCell><TableCell>Llamada / plan</TableCell><TableCell>Equipo</TableCell><TableCell>Hoja de ruta</TableCell><TableCell>Contrato / WBS</TableCell><TableCell /></TableRow></TableHead>
                <TableBody>{plannedCalls
                  .filter((call) => !orders.some((order) => order.plannedCallId === call.id))
                  .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
                  .slice(0, 20)
                  .map((call) => (
                    <TableRow key={call.id}>
                      <TableCell>{new Intl.DateTimeFormat("es-CL").format(new Date(call.dueDate))}</TableCell>
                      <TableCell>{call.id}<Typography variant="caption" sx={{ display: "block" }}>{call.plan.name}</Typography></TableCell>
                      <TableCell>{call.plan.equipmentId}</TableCell>
                      <TableCell>{routes.find((route) => route.id === call.routeId)?.name ?? call.routeId}</TableCell>
                      <TableCell>{call.plan.contract}<Typography variant="caption" sx={{ display: "block" }}>{call.plan.wbs}</Typography></TableCell>
                      <TableCell><Button size="small" variant="contained" onClick={() => createOrderFromCall(call)}>Crear OT</Button></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Paper>

          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" sx={{ mb: 2 }}>Crear OT vinculada a una hoja de ruta</Typography>
            <Stack component="form" onSubmit={createOrder} spacing={2}>
              <Grid container spacing={2}>
                <Grid size={{ xs: 12, sm: 6, lg: 2 }}>
                  <TextField select label="Contrato" value={newOrder.contract} onChange={(event) => setNewOrder((current) => ({ ...current, contract: event.target.value, planId: "" }))} fullWidth>
                    {contracts.map((contract) => <MenuItem key={contract.code} value={contract.code}>{contract.code} · {contract.customer}</MenuItem>)}
                  </TextField>
                </Grid>
                <Grid size={{ xs: 12, sm: 6, lg: 2 }}>
                  <TextField select label="Tipo de OT" value={newOrder.type} onChange={(event) => {
                    const value = event.target.value as OrderType;
                    if (["PRE", "OVH", "COR", "REP", "ESPERA"].includes(value)) {
                      setNewOrder((current) => ({
                        ...current,
                        type: value,
                        routeId: value === "ESPERA" ? "" : current.routeId || routes[0]?.id || "",
                        planId: "",
                      }));
                    }
                  }} fullWidth>
                    {Object.entries(typeLabels).map(([code, label]) => <MenuItem key={code} value={code}>{code} · {label}</MenuItem>)}
                  </TextField>
                </Grid>
                <Grid size={{ xs: 12, sm: 6, lg: 2 }}>
                  <TextField select label="Plan (opcional)" value={newOrder.planId} onChange={(event) => {
                    const planId = event.target.value;
                    const plan = plans.find((item) => item.id === planId);
                    const planContract = contracts.find((item) => item.code === plan?.contract);
                    const planType = planContract?.wbs.find((item) => item.code === plan?.wbs)?.type;
                    setNewOrder((current) => ({
                      ...current,
                      planId,
                      routeId: plan?.routeId ?? current.routeId,
                      equipment: plan?.equipmentId ?? current.equipment,
                      contract: planContract?.code ?? current.contract,
                      type: planType ?? current.type,
                      description: plan ? `${plan.name} · generado desde plan` : current.description,
                    }));
                  }} fullWidth>
                    <MenuItem value="">Sin plan</MenuItem>
                    {plans.map((plan) => <MenuItem key={plan.id} value={plan.id}>{plan.id} · {plan.name}</MenuItem>)}
                  </TextField>
                </Grid>
                <Grid size={{ xs: 12, sm: 6, lg: 2 }}>
                  <TextField select label="Hoja de ruta" value={newOrder.routeId} disabled={newOrder.type === "ESPERA"} onChange={(event) => setNewOrder((current) => ({
                    ...current,
                    routeId: event.target.value,
                    planId: plans.find((plan) => plan.id === current.planId)?.routeId === event.target.value ? current.planId : "",
                  }))} required={newOrder.type !== "ESPERA"} fullWidth>
                    <MenuItem value="">Selecciona hoja</MenuItem>
                    {routes.map((route) => <MenuItem key={route.id} value={route.id}>{route.id} · {route.name}</MenuItem>)}
                  </TextField>
                </Grid>
                <Grid size={{ xs: 12, sm: 6, lg: 2 }}>
                  <TextField select label="Técnico" value={newOrder.technician} onChange={(event) => setNewOrder((current) => ({ ...current, technician: event.target.value }))} fullWidth>
                    <MenuItem value="">Sin asignar · Supervisor asigna equipo</MenuItem>
                    {technicianProfiles.map((technician) => <MenuItem key={technician.name} value={technician.name}>{technician.name} · {money(technician.rate)}/h</MenuItem>)}
                  </TextField>
                </Grid>
                <Grid size={{ xs: 12, sm: 6, lg: 1 }}>
                  <TextField label="Horas ruta" value={selectedRoute?.operations.reduce((sum, item) => sum + item.durationHours, 0).toFixed(1) ?? "0"} slotProps={{ input: { readOnly: true } }} fullWidth />
                </Grid>
                <Grid size={{ xs: 12, sm: 6, lg: 1 }}>
                  <Button type="submit" variant="contained" startIcon={<Add />} sx={{ height: 56 }} fullWidth>Crear</Button>
                </Grid>
                <Grid size={{ xs: 12, md: 4 }}>
                  <TextField select label="Equipo / activo (maestro)" value={newOrder.equipment} onChange={(event) => {
                    const selectedEquipment = readEquipmentMaster().find((item) => item.code === event.target.value);
                    setNewOrder((current) => ({
                      ...current,
                      equipment: event.target.value,
                      contract: selectedEquipment?.contractCode && contracts.some((contract) => contract.code === selectedEquipment.contractCode)
                        ? selectedEquipment.contractCode
                        : current.contract,
                    }));
                  }} required fullWidth>
                    <MenuItem value="">Selecciona un equipo</MenuItem>
                    {equipmentOptions.map((item) => <MenuItem key={item.value} value={item.value}>{item.label}</MenuItem>)}
                  </TextField>
                </Grid>
                <Grid size={{ xs: 12, md: 8 }}>
                  <TextField label="Descripción del trabajo" value={newOrder.description} onChange={(event) => setNewOrder((current) => ({ ...current, description: event.target.value }))} required fullWidth />
                </Grid>
                <Grid size={{ xs: 12 }}>
                  <TextField label="Elemento WBS de imputación" value={selectedPlan?.wbs || currentContract.wbs.find((item) => item.type === newOrder.type)?.code || "Sin WBS para este tipo"} slotProps={{ input: { readOnly: true } }} fullWidth />
                </Grid>
              </Grid>
              {selectedRoute && newOrder.type !== "ESPERA" && (
                <Alert severity="info">
                  <strong>{selectedRoute.name}:</strong>{" "}
                  {selectedRoute.operations.flatMap((item) => item.materials)
                    .map((item) => `${item.code} ${item.name} (${item.quantity} ${item.unit})`)
                    .join(" · ") || "sin materiales definidos"}.
                  {" "}La OT conservará {selectedRoute.operations.length} operaciones y{" "}
                  {selectedRoute.operations.reduce((sum, item) => sum + item.durationHours, 0).toFixed(1)} horas planificadas.
                </Alert>
              )}
            </Stack>
          </Paper>

          <Paper sx={{ p: 3 }}>
            <Stack direction={{ xs: "column", md: "row" }} sx={{ justifyContent: "space-between", alignItems: { xs: "flex-start", md: "center" }, gap: 2, mb: 2 }}>
              <Box>
                <Typography variant="h6">Bandeja de trabajo</Typography>
                <Typography variant="body2" color="text.secondary">
                  {isSupervisor
                    ? "Revisa las órdenes asignadas a tu equipo y asígnalas a los trabajadores a tu cargo."
                    : "El técnico registra su tiempo; el cierre provisorio requiere aprobación de Calidad y cierre administrativo."}
                </Typography>
              </Box>
              {!isSupervisor && <Button startIcon={<Download />} onClick={exportOrderTemplate}>Plantilla CSV de OT</Button>}
            </Stack>
            <Box sx={{ borderBottom: 1, borderColor: "divider", mb: 2 }}>
              <Tabs value={operationsTab} onChange={(_, value: number) => setOperationsTab(value)}>
                <Tab label={`Órdenes Activas (${activeWorkOrders.length})`} value={0} />
                {(isSupervisor || role === "Administrador") && <Tab label={`Órdenes Cerradas (${closedWorkOrders.length})`} value={1} />}
              </Tabs>
            </Box>
            {operationsTab === 0 && (
            <>
            <Table size="small">
              <TableHead><TableRow>
                <TableCell>OT / equipo</TableCell>
                {!isSupervisor && <TableCell>Contrato / WBS</TableCell>}
                <TableCell>Tipo / estado</TableCell>
                <TableCell>{isSupervisor ? "Trabajador asignado" : "Técnico / tarifa"}</TableCell>
                {!isSupervisor && <><TableCell>Tiempo plan / real</TableCell><TableCell align="right">Costo real</TableCell></>}
                <TableCell>Acciones</TableCell>
              </TableRow></TableHead>
              <TableBody>{activeWorkOrders.map((order) => (
                <TableRow key={order.id}>
                  <TableCell>
                    <Typography sx={{ fontWeight: 700 }}>{order.id}</Typography>
                    <Typography variant="caption" color="text.secondary">{order.equipment}</Typography>
                    <Typography sx={{ display: "block" }} variant="caption">{order.description}</Typography>
                    {!isSupervisor && order.routeName && <Typography sx={{ display: "block" }} variant="caption" color="primary.main">Ruta {order.routeId} · {order.routeName}</Typography>}
                    {order.requiredMaterials.length > 0 && <Typography sx={{ display: "block" }} variant="caption" color="text.secondary">Materiales requeridos: {order.requiredMaterials.map((item) => `${item.code} ${item.quantity} ${item.unit ?? ""}`).join(" · ")}</Typography>}
                    {!isSupervisor && order.routeOperations?.map((operation) => (
                      <Typography key={`${order.id}-${operation.order}`} sx={{ display: "block" }} variant="caption" color="text.secondary">
                        {operation.order}. {operation.name} · {operation.durationHours} h
                      </Typography>
                    ))}
                  </TableCell>
                  {!isSupervisor && <TableCell>{order.contract}<Typography sx={{ display: "block" }} variant="caption" color="text.secondary">{order.wbs || "No imputable"}</Typography></TableCell>}
                  <TableCell>
                    {typeLabels[order.type]}
                    <Typography sx={{ display: "block", mt: 0.5 }}><OrderStatusChip status={order.status} /></Typography>
                    {!isSupervisor && order.qualityApproved && <Typography variant="caption" color="success.main">Calidad OK · {order.qualityApprovedBy}</Typography>}
                  </TableCell>
                  <TableCell>
                    {order.technician || "Sin asignar"}
                    {!isSupervisor && <Typography sx={{ display: "block" }} variant="caption" color="text.secondary">{money(order.hourlyRate)}/h</Typography>}
                  </TableCell>
                  {!isSupervisor && <><TableCell>{order.projectedHours.toFixed(1)} h / {durationLabel(order.currentSeconds)}</TableCell><TableCell align="right">{money(allocatedCost(order, stock, order.currentSeconds))}</TableCell></>}
                  <TableCell>
                    <Stack direction="row" sx={{ flexWrap: "wrap", gap: 1 }}>
                      {isSupervisor && assignableTeam.length > 0 && order.status === "Asignada" && (
                        <>
                          <TextField select size="small" label="Asignar a" value={assignmentDrafts[order.id] ?? assignableTeam.find((employee) => employee.name === order.technician)?.id ?? assignableTeam[0].id} onChange={(event) => setAssignmentDrafts((current) => ({ ...current, [order.id]: event.target.value }))}>
                            {assignableTeam.map((employee) => <MenuItem key={employee.id} value={employee.id}>{employee.name}</MenuItem>)}
                          </TextField>
                          <Button size="small" variant="contained" onClick={() => assignOrderToTeamMember(order)}>Asignar</Button>
                        </>
                      )}
                      {!isSupervisor && !order.timerStartedAt && order.status !== "Cerrada" && order.status !== "Cierre provisorio" && <Button size="small" startIcon={<PlayArrow />} onClick={() => startTimer(order.id)}>Iniciar</Button>}
                      {!isSupervisor && order.timerStartedAt && <Button size="small" color="warning" startIcon={<Stop />} onClick={() => stopTimer(order.id)}>Detener</Button>}
                      {!isSupervisor && order.status !== "Cerrada" && order.status !== "Cierre provisorio" && <Button size="small" onClick={() => provisionalClose(order.id)}>Cierre provisorio</Button>}
                      {canCloseOrders && order.status === "Cierre provisorio" && <Button size="small" variant="contained" color="success" onClick={() => supervisorClose(order.id)}>Cerrar OT</Button>}
                    </Stack>
                    {!isSupervisor && order.supervisorClosedBy && <Typography variant="caption">Cerró: {order.supervisorClosedBy}</Typography>}
                  </TableCell>
                </TableRow>
              ))}</TableBody>
            </Table>
            {!isSupervisor && activeOrder && <Alert severity="info" sx={{ mt: 2 }}>Cronómetro activo: {activeOrder.id} · {durationLabel(visibleOrders.find((order) => order.id === activeOrder.id)?.currentSeconds ?? 0)}.</Alert>}
            {activeWorkOrders.length === 0 && <Alert severity="info" sx={{ mt: 2 }}>No hay órdenes activas en este momento.</Alert>}
            </>
            )}
            
            {operationsTab === 1 && (isSupervisor || role === "Administrador") && (
            <Box>
              {closedWorkOrders.length === 0 ? (
                <Alert severity="info">No hay órdenes cerradas.</Alert>
              ) : (
                <Table size="small">
                  <TableHead><TableRow><TableCell>OT</TableCell><TableCell>Equipo / trabajo</TableCell><TableCell>Contrato / WBS</TableCell><TableCell>Técnico</TableCell><TableCell>Costos reales</TableCell><TableCell>Cerrado por</TableCell><TableCell>Fecha/Hora</TableCell><TableCell>Historial</TableCell><TableCell>Acción</TableCell></TableRow></TableHead>
                  <TableBody>{closedWorkOrders.map((order) => (
                    <TableRow key={order.id} sx={{ opacity: 0.7, backgroundColor: "#f5f5f5" }}>
                      <TableCell>{order.id}</TableCell>
                      <TableCell>{order.equipment}<Typography variant="caption" sx={{ display: "block" }}>{order.description}</Typography></TableCell>
                      <TableCell>{order.contract}<Typography variant="caption" sx={{ display: "block" }}>{order.wbs}</Typography></TableCell>
                      <TableCell>{order.technician}</TableCell>
                      <TableCell>{money(allocatedCost(order, stock, order.currentSeconds))}</TableCell>
                      <TableCell>{order.closedBy ?? "—"}</TableCell>
                      <TableCell>{order.closedAt ? new Intl.DateTimeFormat("es-CL", { dateStyle: "short", timeStyle: "short" }).format(new Date(order.closedAt)) : "—"}</TableCell>
                      <TableCell>
                        {order.statusHistory && order.statusHistory.length > 0 ? (
                          <Stack spacing={0.5}>
                            {order.statusHistory.map((record, idx) => (
                              <Typography key={idx} variant="caption" sx={{ display: "block" }}>
                                {record.previousStatus} → {record.newStatus}
                                {record.reason && ` (${record.reason})`}
                              </Typography>
                            ))}
                          </Stack>
                        ) : "—"}
                      </TableCell>
                      <TableCell>
                        {isSupervisor && (
                          <Button size="small" variant="outlined" onClick={() => {
                            setReopenOrderId(order.id);
                            setReopenModalOpen(true);
                            setReopenReason("");
                          }}>
                            Reabrir
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}</TableBody>
                </Table>
              )}
            </Box>
            )}
          </Paper>
          {!isSupervisor && operationsTab === 0 && <Alert severity="info">El cierre final requiere aprobación de Calidad y luego un Administrador.</Alert>}
        </Stack>
      )}

      {tab === 5 && canCloseOrders && scope === "operations" && (
        <Paper sx={{ p: 3 }}>
          <Typography variant="h6" sx={{ mb: 2 }}>Órdenes cerradas · archivo de Supervisor</Typography>
          {closedWorkOrders.length === 0 ? (
            <Alert severity="info">No hay órdenes cerradas.</Alert>
          ) : (
            <Table size="small">
              <TableHead><TableRow><TableCell>OT</TableCell><TableCell>Equipo / trabajo</TableCell><TableCell>Contrato / WBS</TableCell><TableCell>Técnico</TableCell><TableCell>Costos reales</TableCell><TableCell>Cerrado por</TableCell><TableCell>Fecha/Hora</TableCell><TableCell>Acción</TableCell></TableRow></TableHead>
              <TableBody>{closedWorkOrders.map((order) => (
                <TableRow key={order.id} sx={{ opacity: 0.6, backgroundColor: "#f5f5f5" }}>
                  <TableCell>{order.id}</TableCell><TableCell>{order.equipment}<Typography variant="caption" sx={{ display: "block" }}>{order.description}</Typography></TableCell>
                  <TableCell>{order.contract}<Typography variant="caption" sx={{ display: "block" }}>{order.wbs}</Typography></TableCell>
                  <TableCell>{order.technician}</TableCell><TableCell>{money(allocatedCost(order, stock, order.currentSeconds))}</TableCell>
                  <TableCell>{order.closedBy ?? "—"}</TableCell>
                  <TableCell>{order.closedAt ? new Intl.DateTimeFormat("es-CL", { dateStyle: "short", timeStyle: "short" }).format(new Date(order.closedAt)) : "—"}</TableCell>
                  <TableCell>
                    {isSupervisor && (
                      <Button size="small" variant="outlined" onClick={() => {
                        setReopenOrderId(order.id);
                        setReopenModalOpen(true);
                        setReopenReason("");
                      }}>
                        Reabrir
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}</TableBody>
            </Table>
          )}
        </Paper>
      )}

      {tab === 0 && isSupervisor && scope === "operations" && supervisorOrdersPanel}

      {tab === 6 && isSupervisor && scope === "team" && (
        <Stack spacing={3}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" sx={{ mb: 2 }}>Personal a cargo</Typography>
            {!supervisorEmployee ? (
              <Alert severity="warning">Esta cuenta no está vinculada a un supervisor. Solicita al Administrador que configure el usuario en Recursos Humanos.</Alert>
            ) : supervisorTeam.length === 0 ? (
              <Alert severity="info">No hay trabajadores asignados a {supervisorEmployee.name}.</Alert>
            ) : (
              <Table size="small">
                <TableHead><TableRow><TableCell>Trabajador</TableCell><TableCell>Cargo / especialidad</TableCell><TableCell>Contratos asignados</TableCell></TableRow></TableHead>
                <TableBody>{supervisorTeam.map((employee) => (
                  <TableRow key={employee.id}>
                    <TableCell>{employee.name}</TableCell>
                    <TableCell>{employee.position}</TableCell>
                    <TableCell>{(employee.contractCodes?.length ? employee.contractCodes : employee.contractCode ? [employee.contractCode] : []).join(", ") || "—"}</TableCell>
                  </TableRow>
                ))}</TableBody>
              </Table>
            )}
          </Paper>
          {supervisorOrdersPanel}
        </Stack>
      )}

      {tab === 1 && (
        <Stack spacing={3}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6">{contracts[0].code} · {contracts[0].customer}</Typography>
            <Typography color="text.secondary">{contracts[0].description}</Typography>
            <Divider sx={{ my: 2 }} />
            <Table size="small">
              <TableHead><TableRow><TableCell>Elemento WBS</TableCell><TableCell>Alcance</TableCell><TableCell align="right">Presupuesto</TableCell><TableCell align="right">Real</TableCell><TableCell align="right">Comprometido</TableCell><TableCell align="right">Proyección a término</TableCell><TableCell align="right">Saldo proyectado</TableCell></TableRow></TableHead>
              <TableBody>{totalsByWbs.map(({ element, actual, committed, projected, linked }) => (
                <TableRow key={element.code}>
                  <TableCell><Typography sx={{ fontWeight: 700 }}>{element.code}</Typography></TableCell>
                  <TableCell>{element.description}<Typography sx={{ display: "block" }} variant="caption" color="text.secondary">{linked} OT vinculadas</Typography></TableCell>
                  <TableCell align="right">{money(element.budget)}</TableCell>
                  <TableCell align="right">{money(actual)}</TableCell>
                  <TableCell align="right">{money(committed)}</TableCell>
                  <TableCell align="right">{money(projected)}</TableCell>
                  <TableCell align="right" sx={{ color: projected > element.budget ? "error.main" : "success.main" }}>{money(element.budget - projected)}</TableCell>
                </TableRow>
              ))}</TableBody>
            </Table>
          </Paper>
          <Alert severity="info">
            Real = horas ya registradas + materiales consumidos. Comprometido = materiales pendientes de consumir en OT abiertas. Proyección = horas planificadas + todos los materiales de las OT. Son cifras demo, no asientos contables.
          </Alert>
        </Stack>
      )}

      {tab === 2 && isSupervisor && scope === "warehouse" && (
        <Stack spacing={2}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" sx={{ mb: 1 }}>Stock disponible para uso</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Solo se muestran materiales en estado Libre utilización, descontando las cantidades reservadas.
            </Typography>
            <TextField
              label="Buscar material, almacén o ubicación"
              value={stockFilter}
              onChange={(event) => setStockFilter(event.target.value)}
              fullWidth
              sx={{ mb: 2 }}
            />
            {supervisorAvailableStock.length === 0 ? (
              <Alert severity="info">No hay stock disponible para uso que coincida con la búsqueda.</Alert>
            ) : (
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Material</TableCell>
                    <TableCell>Almacén</TableCell>
                    <TableCell>Ubicación</TableCell>
                    <TableCell align="right">Disponible</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {supervisorAvailableStock.map((bin) => (
                    <TableRow key={bin.id}>
                      <TableCell>{bin.code} · {bin.name}{bin.sourceBins.length > 1 && <Typography variant="caption" sx={{ display: "block" }}>{bin.sourceBins.length} registros acumulados</Typography>}</TableCell>
                      <TableCell>{bin.warehouse}</TableCell>
                      <TableCell>{bin.location}</TableCell>
                      <TableCell align="right">{bin.quantity - bin.reserved} {bin.unit}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Paper>
        </Stack>
      )}

      {tab === 2 && !(isSupervisor && scope === "warehouse") && (
        <Stack spacing={3}>
          {isSupervisor && (
            <Paper sx={{ p: 3 }}>
              <Typography variant="h6" sx={{ mb: 2 }}>Personal a cargo</Typography>
              {!supervisorEmployee ? (
                <Alert severity="warning">Esta cuenta no está vinculada a un supervisor en Recursos Humanos. Pide al Administrador que configure el usuario del supervisor antes de asignar OT.</Alert>
              ) : supervisorTeam.length === 0 ? (
                <Alert severity="info">No hay trabajadores asignados a {supervisorEmployee.name}.</Alert>
              ) : (
                <Table size="small">
                  <TableHead><TableRow><TableCell>Trabajador</TableCell><TableCell>Cargo / especialidad</TableCell><TableCell>Contratos asignados</TableCell></TableRow></TableHead>
                  <TableBody>{supervisorTeam.map((employee) => (
                    <TableRow key={employee.id}>
                      <TableCell>{employee.name}</TableCell>
                      <TableCell>{employee.position}</TableCell>
                      <TableCell>{(employee.contractCodes?.length ? employee.contractCodes : employee.contractCode ? [employee.contractCode] : []).join(", ") || "—"}</TableCell>
                    </TableRow>
                  ))}</TableBody>
                </Table>
              )}
            </Paper>
          )}
          <Paper sx={{ p: 3 }}>
            <Stack direction={{ xs: "column", md: "row" }} sx={{ justifyContent: "space-between", alignItems: { xs: "flex-start", md: "center" }, gap: 2, mb: 2 }}>
              <Box>
                <Typography variant="h6">Picking por OT · secuencia de ubicación</Typography>
                <Typography variant="body2" color="text.secondary">El stock se reserva primero y solo se descuenta al confirmar el consumo contra la OT/WBS.</Typography>
              </Box>
              <Stack direction="row" sx={{ flexWrap: "wrap", gap: 1 }}>
                <Button startIcon={<Download />} onClick={exportWarehouseTemplate}>Plantilla CSV</Button>
                {role === "Administrador" && <Button component="label" variant="outlined" startIcon={<Add />}>
                  Importar saldos
                  <input hidden type="file" accept=".csv,text/csv" onChange={importWarehouseCsv} />
                </Button>}
              </Stack>
            </Stack>
            {warehouseImportMessage && <Alert severity="success" sx={{ mb: 2 }}>{warehouseImportMessage}</Alert>}
            {warehouseImportError && <Alert severity="error" sx={{ mb: 2 }}>{warehouseImportError}</Alert>}
            <Grid container spacing={2} sx={{ mb: 2 }}>
              {[
                { label: "Materiales disponibles", value: `${availableMaterials} códigos` },
                { label: "Lotes en inspección QC", value: `${qualityLots} lotes` },
                { label: "Órdenes de compra en tránsito", value: `${openPurchaseOrders} OC` },
                { label: "Pendiente de ubicación", value: `${pendingPutawayBins.length} lotes` },
                { label: "Valorización física demo", value: money(physicalInventoryValue) },
              ].map((item) => (
                <Grid size={{ xs: 12, sm: 6, lg: 3 }} key={item.label}>
                  <Paper variant="outlined" sx={{ p: 2 }}>
                    <Typography variant="body2" color="text.secondary">{item.label}</Typography>
                    <Typography variant="h6" sx={{ mt: 0.5 }}>{item.value}</Typography>
                  </Paper>
                </Grid>
              ))}
            </Grid>
            <Paper variant="outlined" sx={{ mb: 2 }}>
              <Table size="small">
                <TableHead><TableRow><TableCell>OT</TableCell><TableCell>Equipo / contrato</TableCell><TableCell>Componentes</TableCell><TableCell>Estado picking</TableCell><TableCell /></TableRow></TableHead>
                <TableBody>{availableOrders.map((order) => (
                  <TableRow key={order.id} selected={selectedWarehouseOrder?.id === order.id}>
                    <TableCell>{order.id}</TableCell><TableCell>{order.equipment}<Typography variant="caption" sx={{ display: "block" }}>{order.contract} / {order.wbs}</Typography></TableCell>
                    <TableCell>{order.requiredMaterials.length} materiales</TableCell><TableCell>{order.reservedPicks?.length ? "Reservado" : "Pendiente"}</TableCell>
                    <TableCell><Button size="small" onClick={() => setSelectedWarehouseOrderId(order.id)}>Abrir picking</Button></TableCell>
                  </TableRow>
                ))}</TableBody>
              </Table>
            </Paper>
            {selectedWarehouseOrder && (
              <Paper className="picking-print-area" variant="outlined" sx={{ p: 2, mb: 2 }}>
                <Stack direction={{ xs: "column", sm: "row" }} sx={{ justifyContent: "space-between", alignItems: { sm: "center" }, gap: 1, mb: 1 }}>
                  <Box><Typography variant="h6">Picking · {selectedWarehouseOrder.id}</Typography><Typography variant="caption" color="text.secondary">{selectedWarehouseOrder.equipment} · {selectedWarehouseOrder.contract} / {selectedWarehouseOrder.wbs}</Typography></Box>
                  <Stack direction="row" spacing={1}><Button onClick={() => exportPicking(selectedWarehouseOrder)}>Exportar CSV</Button><Button onClick={() => window.print()}>Imprimir</Button></Stack>
                </Stack>
                <Table size="small">
                  <TableHead><TableRow><TableCell>Ubicación lógica</TableCell><TableCell>Material</TableCell><TableCell align="right">Requerido</TableCell><TableCell align="right">Reservado</TableCell><TableCell>Cantidad tomada</TableCell></TableRow></TableHead>
                  <TableBody>{warehousePickRows.map((item) => (
                    <TableRow key={item.code}>
                      <TableCell>{item.locations || "Sin stock disponible"}</TableCell><TableCell>{item.code} · {item.name}</TableCell>
                      <TableCell align="right">{item.remaining} {item.unit}</TableCell><TableCell align="right">{item.reserved || item.planned} {item.unit}</TableCell>
                      <TableCell><TextField size="small" type="number" value={pickingTaken[`${selectedWarehouseOrder.id}:${item.code}`] ?? ""} disabled={isSupervisor} onChange={(event) => setPickingTaken((current) => ({ ...current, [`${selectedWarehouseOrder.id}:${item.code}`]: event.target.value }))} slotProps={{ htmlInput: { min: 0, max: item.remaining, step: "any" } }} sx={{ width: 130 }} /></TableCell>
                    </TableRow>
                  ))}</TableBody>
                </Table>
                <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
                  {role !== "Supervisor" && <>
                    <Button size="small" disabled={!canChangePicking} onClick={() => preparePicking(selectedWarehouseOrder)}>Preparar picking</Button>
                    <Button size="small" variant="contained" disabled={!selectedWarehouseOrder.reservedPicks?.length || !canChangePicking} onClick={() => confirmConsumption(selectedWarehouseOrder)}>Confirmar cantidades tomadas</Button>
                    <Button size="small" color="warning" disabled={!selectedWarehouseOrder.reservedPicks?.length || !canChangePicking} onClick={() => releasePicking(selectedWarehouseOrder)}>Liberar reserva</Button>
                  </>}
                </Stack>
              </Paper>
            )}
            <Alert severity="info">La zona REC-UBICAR no se considera disponible para picking hasta que se asigne un pasillo/estante. El stock en inspección o tránsito tampoco se puede retirar.</Alert>
          </Paper>

          <Paper sx={{ p: 3 }}>
            <Stack spacing={2}>
              <Box>
                <Typography variant="h6">Recepción de OC y consulta de inventario</Typography>
                <Typography variant="body2" color="text.secondary">La recepción reduce el saldo en tránsito y lo mueve a Calidad o zona de ubicación, conservando el número de OC.</Typography>
              </Box>
              <Stack component="form" direction={{ xs: "column", lg: "row" }} spacing={1} onSubmit={receivePurchase}>
                <TextField select label="Orden de compra / tránsito" value={selectedTransitLine?.reference ?? ""} onChange={(event) => {
                  const line = transitLines.find((bin) => bin.reference === event.target.value);
                  setReceipt((current) => ({ ...current, purchaseOrder: event.target.value, code: line?.code ?? current.code }));
                }} disabled={!canReceive || transitLines.length === 0} sx={{ minWidth: 230 }}>
                  {transitLines.map((bin) => <MenuItem key={`${bin.reference}-${bin.id}`} value={bin.reference}>{bin.reference} · {bin.code} · quedan {bin.quantity} {bin.unit}</MenuItem>)}
                </TextField>
                <TextField label="Material" value={selectedTransitLine?.name ?? receipt.code} slotProps={{ input: { readOnly: true } }} />
                <TextField label="Cantidad recibida" type="number" value={receipt.quantity} disabled={isSupervisor} onChange={(event) => setReceipt((current) => ({ ...current, quantity: event.target.value }))} slotProps={{ htmlInput: { min: 1, max: selectedTransitLine?.quantity ?? 1, step: 1 } }} />
                <TextField select label="Inspección de Calidad" value={receipt.qualityHold ? "hold" : "release"} disabled={isSupervisor} onChange={(event) => setReceipt((current) => ({ ...current, qualityHold: event.target.value === "hold" }))}>
                  <MenuItem value="hold">Bloquear hasta inspección</MenuItem>
                  <MenuItem value="release">Sin inspección obligatoria</MenuItem>
                </TextField>
                <Button type="submit" variant="contained" disabled={!canReceive || !selectedTransitLine}>Registrar recepción</Button>
              </Stack>
              {!canReceive && <Alert severity="info">La recepción desde OC está habilitada para Compras y Administrador.</Alert>}
              <TextField label="Buscar por material, almacén, ubicación, estado u OC" value={stockFilter} onChange={(event) => setStockFilter(event.target.value)} />
              <Table size="small">
                <TableHead><TableRow><TableCell>Material / lote</TableCell><TableCell>Almacén / ubicación</TableCell><TableCell>Estado</TableCell><TableCell align="right">Físico</TableCell><TableCell align="right">Reservado</TableCell><TableCell align="right">Disponible</TableCell>{!isSupervisor && <TableCell align="right">Costo unit.</TableCell>}<TableCell>Acción</TableCell></TableRow></TableHead>
                <TableBody>{visibleStock.map((bin) => (
                  <TableRow key={bin.id}>
                    <TableCell>{bin.code} · {bin.name}<Typography variant="caption" sx={{ display: "block" }}>{bin.sourceBins.length > 1 ? `${bin.sourceBins.length} registros acumulados` : bin.reference ?? bin.id}</Typography></TableCell>
                    <TableCell>{bin.warehouse} · {bin.location}</TableCell>
                    <TableCell><Chip size="small" label={bin.status} color={bin.status === "Libre utilización" ? "success" : bin.status === "Bloqueado calidad" ? "warning" : "info"} /></TableCell>
                    <TableCell align="right">{bin.quantity} {bin.unit}</TableCell>
                    <TableCell align="right">{bin.reserved} {bin.unit}</TableCell>
                    <TableCell align="right">{bin.status === "Libre utilización" && isPickableLocation(bin.location) ? bin.quantity - bin.reserved : 0} {bin.unit}</TableCell>
                    {!isSupervisor && <TableCell align="right">{money(bin.unitCost)}</TableCell>}
                    <TableCell>
                      {bin.status === "Bloqueado calidad" && (role === "Calidad" || role === "Administrador")
                        ? <Button size="small" onClick={() => bin.sourceBins.forEach((sourceBin) => releaseQualityStock(sourceBin.id))}>Liberar QC</Button>
                        : bin.status === "Libre utilización" && bin.location === "REC-UBICAR" && canPutaway
                          ? <Stack direction="row" spacing={1}><TextField size="small" label="Ubicación" value={putawayLocations[bin.id] ?? ""} onChange={(event) => setPutawayLocations((current) => ({ ...current, [bin.id]: event.target.value }))} /><Button size="small" onClick={() => putawayStockGroup(bin)}>Ubicar</Button></Stack>
                          : "—"}
                    </TableCell>
                  </TableRow>
                ))}</TableBody>
              </Table>
              {visibleStock.length === 0 && <Alert severity="info">No hay ubicaciones que coincidan con la búsqueda.</Alert>}
            </Stack>
          </Paper>
        </Stack>
      )}

      {tab === 3 && (
        <Stack spacing={3}>
          <Paper sx={{ p: 3 }}>
            <Stack spacing={2}>
              <Box>
                <Typography variant="h6">Conteo cíclico y ajustes</Typography>
                <Typography variant="body2" color="text.secondary">Registra la cantidad física contada por ubicación. Las reservas existentes quedan protegidas.</Typography>
              </Box>
              <Stack component="form" direction={{ xs: "column", md: "row" }} spacing={1} onSubmit={performCycleCount}>
                <TextField select label="Material / ubicación" value={cycleCount.binId || countableBins[0]?.id || ""} onChange={(event) => setCycleCount((current) => ({ ...current, binId: event.target.value }))} disabled={!canCount || countableBins.length === 0} sx={{ minWidth: 300 }}>
                  {countableBins.map((bin) => <MenuItem key={bin.id} value={bin.id}>{bin.code} · {bin.warehouse}/{bin.location} · sistema {bin.quantity}</MenuItem>)}
                </TextField>
                <TextField label="Cantidad contada" type="number" value={cycleCount.countedQuantity} onChange={(event) => setCycleCount((current) => ({ ...current, countedQuantity: event.target.value }))} slotProps={{ htmlInput: { min: 0, step: 1 } }} />
                <Button type="submit" variant="contained" disabled={!canCount}>Aplicar conteo</Button>
                {role === "Administrador" && <Button component="label" variant="outlined">
                  Importar saldos CSV
                  <input hidden type="file" accept=".csv,text/csv" onChange={importWarehouseCsv} />
                </Button>}
              </Stack>
              <Divider />
              <Typography variant="h6">Traslado entre almacenes</Typography>
              <Stack component="form" direction={{ xs: "column", md: "row" }} spacing={1} onSubmit={performTransfer}>
                <TextField select label="Stock origen" value={transfer.binId || transferableBins[0]?.id || ""} onChange={(event) => setTransfer((current) => ({ ...current, binId: event.target.value }))} disabled={!canPutaway || transferableBins.length === 0} sx={{ minWidth: 300 }}>
                  {transferableBins.map((bin) => <MenuItem key={bin.id} value={bin.id}>{bin.code} · {bin.warehouse}/{bin.location} · libre {bin.quantity - bin.reserved}</MenuItem>)}
                </TextField>
                <TextField label="Cantidad" type="number" value={transfer.quantity} onChange={(event) => setTransfer((current) => ({ ...current, quantity: event.target.value }))} slotProps={{ htmlInput: { min: 1, step: 1 } }} />
                <TextField select label="Destino" value={transfer.toQuality ? "quality" : "warehouse"} onChange={(event) => setTransfer((current) => ({ ...current, toQuality: event.target.value === "quality" }))}>
                  <MenuItem value="warehouse">Almacén / ubicación</MenuItem><MenuItem value="quality">Almacén Calidad · inspección</MenuItem>
                </TextField>
                {!transfer.toQuality && <>
                  <TextField label="Almacén destino" value={transfer.warehouse} onChange={(event) => setTransfer((current) => ({ ...current, warehouse: event.target.value }))} />
                  <TextField label="Ubicación destino" value={transfer.location} onChange={(event) => setTransfer((current) => ({ ...current, location: event.target.value }))} />
                </>}
                <Button type="submit" variant="contained" disabled={!canPutaway}>Trasladar</Button>
              </Stack>
            </Stack>
          </Paper>

          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" sx={{ mb: 2 }}>Kardex · últimos movimientos</Typography>
            <Table size="small">
              <TableHead><TableRow><TableCell>Fecha</TableCell><TableCell>Movimiento</TableCell><TableCell>Material</TableCell><TableCell align="right">Cantidad</TableCell><TableCell>Origen → destino</TableCell><TableCell>Referencia</TableCell><TableCell>Usuario</TableCell></TableRow></TableHead>
              <TableBody>{movements.slice(0, 100).map((movement) => (
                <TableRow key={movement.id}>
                  <TableCell>{new Intl.DateTimeFormat("es-CL", { dateStyle: "short", timeStyle: "short" }).format(new Date(movement.date))}</TableCell>
                  <TableCell>{movement.type}</TableCell>
                  <TableCell>{movement.code}</TableCell>
                  <TableCell align="right">{movement.quantity}</TableCell>
                  <TableCell>{movement.from} → {movement.to}</TableCell>
                  <TableCell>{movement.reference}</TableCell>
                  <TableCell>{movement.user}</TableCell>
                </TableRow>
              ))}</TableBody>
            </Table>
            {movements.length === 0 && <Alert severity="info" sx={{ mt: 2 }}>Los movimientos que registres aparecerán aquí. Los saldos demo iniciales no tienen historia anterior.</Alert>}
          </Paper>
        </Stack>
      )}

      {tab === 4 && (
        <Stack spacing={3}>
          <Alert severity={canInspect ? "info" : "warning"}>
            {canInspect
              ? "Calidad valida el checklist de la OT y libera lotes bloqueados. El cierre final queda a cargo del Supervisor."
              : "Vista de consulta: solo Calidad o Administrador puede cambiar checklist y liberar materiales."}
          </Alert>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" sx={{ mb: 2 }}>Lista de inspecciones</Typography>
            {qualityOrders.length === 0 ? <Alert severity="success">No hay órdenes pendientes de inspección.</Alert> : (
              <Table size="small">
                <TableHead><TableRow><TableCell>OT</TableCell><TableCell>Equipo</TableCell><TableCell>Contrato</TableCell><TableCell>Estado</TableCell><TableCell>Checklist</TableCell><TableCell /></TableRow></TableHead>
                <TableBody>{qualityOrders.map((order) => (
                  <TableRow key={order.id} selected={selectedQualityOrder?.id === order.id}>
                    <TableCell>{order.id}</TableCell><TableCell>{order.equipment}</TableCell><TableCell>{order.contract}</TableCell>
                    <TableCell><OrderStatusChip status={order.status} /></TableCell>
                    <TableCell>{qualityCheckItems.filter((item) => order.qualityChecklist?.[item]).length}/{qualityCheckItems.length}</TableCell>
                    <TableCell><Button size="small" onClick={() => setSelectedQualityOrderId(order.id)}>Abrir</Button></TableCell>
                  </TableRow>
                ))}</TableBody>
              </Table>
            )}
            {selectedQualityOrder && (
              <Paper variant="outlined" sx={{ p: 2, mt: 2 }}>
                <Typography sx={{ fontWeight: 700 }}>{selectedQualityOrder.id} · {selectedQualityOrder.equipment}</Typography>
                <Typography variant="caption" color="text.secondary">{selectedQualityOrder.contract} / {selectedQualityOrder.wbs}</Typography>
                {qualityCheckItems.map((item) => (
                  <FormControlLabel key={`${selectedQualityOrder.id}-${item}`} control={<Checkbox checked={Boolean(selectedQualityOrder.qualityChecklist?.[item])} disabled={!canInspect} onChange={(event) => updateQualityCheck(selectedQualityOrder.id, item, event.target.checked)} />} label={item} />
                ))}
                <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "center", mt: 1 }}>
                  <Typography variant="caption" color={selectedQualityOrder.qualityApproved ? "success.main" : "text.secondary"}>
                    {selectedQualityOrder.qualityApproved ? `Aprobada por ${selectedQualityOrder.qualityApprovedBy}` : "Pendiente de aprobación"}
                  </Typography>
                  <Button variant="contained" size="small" disabled={!canInspect || selectedQualityOrder.status !== "Cierre provisorio" || selectedQualityOrder.qualityApproved || !qualityCheckItems.every((item) => selectedQualityOrder.qualityChecklist?.[item])} onClick={() => approveQuality(selectedQualityOrder)}>Aprobar checklist</Button>
                </Stack>
              </Paper>
            )}
          </Paper>

          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" sx={{ mb: 1 }}>Materiales en espera de Calidad</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>La liberación cambia su estado a libre utilización, pero permanece fuera de picking hasta asignar ubicación física.</Typography>
            <Table size="small">
              <TableHead><TableRow><TableCell>Material</TableCell><TableCell>Ubicación</TableCell><TableCell>OC / referencia</TableCell><TableCell align="right">Cantidad</TableCell><TableCell>Acción</TableCell></TableRow></TableHead>
              <TableBody>{stock.filter((bin) => bin.status === "Bloqueado calidad").map((bin) => (
                <TableRow key={bin.id}>
                  <TableCell>{bin.code} · {bin.name}</TableCell>
                  <TableCell>{bin.warehouse} · {bin.location}</TableCell>
                  <TableCell>{bin.reference ?? bin.id}</TableCell>
                  <TableCell align="right">{bin.quantity} {bin.unit}</TableCell>
                  <TableCell>{canInspect
                    ? <Button size="small" onClick={() => releaseQualityStock(bin.id)}>Liberar lote</Button>
                    : "Solo consulta"}
                  </TableCell>
                </TableRow>
              ))}</TableBody>
            </Table>
            {stock.every((bin) => bin.status !== "Bloqueado calidad") &&
              <Alert severity="success" sx={{ mt: 2 }}>No quedan lotes bloqueados por Calidad.</Alert>}
          </Paper>
        </Stack>
      )}

      <Dialog open={reopenModalOpen} onClose={() => {
        setReopenModalOpen(false);
        setReopenOrderId("");
        setReopenReason("");
      }} maxWidth="sm" fullWidth>
        <DialogTitle>Reapertura de Orden de Trabajo</DialogTitle>
        <DialogContent sx={{ pt: 2 }}>
          <Stack spacing={2}>
            <Box>
              <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                Orden: {reopenOrderId}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Especifica el motivo de la reapertura para auditoría
              </Typography>
            </Box>
            <TextField
              fullWidth
              multiline
              minRows={3}
              label="Motivo de reapertura"
              placeholder="Ej: Se encontró defecto en prueba de calidad, se requiere reproceso"
              value={reopenReason}
              onChange={(event) => setReopenReason(event.target.value)}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => {
            setReopenModalOpen(false);
            setReopenOrderId("");
            setReopenReason("");
          }}>Cancelar</Button>
          <Button
            variant="contained"
            onClick={() => {
              reopenOrder(reopenOrderId, reopenReason);
              setReopenModalOpen(false);
              setReopenOrderId("");
              setReopenReason("");
            }}
            disabled={!reopenReason.trim()}
          >
            Reabrir OT
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
