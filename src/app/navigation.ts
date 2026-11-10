import {
  Build,
  Dashboard as DashboardIcon,
  Inventory2,
  People,
  ShoppingCart,
  Timeline,
  WarningAmber,
} from "@mui/icons-material";
import type { ElementType } from "react";
import { canAccessRoute } from "./roles";
import type { Role } from "./roles";

export type NavItem = { label: string; icon: ElementType; to: string };

export const navItems: NavItem[] = [
  { label: "Dashboard", icon: DashboardIcon, to: "/dashboard" },
  { label: "Clientes", icon: People, to: "/clientes" },
  { label: "Materiales", icon: Inventory2, to: "/materiales" },
  { label: "Planning", icon: Build, to: "/planning" },
  { label: "Producción", icon: Build, to: "/produccion" },
  { label: "Mis OT", icon: Build, to: "/bandeja" },
  { label: "Ingeniería", icon: Build, to: "/ingenieria" },
  { label: "Supply · MRP", icon: Inventory2, to: "/supply" },
  { label: "PM Proyecto", icon: Timeline, to: "/pm" },
  { label: "Almacén", icon: Inventory2, to: "/almacen" },
  { label: "Compras", icon: ShoppingCart, to: "/compras" },
  { label: "Contabilidad", icon: Timeline, to: "/contabilidad" },
  { label: "Recursos humanos", icon: People, to: "/rrhh" },
  { label: "Calidad", icon: WarningAmber, to: "/calidad" },
  { label: "Respaldo de datos", icon: Inventory2, to: "/respaldo" },
];

export const legacyRedirects: Record<string, string> = {
  "/ordenes": "/produccion",
  "/personal": "/produccion?tab=equipo",
  "/hojas-ruta": "/ingenieria",
};

export const navItemsForRole = (role: Role): NavItem[] =>
  navItems.filter((item) => canAccessRoute(role, item.to));
