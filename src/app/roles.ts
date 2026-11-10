export const roles = [
  "Administrador",
  "Supervisor",
  "Planificador",
  "PM Proyecto",
  "Compras",
  "Contabilidad",
  "Ingeniería e Industrial",
  "Calidad",
  "Almacén",
  "Técnico",
] as const;

export type Role = (typeof roles)[number];

export const isRole = (value: unknown): value is Role =>
  typeof value === "string" && (roles as readonly string[]).includes(value);

export type DemoAccount = { username: string; password: string; role: Role };

export const demoAccounts: DemoAccount[] = [
  { username: "supervisor", password: "supervisor2026", role: "Supervisor" },
  { username: "planificador", password: "planificador2026", role: "Planificador" },
  { username: "pm", password: "pm2026", role: "PM Proyecto" },
  { username: "compras", password: "compras2026", role: "Compras" },
  { username: "contabilidad", password: "contabilidad2026", role: "Contabilidad" },
  { username: "industrial", password: "industrial2026", role: "Ingeniería e Industrial" },
  { username: "ingenieria", password: "ingenieria2026", role: "Ingeniería e Industrial" },
  { username: "calidad", password: "calidad2026", role: "Calidad" },
  { username: "almacen", password: "almacen2026", role: "Almacén" },
  { username: "tecnico", password: "tecnico2026", role: "Técnico" },
  { username: "tecnico2", password: "tecnico2026", role: "Técnico" },
  { username: "IJOV", password: "ADMIN", role: "Administrador" },
];

export const roleModules: Record<Role, string[]> = {
  "Administrador": ["*"],
  "Supervisor": ["/dashboard", "/produccion", "/almacen"],
  "Planificador": ["/dashboard", "/planning", "/planes-mantenimiento", "/supply", "/pm", "/produccion", "/ingenieria"],
  "PM Proyecto": ["/dashboard", "/pm", "/planning", "/planes-mantenimiento", "/compras"],
  "Compras": ["/dashboard", "/clientes", "/materiales", "/compras", "/supply", "/almacen"],
  "Contabilidad": ["/dashboard", "/clientes", "/compras", "/contabilidad", "/rrhh"],
  // /produccion es solo lectura para este rol (las acciones se controlan en permissions.ts).
  "Ingeniería e Industrial": ["/dashboard", "/ingenieria", "/materiales", "/planning", "/planes-mantenimiento", "/supply", "/almacen", "/produccion"],
  "Calidad": ["/dashboard", "/calidad", "/almacen", "/materiales"],
  "Almacén": ["/dashboard", "/almacen", "/supply", "/materiales"],
  "Técnico": ["/bandeja"],
};

export const defaultRouteByRole: Partial<Record<Role, string>> = {
  "Supervisor": "/produccion",
  "Técnico": "/bandeja",
  "Almacén": "/almacen",
};

export const defaultRoute = (role: Role): string => defaultRouteByRole[role] ?? "/dashboard";

export const canAccessRoute = (role: Role, path: string): boolean =>
  roleModules[role].includes("*") || roleModules[role].includes(path);
