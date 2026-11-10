import { useState } from "react";
import { can } from "../../app/permissions";
import type { Role } from "../../app/roles";
import { useCatalog, useOperations, useSupervisorScope } from "../../hooks/useOperations";
import type { Feedback } from "../../hooks/useOperations";
import type { WorkOrder } from "../operationsData";

// Estado y acciones comunes a las pestañas de Producción.
export function useProductionCtx(user: string, role: Role, { setMessage, setError }: Feedback) {
  const { orders, visibleOrders, stock, setOrders, updateOrder } = useOperations();
  const { employees, technicianProfiles, supervisorEmployee, supervisorTeam, assignableTeam, supervisorCanSeeOrder } =
    useSupervisorScope(role, user);
  const { routes, plans, plannedCalls, contracts } = useCatalog();
  const [assignmentDrafts, setAssignmentDrafts] = useState<Record<string, string>>({});
  const [reopenModalOpen, setReopenModalOpen] = useState(false);
  const [reopenOrderId, setReopenOrderId] = useState("");
  const [reopenReason, setReopenReason] = useState("");
  const isSupervisor = role === "Supervisor";
  const canCloseOrders = can(role, "order.close");
  const canReopenOrders = can(role, "order.reopen");
  const canCreate = can(role, "order.create");
  const openOrders = visibleOrders.filter((order) => order.status !== "Cerrada" && supervisorCanSeeOrder(order));
  const closedOrders = visibleOrders.filter((order) => order.status === "Cerrada" && (isSupervisor || role === "Administrador"));

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
      assignees: [{ employeeId: employee.id, name: employee.name }],
      hourlyRate: profile.rate,
      projectedLaborCost: profile.rate * current.projectedHours,
    }));
    setError("");
    setMessage(`${order.id} asignada a ${employee.name}.`);
  }


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
    if (!canReopenOrders) {
      setError("Solo Supervisor o Administrador puede reabrir una OT cerrada.");
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


  return {
    user, role, orders, visibleOrders, stock, setOrders, updateOrder, employees, technicianProfiles,
    supervisorEmployee, supervisorTeam, assignableTeam, supervisorCanSeeOrder, routes, plans, plannedCalls, contracts,
    setMessage, setError, assignmentDrafts, setAssignmentDrafts, reopenModalOpen, setReopenModalOpen,
    reopenOrderId, setReopenOrderId, reopenReason, setReopenReason, isSupervisor, canCloseOrders, canReopenOrders,
    canCreate, openOrders, closedOrders, assignOrderToTeamMember, supervisorClose, reopenOrder,
  };
}

export type ProductionCtx = ReturnType<typeof useProductionCtx>;
