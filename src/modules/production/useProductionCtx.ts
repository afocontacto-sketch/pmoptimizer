import { useState } from "react";
import { can } from "../../app/permissions";
import type { Role } from "../../app/roles";
import { useCatalog, useOperations, useSupervisorScope } from "../../hooks/useOperations";
import type { Feedback } from "../../hooks/useOperations";
import { printDocument } from "../../components/print/printDocument";
import { workOrderDoc } from "../../components/print/printTemplates";
import { assignOrder, closeOrder, reopenOrder as reopenWorkOrder } from "../../data/workOrders";
import type { WorkOrder } from "../operationsData";

// Estado y acciones comunes a las pestañas de Producción.
export function useProductionCtx(user: string, role: Role, { setMessage, setError }: Feedback) {
  const { orders, entries, nowMs, visibleOrders, stock, setOrders, updateOrder } = useOperations();
  const { employees, technicianProfiles, supervisorEmployee, supervisorTeam, assignableTeam, supervisorCanSeeOrder } =
    useSupervisorScope(role, user);
  const { routes, plans, plannedCalls, contracts } = useCatalog();
  const [assignmentDrafts, setAssignmentDrafts] = useState<Record<string, string[]>>({});
  const [reopenModalOpen, setReopenModalOpen] = useState(false);
  const [reopenOrderId, setReopenOrderId] = useState("");
  const [reopenReason, setReopenReason] = useState("");
  const isSupervisor = role === "Supervisor";
  const canCloseOrders = can(role, "order.close");
  const canReopenOrders = can(role, "order.reopen");
  const canCreate = can(role, "order.create");
  const openOrders = visibleOrders.filter((order) => order.status !== "Cerrada" && supervisorCanSeeOrder(order));
  const closedOrders = visibleOrders.filter((order) => order.status === "Cerrada" && (isSupervisor || role === "Administrador"));
  const assignOrderToEmployees = (orderId: string, employeeIds: string[]) => {
    const result = assignOrder(orderId, employeeIds, { user, role }, employees);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setError("");
    setMessage(`${orderId} asignada a ${result.value.assignees.map((item) => item.name).join(", ") || "nadie (sin asignar)"}.`);
  };


  // Supervisor y Técnico no ven tarifas ni costos (misma regla que el tablero de costos).
  const canSeeCosts = role !== "Supervisor" && role !== "Técnico";
  const printOrder = (order: WorkOrder) => {
    printDocument({ ...workOrderDoc(order, entries, { showCosts: canSeeCosts, nowMs }), user })
      .catch((printError: unknown) => setError(printError instanceof Error ? printError.message : "No se pudo imprimir la OT."));
  };

// Supervisor y Técnico no ven tarifas ni costos (misma regla que el tablero de costos).  const canSeeCosts = role !== "Supervisor" && role !== "Técnico";  const printOrder = (order: WorkOrder) => {    printDocument({ ...workOrderDoc(order, entries, { showCosts: canSeeCosts, nowMs }), user })      .catch((printError: unknown) => setError(printError instanceof Error ? printError.message : "No se pudo imprimir la OT."));  };
  const supervisorClose = (orderId: string) => {
    const result = closeOrder(orderId, { user, role });
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setMessage(`${orderId} cerrada por ${user}.`);
    setError("");
  };

  const reopenOrder = (orderId: string, reason: string) => {
    const result = reopenWorkOrder(orderId, reason, { user, role });
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setMessage(`${orderId} reabierta por ${user} - Motivo: ${reason.trim()}`);
    setError("");
  };


  return {
    user, role, orders, entries, visibleOrders, stock, setOrders, updateOrder, employees, technicianProfiles,
    supervisorEmployee, supervisorTeam, assignableTeam, supervisorCanSeeOrder, routes, plans, plannedCalls, contracts,
    setMessage, setError, assignmentDrafts, setAssignmentDrafts, reopenModalOpen, setReopenModalOpen,
    reopenOrderId, setReopenOrderId, reopenReason, setReopenReason, isSupervisor, canCloseOrders, canReopenOrders,
    canCreate, canSeeCosts, openOrders, closedOrders, assignOrderToEmployees, printOrder, supervisorClose, reopenOrder,
  };
}

export type ProductionCtx = ReturnType<typeof useProductionCtx>;
