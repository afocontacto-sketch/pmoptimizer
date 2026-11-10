import { allowedOrderTypes, can } from "../app/permissions";
import type { Role } from "../app/roles";
import { appendAudit } from "./audit";
import type { RouteOperation } from "../modules/maintenanceData";
import { keys } from "./keys";
import { fail, ok } from "./result";
import type { Result } from "./result";
import { nextDocNumber, orderTypeSeries } from "./docNumbering";
import { readJson, runAtomic, updateJson } from "./storage";
import type { OrderType } from "./docNumbering";

export type { OrderType } from "./docNumbering";

export type OrderStatus = "Sin asignar" | "Asignada" | "En ejecución" | "Cierre provisorio" | "Cerrada";
export type OrderPriority = "Alta" | "Media" | "Baja";
export type PickingStatus = "Sin picking" | "Picking parcial" | "Picking completo";

export type OrderAssignee = { employeeId: string; name: string };

// required = cantidad pedida; picked = cantidad ya entregada por picking.
export type OrderLine = {
  code: string;
  name?: string;
  unit?: string;
  required: number;
  picked: number;
  unitCostAvg?: number;
};

export type StatusChangeRecord = {
  date: string;
  previousStatus: OrderStatus;
  newStatus: OrderStatus;
  user: string;
  reason?: string;
};

export type WorkOrder = {
  id: string;
  type: OrderType;
  contract: string;
  wbs: string;
  planId?: string;
  plannedCallId?: string;
  routeId?: string;
  routeName?: string;
  routeOperations?: RouteOperation[];
  equipment: string;
  description: string;
  dueDate: string;
  priority?: OrderPriority;
  assignees: OrderAssignee[];
  projectedHours: number;
  projectedLaborCost?: number;
  status: OrderStatus;
  materials: OrderLine[];
  pickingStatus: PickingStatus;
  qualityChecklist?: Record<string, boolean>;
  qualityApproved?: boolean;
  qualityApprovedBy?: string | null;
  qualityApprovedAt?: string;
  closedAt?: string;
  closedBy?: string;
  statusHistory: StatusChangeRecord[];
  createdAt: string;
  createdBy: string;
};

// Regla (Q7, se implementa en E3.3): un técnico no puede tener dos operaciones con tiempo abierto.
// Al iniciar otra, la entrada abierta se cierra sola (pausa) en lugar de fallar.
export type TimeEntry = {
  id: string;
  orderId: string;
  orderType: OrderType;
  wbs: string;
  operationOrder: number;
  operationName: string;
  employeeId: string;
  employeeName: string;
  start: string;
  end: string | null;
  hourlyRate: number;
};

export const typeLabels: Record<OrderType, string> = {
  PRE: "Preventivo",
  OVH: "Overhaul",
  COR: "Correctivo",
  GAR: "Garantía",
  REP: "Reparaciones",
  ESPERA: "Espera / no productiva",
};

export const orderTypeColors: Record<OrderType, string> = {
  PRE: "#16a34a",
  COR: "#dc2626",
  OVH: "#2563eb",
  GAR: "#9333ea",
  REP: "#ea580c",
  ESPERA: "#64748b",
};

export function readOrderRecords(): WorkOrder[] {
  return readJson<WorkOrder[]>(keys.workOrders, []);
}

export function readTimeEntries(): TimeEntry[] {
  return readJson<TimeEntry[]>(keys.timeEntries, []);
}

export function entryDurationHours(entry: TimeEntry, nowMs: number): number {
  const end = entry.end ? Date.parse(entry.end) : nowMs;
  return Math.max(0, (end - Date.parse(entry.start)) / 3600000);
}

// Costo imputado = mano de obra (timeEntries x tarifa) + material entregado x costo medio.
export function allocatedCost(order: WorkOrder, entries: TimeEntry[], nowMs: number): number {
  const labor = entries
    .filter((entry) => entry.orderId === order.id)
    .reduce((sum, entry) => sum + entryDurationHours(entry, nowMs) * entry.hourlyRate, 0);
  const material = order.materials.reduce((sum, line) => sum + line.picked * (line.unitCostAvg ?? 0), 0);
  return labor + material;
}

// ---------------------------------------------------------------------------
// Mutaciones (E3): reciben { user, role }, validan can() y reglas antes de escribir y devuelven Result.
// ---------------------------------------------------------------------------
export type Actor = { user: string; role: Role };

export type NewWorkOrderInput =
  Pick<WorkOrder, "type" | "contract" | "wbs" | "equipment" | "description" | "dueDate" | "projectedHours"> &
  Partial<Pick<WorkOrder, "planId" | "plannedCallId" | "routeId" | "routeName" | "routeOperations" | "priority" |
    "assignees" | "projectedLaborCost" | "materials">>;

const orderKeys = [keys.workOrders, keys.timeEntries, keys.auditLog];
const isoDay = /^\d{4}-\d{2}-\d{2}$/;

function readOrdersRaw(): WorkOrder[] {
  const value = readJson<unknown>(keys.workOrders, []);
  return Array.isArray(value) ? (value as WorkOrder[]) : [];
}

function saveOrders(fn: (orders: WorkOrder[]) => WorkOrder[]): boolean {
  return updateJson<WorkOrder[]>(keys.workOrders, [], (current) => fn(Array.isArray(current) ? current : [])) !== null;
}

export function createWorkOrder(input: NewWorkOrderInput, actor: Actor): Result<WorkOrder> {
  if (!can(actor.role, "order.create")) return fail("Tu rol no tiene permiso para crear órdenes de trabajo.");
  if (!allowedOrderTypes(actor.role).includes(input.type)) {
    return fail(`El rol ${actor.role} no puede crear órdenes de tipo ${input.type}.`);
  }
  if (!input.contract.trim()) return fail("Selecciona el contrato de la OT.");
  if (!input.wbs.trim()) return fail("El contrato seleccionado no tiene un WBS configurado para este tipo de OT.");
  if (input.type === "GAR" && !input.wbs.toUpperCase().endsWith("-GAR")) {
    return fail("Una OT de garantía debe imputarse a un elemento WBS de garantía (-GAR).");
  }
  if (!input.equipment.trim() || !input.description.trim()) return fail("Completa equipo y descripción de la OT.");
  if (!isoDay.test(input.dueDate) || Number.isNaN(Date.parse(input.dueDate))) {
    return fail("La fecha programada (dueDate) es obligatoria.");
  }
  if (!Number.isFinite(input.projectedHours) || input.projectedHours < 0) return fail("Las horas proyectadas no son válidas.");
  const existing = readOrdersRaw();
  if (input.plannedCallId && existing.some((item) => item.plannedCallId === input.plannedCallId)) {
    return fail(`La llamada ${input.plannedCallId} ya tiene una OT asociada.`);
  }
  let id: string;
  try {
    id = nextDocNumber(orderTypeSeries[input.type], (candidate) => readOrdersRaw().some((item) => item.id === candidate));
  } catch (error) {
    return fail(error instanceof Error ? error.message : "No se pudo numerar la OT.");
  }
  const now = new Date().toISOString();
  const assignees = input.assignees ?? [];
  const status: OrderStatus = assignees.length ? "Asignada" : "Sin asignar";
  const created: WorkOrder = {
    ...input,
    id,
    description: input.description.trim(),
    equipment: input.equipment.trim(),
    assignees,
    materials: input.materials ?? [],
    status,
    pickingStatus: "Sin picking",
    qualityChecklist: {},
    qualityApproved: false,
    qualityApprovedBy: null,
    statusHistory: [{ date: now, previousStatus: status, newStatus: status, user: actor.user, reason: "Creación" }],
    createdAt: now,
    createdBy: actor.user,
  };
  const saved = runAtomic(orderKeys, [
    () => saveOrders((current) => [...current, created]),
    () => appendAudit({ user: actor.user, role: actor.role, entity: "order", entityId: id, action: "create", after: { type: created.type, wbs: created.wbs } }),
  ]);
  return saved ? ok(created) : fail("No se pudo guardar la OT (almacenamiento lleno).");
}

// Subconjunto de Employee (RRHH) que necesita la lógica de OT; se pasa desde la UI para no acoplar data/ con la página de RRHH.
export type EmployeeRef = {
  id: string;
  name: string;
  login?: string;
  direct?: boolean;
  supervisorId?: string;
  supervisorLogin?: string;
};

export const isAssignee = (order: Pick<WorkOrder, "assignees">, employeeId: string) =>
  order.assignees.some((assignee) => assignee.employeeId === employeeId);

export const employeeForLogin = (employees: EmployeeRef[], login: string): EmployeeRef | undefined =>
  login ? employees.find((employee) => employee.login === login) : undefined;

// Trabajadores que un rol puede asignar: el equipo del supervisor (supervisorId) o todos para Administrador; solo con login o directos.
export function assignableEmployees(employees: EmployeeRef[], actor: Actor): EmployeeRef[] {
  if (!can(actor.role, "order.assign")) return [];
  const eligible = employees.filter((employee) => employee.login || employee.direct);
  if (actor.role === "Administrador") return eligible;
  const supervisor = employees.find((employee) => employee.supervisorLogin === actor.user);
  return supervisor ? eligible.filter((employee) => employee.supervisorId === supervisor.id) : [];
}

export function assignOrder(
  orderId: string,
  employeeIds: string[],
  actor: Actor,
  employees: EmployeeRef[],
): Result<WorkOrder> {
  if (!can(actor.role, "order.assign")) return fail("Solo Supervisor o Administrador puede asignar órdenes.");
  const order = readOrdersRaw().find((item) => item.id === orderId);
  if (!order) return fail(`La OT ${orderId} no existe.`);
  if (order.status === "Cierre provisorio" || order.status === "Cerrada") {
    return fail("No se puede cambiar la asignación de una OT en cierre provisorio o cerrada.");
  }
  const uniqueIds = [...new Set(employeeIds)];
  const pool = assignableEmployees(employees, actor);
  const assignees: OrderAssignee[] = [];
  for (const employeeId of uniqueIds) {
    const employee = pool.find((item) => item.id === employeeId);
    if (!employee) return fail("Solo puedes asignar trabajadores de tu equipo con usuario o directos.");
    assignees.push({ employeeId: employee.id, name: employee.name });
  }
  const removed = order.assignees.filter((previous) => !uniqueIds.includes(previous.employeeId));
  const openEntries = readTimeEntries().filter((entry) => entry.orderId === orderId && entry.end === null);
  const blocked = removed.find((previous) => openEntries.some((entry) => entry.employeeId === previous.employeeId));
  if (blocked) return fail(`${blocked.name} tiene una operación en curso en ${orderId}; debe detenerla antes de quitarla.`);
  const status: OrderStatus = order.status === "En ejecución" ? "En ejecución" : assignees.length ? "Asignada" : "Sin asignar";
  const now = new Date().toISOString();
  const updated: WorkOrder = {
    ...order,
    assignees,
    status,
    statusHistory: status === order.status ? order.statusHistory : [
      ...order.statusHistory,
      { date: now, previousStatus: order.status, newStatus: status, user: actor.user, reason: "Asignación" },
    ],
  };
  const saved = runAtomic(orderKeys, [
    () => saveOrders((current) => current.map((item) => item.id === orderId ? updated : item)),
    () => appendAudit({
      user: actor.user, role: actor.role, entity: "order", entityId: orderId, action: "assign",
      before: order.assignees.map((item) => item.name), after: assignees.map((item) => item.name),
    }),
  ]);
  return saved ? ok(updated) : fail("No se pudo guardar la asignación.");
}

const priorityRank: Record<OrderPriority, number> = { Alta: 0, Media: 1, Baja: 2 };

// Orden de la bandeja: prioridad (Alta primero; sin prioridad al final) y luego fecha programada.
export function compareOrdersByPriority(
  a: Pick<WorkOrder, "priority" | "dueDate">,
  b: Pick<WorkOrder, "priority" | "dueDate">,
): number {
  const rank = (order: Pick<WorkOrder, "priority">) => order.priority ? priorityRank[order.priority] : 3;
  return rank(a) - rank(b) || a.dueDate.localeCompare(b.dueDate);
}

// ---------------------------------------------------------------------------
// Tiempo por operación (E3.3): todo se deriva de timeEntries.
// ---------------------------------------------------------------------------
export type OperationEnv = {
  employees: EmployeeRef[];
  rateOf: (employeeName: string) => number;
  now?: Date;
};

export type OrderOperation = { order: number; name: string; durationHours: number };

// Operaciones de la hoja de ruta; una OT sin ruta (p. ej. ESPERA) tiene una sola operación general (0).
export function orderOperations(order: Pick<WorkOrder, "routeOperations" | "type" | "projectedHours">): OrderOperation[] {
  if (order.routeOperations?.length) {
    return order.routeOperations.map((operation) => ({
      order: operation.order, name: operation.name, durationHours: operation.durationHours,
    }));
  }
  return [{ order: 0, name: order.type === "ESPERA" ? "Espera" : "Trabajo general", durationHours: order.projectedHours }];
}

export const openEntryOf = (entries: TimeEntry[], employeeId: string): TimeEntry | undefined =>
  entries.find((entry) => entry.employeeId === employeeId && entry.end === null);

export function orderTimeTotals(orderId: string, entries: TimeEntry[], nowMs: number): { seconds: number; laborCost: number } {
  return entries.filter((entry) => entry.orderId === orderId).reduce((total, entry) => {
    const hours = entryDurationHours(entry, nowMs);
    return { seconds: total.seconds + hours * 3600, laborCost: total.laborCost + hours * entry.hourlyRate };
  }, { seconds: 0, laborCost: 0 });
}

export function operationHours(orderId: string, operationOrder: number, entries: TimeEntry[], nowMs: number): number {
  return entries
    .filter((entry) => entry.orderId === orderId && entry.operationOrder === operationOrder)
    .reduce((sum, entry) => sum + entryDurationHours(entry, nowMs), 0);
}

function saveEntries(fn: (entries: TimeEntry[]) => TimeEntry[]): boolean {
  return updateJson<TimeEntry[]>(keys.timeEntries, [], (current) => fn(Array.isArray(current) ? current : [])) !== null;
}

const entryId = () => `TE-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

function operatorFor(order: WorkOrder | undefined, orderId: string, actor: Actor, env: OperationEnv): Result<EmployeeRef> {
  if (!can(actor.role, "order.operate")) return fail("Tu rol no tiene permiso para registrar horas de trabajo.");
  const employee = employeeForLogin(env.employees, actor.user);
  if (!employee) return fail("Tu usuario no está vinculado a un empleado en Recursos Humanos.");
  if (!order) return fail(`La OT ${orderId} no existe.`);
  if (!isAssignee(order, employee.id)) return fail(`No estás asignado a la OT ${orderId}.`);
  return ok(employee);
}

const statusStep = (order: WorkOrder, next: OrderStatus, user: string, now: string, reason?: string): WorkOrder => ({
  ...order,
  status: next,
  statusHistory: [...order.statusHistory, { date: now, previousStatus: order.status, newStatus: next, user, ...(reason ? { reason } : {}) }],
});

// Q7: un técnico no tiene dos operaciones abiertas. Al iniciar otra (en esta u otra OT) la abierta se cierra sola (pausa).
export function startOperation(
  input: { orderId: string; operationOrder: number },
  actor: Actor,
  env: OperationEnv,
): Result<{ entry: TimeEntry; paused?: TimeEntry }> {
  const order = readOrdersRaw().find((item) => item.id === input.orderId);
  const operator = operatorFor(order, input.orderId, actor, env);
  if (!operator.ok) return operator;
  if (!order) return fail(`La OT ${input.orderId} no existe.`);
  const employee = operator.value;
  if (order.status === "Cierre provisorio" || order.status === "Cerrada") {
    return fail(`La OT ${order.id} está en ${order.status.toLowerCase()}; no admite nuevas horas.`);
  }
  const operation = orderOperations(order).find((item) => item.order === input.operationOrder);
  if (!operation) return fail(`La operación ${input.operationOrder} no existe en la OT ${order.id}.`);
  const now = (env.now ?? new Date()).toISOString();
  const open = openEntryOf(readTimeEntries(), employee.id);
  if (open && open.orderId === order.id && open.operationOrder === operation.order) {
    return fail("Esa operación ya está en curso.");
  }
  const entry: TimeEntry = {
    id: entryId(), orderId: order.id, orderType: order.type, wbs: order.wbs, operationOrder: operation.order,
    operationName: operation.name, employeeId: employee.id, employeeName: employee.name, start: now, end: null,
    hourlyRate: env.rateOf(employee.name),
  };
  const paused = open ? { ...open, end: now } : undefined;
  const saved = runAtomic(orderKeys, [
    () => saveEntries((current) => [
      ...current.map((item) => item.id === open?.id ? { ...item, end: now } : item),
      entry,
    ]),
    () => saveOrders((current) => current.map((item) => {
      if (item.id === order.id && item.status !== "En ejecución") return statusStep(item, "En ejecución", actor.user, now);
      // La OT pausada vuelve a Asignada si ya nadie trabaja en ella.
      if (open && item.id === open.orderId && item.id !== order.id && item.status === "En ejecución") {
        const othersOpen = readTimeEntries().some((candidate) => candidate.orderId === item.id && candidate.end === null);
        return othersOpen ? item : statusStep(item, "Asignada", actor.user, now, "Pausa automática");
      }
      return item;
    })),
  ]);
  return saved ? ok({ entry, paused }) : fail("No se pudo registrar el inicio de la operación.");
}

export function stopOperation(orderId: string, actor: Actor, env: OperationEnv): Result<TimeEntry> {
  const order = readOrdersRaw().find((item) => item.id === orderId);
  const operator = operatorFor(order, orderId, actor, env);
  if (!operator.ok) return operator;
  if (!order) return fail(`La OT ${orderId} no existe.`);
  const entries = readTimeEntries();
  const open = entries.find((entry) => entry.orderId === orderId && entry.employeeId === operator.value.id && entry.end === null);
  if (!open) return fail("No tienes una operación en curso en esta OT.");
  const now = (env.now ?? new Date()).toISOString();
  const closed = { ...open, end: now };
  const othersOpen = entries.some((entry) => entry.orderId === orderId && entry.end === null && entry.id !== open.id);
  const saved = runAtomic(orderKeys, [
    () => saveEntries((current) => current.map((item) => item.id === open.id ? closed : item)),
    () => saveOrders((current) => current.map((item) => item.id === orderId && item.status === "En ejecución" && !othersOpen
      ? statusStep(item, "Asignada", actor.user, now)
      : item)),
  ]);
  return saved ? ok(closed) : fail("No se pudo registrar el término de la operación.");
}

export function requestProvisionalClose(orderId: string, actor: Actor, env: OperationEnv): Result<WorkOrder> {
  const order = readOrdersRaw().find((item) => item.id === orderId);
  const operator = operatorFor(order, orderId, actor, env);
  if (!operator.ok) return operator;
  if (!order) return fail(`La OT ${orderId} no existe.`);
  if (order.status !== "Asignada" && order.status !== "En ejecución") {
    return fail("Solo se puede solicitar el cierre provisorio de una OT asignada o en ejecución.");
  }
  if (readTimeEntries().some((entry) => entry.orderId === orderId && entry.end === null)) {
    return fail("Detén las operaciones en curso antes de solicitar el cierre provisorio.");
  }
  const updated = statusStep(order, "Cierre provisorio", actor.user, (env.now ?? new Date()).toISOString());
  return saveOrders((current) => current.map((item) => item.id === orderId ? updated : item))
    ? ok(updated) : fail("No se pudo guardar el cierre provisorio.");
}

// ---------------------------------------------------------------------------
// Cierre final y reapertura (E3.4, Q3: Supervisor y Administrador).
// ---------------------------------------------------------------------------
export function closeOrder(orderId: string, actor: Actor, now: Date = new Date()): Result<WorkOrder> {
  if (!can(actor.role, "order.close")) return fail("Solo Supervisor o Administrador puede cerrar una OT.");
  const order = readOrdersRaw().find((item) => item.id === orderId);
  if (!order) return fail(`La OT ${orderId} no existe.`);
  if (order.status !== "Cierre provisorio") return fail("Solo se puede cerrar una OT que esté en cierre provisorio.");
  if (readTimeEntries().some((entry) => entry.orderId === orderId && entry.end === null)) {
    return fail("El técnico debe detener sus operaciones antes del cierre final.");
  }
  if (order.type !== "ESPERA" && !order.qualityApproved) return fail("Calidad debe aprobar el checklist antes del cierre final.");
  const stamp = now.toISOString();
  const closed: WorkOrder = { ...statusStep(order, "Cerrada", actor.user, stamp), closedAt: stamp, closedBy: actor.user };
  const saved = runAtomic(orderKeys, [
    () => saveOrders((current) => current.map((item) => item.id === orderId ? closed : item)),
    () => appendAudit({ user: actor.user, role: actor.role, entity: "order", entityId: orderId, action: "close", before: { status: order.status }, after: { status: "Cerrada" } }),
  ]);
  return saved ? ok(closed) : fail("No se pudo guardar el cierre de la OT.");
}

// Vuelve a Asignada (o Sin asignar), limpia la aprobación de Calidad y conserva horas y movimientos ya imputados.
export function reopenOrder(orderId: string, reason: string, actor: Actor, now: Date = new Date()): Result<WorkOrder> {
  if (!can(actor.role, "order.reopen")) return fail("Solo Supervisor o Administrador puede reabrir una OT cerrada.");
  const cleanReason = reason.trim();
  if (!cleanReason) return fail("Completa el motivo de reapertura.");
  const order = readOrdersRaw().find((item) => item.id === orderId);
  if (!order) return fail(`La OT ${orderId} no existe.`);
  if (order.status !== "Cerrada") return fail("Solo se pueden reabrir órdenes en estado Cerrada.");
  const next: OrderStatus = order.assignees.length ? "Asignada" : "Sin asignar";
  const reopened: WorkOrder = {
    ...statusStep(order, next, actor.user, now.toISOString(), cleanReason),
    qualityApproved: false,
    qualityApprovedBy: null,
    qualityApprovedAt: undefined,
    closedAt: undefined,
    closedBy: undefined,
  };
  const saved = runAtomic(orderKeys, [
    () => saveOrders((current) => current.map((item) => item.id === orderId ? reopened : item)),
    () => appendAudit({
      user: actor.user, role: actor.role, entity: "order", entityId: orderId, action: "reopen",
      before: { status: "Cerrada", closedBy: order.closedBy }, after: { status: next }, reason: cleanReason,
    }),
  ]);
  return saved ? ok(reopened) : fail("No se pudo guardar la reapertura de la OT.");
}

// ---------------------------------------------------------------------------
// Línea de tiempo (E3.5): lógica pura de recorte por día y filas por trabajador.
// ---------------------------------------------------------------------------
export type DayRange = { startMs: number; endMs: number; open: boolean };
export type TimelineRow = { employeeId: string; name: string };

// Límites del día local (00:00 a 24:00) de una fecha YYYY-MM-DD.
export function dayBounds(date: string): { start: number; end: number } | null {
  if (!isoDay.test(date)) return null;
  const [year, month, day] = date.split("-").map(Number);
  const start = new Date(year, month - 1, day).getTime();
  return Number.isNaN(start) ? null : { start, end: new Date(year, month - 1, day + 1).getTime() };
}

// Recorta la entrada al día mostrado (cruce de medianoche); la abierta termina en nowMs. null si no toca el día.
export function clipEntryToDay(entry: TimeEntry, date: string, nowMs: number): DayRange | null {
  const bounds = dayBounds(date);
  if (!bounds) return null;
  const open = entry.end === null;
  const rawEnd = open ? nowMs : Date.parse(entry.end as string);
  const startMs = Math.max(Date.parse(entry.start), bounds.start);
  const endMs = Math.min(rawEnd, bounds.end);
  return endMs > startMs ? { startMs, endMs, open } : null;
}

// Trabajadores con actividad ese día o asignados a una OT programada ese día; ordenados por nombre.
export function timelineRows(
  date: string,
  entries: TimeEntry[],
  orders: Pick<WorkOrder, "dueDate" | "assignees" | "status">[],
  nowMs: number,
): TimelineRow[] {
  const rows = new Map<string, TimelineRow>();
  for (const entry of entries) {
    if (clipEntryToDay(entry, date, nowMs)) rows.set(entry.employeeId, { employeeId: entry.employeeId, name: entry.employeeName });
  }
  for (const order of orders) {
    if (order.dueDate !== date || order.status === "Cerrada") continue;
    for (const assignee of order.assignees) {
      if (!rows.has(assignee.employeeId)) rows.set(assignee.employeeId, { employeeId: assignee.employeeId, name: assignee.name });
    }
  }
  return [...rows.values()].sort((a, b) => a.name.localeCompare(b.name));
}
