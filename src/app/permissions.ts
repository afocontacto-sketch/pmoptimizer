import type { OrderType } from "../data/docNumbering";
import type { Role } from "./roles";

export type Action =
  | "material.create" | "material.edit" | "equipment.edit"
  | "material.editParams"
  | "route.edit"
  | "plan.edit"
  | "order.create" | "order.assign" | "order.operate" | "order.close" | "order.reopen"
  | "quality.inspect" | "quality.releaseStock" | "quality.markInspection"
  | "warehouse.pick" | "warehouse.transfer" | "warehouse.receiveTransfer" | "warehouse.putaway"
  | "warehouse.count" | "warehouse.import" | "warehouse.receivePO" | "warehouse.skipQuality"
  | "purchase.createRequest" | "purchase.quote" | "purchase.createPO" | "purchase.approve"
  | "budget.approve" | "eac.closeMonth"
  | "invoice.edit" | "accounting.edit"
  | "payroll.edit" | "payroll.recalculate"
  | "client.edit" | "backup.manage";

const ING: Role = "Ingeniería e Industrial";

// Roles autorizados por acción (Administrador siempre tiene permiso, ver can()).
export const permissions: Record<Action, readonly Role[]> = {
  "material.create": [ING],
  "material.edit": [ING],
  "equipment.edit": [ING],
  "material.editParams": ["Planificador", "Compras"],
  "route.edit": [ING],
  "plan.edit": ["Planificador"],
  "order.create": ["Supervisor", "Planificador"], // tipos por rol: allowedOrderTypes
  "order.assign": ["Supervisor"],
  "order.operate": ["Técnico"],
  "order.close": ["Supervisor"],
  "order.reopen": ["Supervisor"],
  "quality.inspect": ["Calidad"],
  "quality.releaseStock": ["Calidad"],
  "quality.markInspection": ["Calidad"],
  "warehouse.pick": ["Almacén"],
  "warehouse.transfer": ["Almacén"],
  "warehouse.receiveTransfer": ["Almacén"],
  "warehouse.putaway": ["Almacén"],
  "warehouse.count": ["Almacén"],
  "warehouse.import": ["Almacén"],
  "warehouse.receivePO": ["Almacén", "Compras"],
  "warehouse.skipQuality": [],
  "purchase.createRequest": ["Compras"],
  "purchase.quote": ["Compras"],
  "purchase.createPO": ["Compras"],
  "purchase.approve": ["PM Proyecto"],
  "budget.approve": ["PM Proyecto"],
  "eac.closeMonth": ["PM Proyecto"],
  "invoice.edit": ["Contabilidad"],
  "accounting.edit": ["Contabilidad"],
  "payroll.edit": ["Contabilidad"],
  "payroll.recalculate": ["Contabilidad"],
  "client.edit": [],
  "backup.manage": [],
};

export function can(role: Role, action: Action): boolean {
  return role === "Administrador" || permissions[action].includes(role);
}

const orderTypesByRole: Partial<Record<Role, readonly OrderType[]>> = {
  "Administrador": ["PRE", "OVH", "COR", "GAR", "REP", "ESPERA"],
  "Supervisor": ["COR", "ESPERA"],
  "Planificador": ["PRE", "OVH", "GAR", "REP"],
};

export function allowedOrderTypes(role: Role): OrderType[] {
  return can(role, "order.create") ? [...(orderTypesByRole[role] ?? [])] : [];
}
