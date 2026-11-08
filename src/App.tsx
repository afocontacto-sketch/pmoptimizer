import { Fragment, useEffect, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import {
  Alert,
  AppBar,
  Avatar,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CssBaseline,
  Divider,
  Drawer,
  Grid,
  IconButton,
  InputAdornment,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Paper,
  Stack,
  TextField,
  ThemeProvider,
  Toolbar,
  Typography,
  createTheme,
} from "@mui/material";
import {
  AccountCircle,
  Add,
  Build,
  Dashboard as DashboardIcon,
  Inventory2,
  Logout,
  Menu as MenuIcon,
  People,
  Search,
  ShoppingCart,
  Timeline,
  WarningAmber,
} from "@mui/icons-material";
import {
  BrowserRouter,
  Link,
  Navigate,
  Route,
  Routes,
  useNavigate,
} from "react-router-dom";
import MaintenancePlanning from "./modules/MaintenancePlanning";
import IndustrialRoutes from "./modules/IndustrialRoutes";
import WorkOrders from "./modules/WorkOrders";
import SupplyPage from "./modules/SupplyPage";
import PurchasingPage from "./modules/PurchasingPage";
import ProjectManagement from "./modules/ProjectManagement";
import AccountingPage from "./modules/AccountingPage";
import HumanResourcesPage from "./modules/HumanResourcesPage";

const theme = createTheme({
  palette: {
    mode: "light",
    primary: {
      main: "#0f172a",
    },
    secondary: {
      main: "#2563eb",
    },
    background: {
      default: "#f4f7fb",
      paper: "#ffffff",
    },
    success: {
      main: "#16a34a",
    },
    warning: {
      main: "#f59e0b",
    },
    error: {
      main: "#ef4444",
    },
  },
  shape: { borderRadius: 14 },
  typography: {
    fontFamily: '"Segoe UI", sans-serif',
    h4: { fontWeight: 700 },
    h5: { fontWeight: 700 },
    h6: { fontWeight: 700 },
  },
});

const mockClients = [
  { id: "CLI-001", name: "Comercial Aconcagua", sector: "Retail", status: "Activo", amount: 14500000 },
  { id: "CLI-002", name: "Minera Sur Ltda.", sector: "Minería", status: "En revisión", amount: 24600000 },
  { id: "CLI-003", name: "Maderas del Valle", sector: "Manufactura", status: "Activo", amount: 9800000 },
];

const mockMaterials = [
  { code: "MAT-301", name: "Motor 7.5HP", stock: 18, minStock: 12, category: "Mecánica", unit: "unidad" },
  { code: "MAT-422", name: "Rodamiento SKF 6205", stock: 42, minStock: 15, category: "Mecánica", unit: "unidad" },
  { code: "MAT-114", name: "Cinta aislante 3M", stock: 9, minStock: 20, category: "Eléctrica", unit: "rollo" },
  { code: "MAT-880", name: "Soldadura ER70S-6", stock: 27, minStock: 10, category: "Soldadura", unit: "kilo" },
];

type MaterialRow = {
  code: string;
  name: string;
  stock: number;
  available: number;
  quality: number;
  inTransit: number;
  minStock: number;
  category: string;
  unit: string;
};

function getMaterialRows(): MaterialRow[] {
  type Balance = Pick<MaterialRow, "code" | "name" | "stock" | "available" | "quality" | "inTransit" | "unit">;
  let balances: Map<string, Balance> | null = null;
  try {
    const raw = localStorage.getItem("pmoptimizer-warehouse-bins");
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        console.warn("El inventario local no tiene formato de lista; se muestran saldos demo.");
      } else {
        balances = new Map();
        for (const row of parsed) {
          if (
            typeof row !== "object" || row === null ||
            !("code" in row) || typeof row.code !== "string" ||
            !("name" in row) || typeof row.name !== "string" ||
            !("quantity" in row) || typeof row.quantity !== "number" ||
            !("status" in row) || typeof row.status !== "string" ||
            !("unit" in row) || typeof row.unit !== "string" ||
            !Number.isFinite(row.quantity)
          ) continue;
          const balance = balances.get(row.code) ?? {
            code: row.code,
            name: row.name,
            stock: 0,
            available: 0,
            quality: 0,
            inTransit: 0,
            unit: row.unit,
          };
          const quantity = Math.max(0, row.quantity);
          if (row.status === "En tránsito") balance.inTransit += quantity;
          else {
            balance.stock += quantity;
            if (
              row.status === "Libre utilización" &&
              (!("location" in row) || !["REC-UBICAR", "REC-CALIDAD", "TRANSITO"].includes(String(row.location).toUpperCase()))
            ) {
              balance.available += quantity;
            } else if (row.status === "Bloqueado calidad") {
              balance.quality += quantity;
            }
          }
          balances.set(row.code, balance);
        }
      }
    }
  } catch (error) {
    console.warn("No se pudo leer el inventario local; se muestran saldos demo.", error);
  }

  const knownCodes = new Set(mockMaterials.map((material) => material.code));
  const known = mockMaterials.map((material): MaterialRow => {
    const balance = balances?.get(material.code);
    return {
      ...material,
      stock: balance?.stock ?? (balances === null ? material.stock : 0),
      available: balance?.available ?? (balances === null ? material.stock : 0),
      quality: balance?.quality ?? 0,
      inTransit: balance?.inTransit ?? 0,
    };
  });
  const imported = [...(balances?.values() ?? [])]
    .filter((balance) => !knownCodes.has(balance.code))
    .map((balance): MaterialRow => ({ ...balance, minStock: 0, category: "Sin categoría" }));
  return [...known, ...imported];
}

const metricCards = [
  { title: "Producción", value: "84.6%", detail: "+6.2% vs mes anterior", tone: "success" },
  { title: "OT activas", value: "32", detail: "7 pendientes de cierre", tone: "warning" },
  { title: "Inventario crítico", value: "11", detail: "Requieren reposición", tone: "error" },
  { title: "Cobranza", value: "CLP 4.8M", detail: "96% de cumplimiento", tone: "primary" },
];

const tasks = [
  "Revisar OT-2048 en Planta Norte",
  "Ajustar stock de repuestos de freno",
  "Enviar informe mensual a cliente Minera Sur",
  "Validar cotización de mantenimiento industrial",
];

type Session = {
  user: string;
  role: Role;
};

type Role = "Administrador" | "Supervisor" | "Planificador" | "PM Proyecto" | "Compras" | "Contabilidad" | "Producción" | "Industrial" | "Ingeniería" | "Calidad";

const roles: Role[] = ["Administrador", "Supervisor", "Planificador", "PM Proyecto", "Compras", "Contabilidad", "Producción", "Industrial", "Ingeniería", "Calidad"];

const demoAccounts: { username: string; password: string; role: Role }[] = [
  { username: "compras", password: "compras2026", role: "Compras" },
  { username: "contabilidad", password: "contabilidad2026", role: "Contabilidad" },
  { username: "produccion", password: "produccion2026", role: "Producción" },
  { username: "industrial", password: "industrial2026", role: "Industrial" },
  { username: "ingenieria", password: "ingenieria2026", role: "Ingeniería" },
  { username: "calidad", password: "calidad2026", role: "Calidad" },
  { username: "supervisor", password: "supervisor2026", role: "Supervisor" },
  { username: "planificador", password: "planificador2026", role: "Planificador" },
  { username: "pm", password: "pm2026", role: "PM Proyecto" },
  { username: "IJOV", password: "ADMIN", role: "Administrador" },
];

const roleModules: Record<Role, string[]> = {
  Administrador: ["*"],
  Supervisor: ["/dashboard", "/clientes", "/materiales", "/planes-mantenimiento", "/planning", "/ordenes", "/almacen", "/supply", "/compras", "/contabilidad", "/calidad", "/pm"],
  Planificador: ["/dashboard", "/planning", "/planes-mantenimiento", "/supply", "/pm"],
  "PM Proyecto": ["/dashboard", "/planning", "/planes-mantenimiento", "/compras", "/pm"],
  Compras: ["/dashboard", "/clientes", "/materiales", "/compras", "/supply", "/almacen"],
  Contabilidad: ["/dashboard", "/clientes", "/contabilidad", "/rrhh"],
  Producción: ["/dashboard", "/materiales", "/ordenes", "/almacen", "/planes-mantenimiento", "/planning", "/supply"],
  Industrial: ["/dashboard", "/materiales", "/ordenes", "/almacen", "/hojas-ruta", "/planes-mantenimiento", "/planning", "/supply"],
  Ingeniería: ["/dashboard", "/materiales", "/ordenes", "/almacen", "/planes-mantenimiento", "/planning"],
  Calidad: ["/dashboard", "/almacen", "/calidad"],
};

function readSession(): Session | null {
  const raw = localStorage.getItem("pmoptimizer-session");
  if (!raw) return null;

  try {
    const stored: unknown = JSON.parse(raw);
    if (
      typeof stored === "object" &&
      stored !== null &&
      "user" in stored &&
      typeof stored.user === "string" &&
      stored.user.trim().length > 0 &&
      "role" in stored &&
      typeof stored.role === "string"
    ) {
      const role = roles.find((item) => item === stored.role);
      if (role) return { user: stored.user, role };
    }
  } catch (error) {
    console.warn("La sesión guardada no se pudo leer y será eliminada.", error);
  }

  localStorage.removeItem("pmoptimizer-session");
  return null;
}

function App() {
  const [session, setSession] = useState<Session | null>(readSession);

  useEffect(() => {
    if (session) {
      localStorage.setItem("pmoptimizer-session", JSON.stringify(session));
    } else {
      localStorage.removeItem("pmoptimizer-session");
    }
  }, [session]);

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <BrowserRouter>
        <Routes>
          <Route
            path="/login"
            element={session ? <Navigate to="/dashboard" replace /> : <LoginPage onLogin={setSession} />}
          />
          <Route
            path="/*"
            element={session ? <AppLayout session={session} onLogout={() => setSession(null)} /> : <Navigate to="/login" replace />}
          />
        </Routes>
      </BrowserRouter>
    </ThemeProvider>
  );
}

type LoginPageProps = {
  onLogin: (session: Session) => void;
};

function LoginPage({ onLogin }: LoginPageProps) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const handleLogin = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const account = demoAccounts.find(
      (item) => item.username.toLowerCase() === username.trim().toLowerCase() && item.password === password,
    );
    if (account) {
      onLogin({ user: account.username, role: account.role });
      setError("");
      return;
    }
    setError("Usuario o contraseña incorrectos.");
  };

  return (
    <Box
      sx={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "linear-gradient(135deg, #0f172a 0%, #1e293b 100%)",
        p: 3,
      }}
    >
      <Paper
        elevation={0}
        sx={{
          width: "100%",
          maxWidth: 1100,
          display: "grid",
          gridTemplateColumns: { xs: "1fr", md: "1.1fr 0.9fr" },
          overflow: "hidden",
          borderRadius: 4,
          boxShadow: "0 18px 50px rgba(15,23,42,0.3)",
        }}
      >
        <Box
          sx={{
            background: "linear-gradient(135deg, #0f172a 0%, #1d4ed8 100%)",
            p: { xs: 4, md: 6 },
            color: "#fff",
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
          }}
        >
          <BrandLogo />
          <Typography variant="h3" sx={{ fontWeight: 800, mb: 2 }}>
            Control de mantenimiento y producción
          </Typography>
          <Typography sx={{ fontSize: 17, lineHeight: 1.8, opacity: 0.9 }}>
            Plataforma para coordinar clientes, inventario, trabajos de mantenimiento, costos y operación de producción en una sola vista.
          </Typography>

          <Stack spacing={2} sx={{ mt: 4 }}>
            {[
              "Monitoreo operativo por área",
              "Seguimiento de OT y costos",
              "Inventario y compras con alertas",
              "Control de clientes y materiales",
            ].map((item) => (
              <Stack direction="row" spacing={1.5} key={item} sx={{ alignItems: "center" }}>
                <Box
                  sx={{
                    width: 10,
                    height: 10,
                    borderRadius: "50%",
                    background: "#93c5fd",
                  }}
                />
                <Typography sx={{ fontSize: 15 }}>{item}</Typography>
              </Stack>
            ))}
          </Stack>
        </Box>

        <Box sx={{ p: { xs: 4, md: 5 }, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Box sx={{ width: "100%", maxWidth: 420 }}>
            <Typography variant="h4" sx={{ mb: 1, fontWeight: 700 }}>
              Iniciar sesión
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
              Acceso al sistema de operación
            </Typography>

            <Stack component="form" spacing={2.5} onSubmit={handleLogin}>
              <TextField
                label="Usuario"
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                fullWidth
                slotProps={{
                  htmlInput: { autoCapitalize: "none" },
                  input: {
                    startAdornment: (
                    <InputAdornment position="start">
                      <AccountCircle color="action" />
                    </InputAdornment>
                    ),
                  },
                }}
              />
              <TextField
                label="Contraseña"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                fullWidth
                slotProps={{
                  input: {
                    startAdornment: (
                    <InputAdornment position="start">
                      <AccountCircle color="action" />
                    </InputAdornment>
                    ),
                  },
                }}
              />
              {error && (
                <Typography color="error" variant="body2">
                  {error}
                </Typography>
              )}

              <Button
                variant="contained"
                size="large"
                type="submit"
                sx={{ py: 1.5, fontWeight: 700 }}
              >
                Entrar
              </Button>

              <Divider />
              <Typography variant="caption" color="text.secondary" component="div">
                <strong>Cuentas demo por área</strong>
                <br />
                {demoAccounts.slice(0, 8).map(({ username: accountUser, password: accountPassword, role: accountRole }) => (
                  <Fragment key={accountUser}>
                    {accountRole}: {accountUser} / {accountPassword}
                    <br />
                  </Fragment>
                ))}
                Compatibilidad: IJOV / ADMIN
              </Typography>
            </Stack>
          </Box>
        </Box>
      </Paper>
    </Box>
  );
}

type AppLayoutProps = {
  session: Session;
  onLogout: () => void;
};

function BrandLogo({ compact = false }: { compact?: boolean }) {
  const [logoUnavailable, setLogoUnavailable] = useState(false);

  return (
    <Stack direction="row" spacing={1.5} sx={{ alignItems: "center" }}>
      {logoUnavailable ? (
        <Avatar
          variant="rounded"
          sx={{ width: compact ? 42 : 64, height: compact ? 42 : 64, bgcolor: "#2563eb", fontWeight: 800 }}
        >
          PMO
        </Avatar>
      ) : (
        <Box
          component="img"
          src="/PMO.jfif"
          alt="Logo PMOPTIMIZER"
          onError={() => setLogoUnavailable(true)}
          sx={{
            width: compact ? 42 : 64,
            height: compact ? 42 : 64,
            objectFit: "contain",
            borderRadius: 1,
            bgcolor: "#fff",
          }}
        />
      )}
      <Typography
        variant={compact ? "subtitle1" : "overline"}
        sx={{ fontWeight: 800, letterSpacing: compact ? 0.8 : 2, color: "inherit" }}
      >
        PMOPTIMIZER
      </Typography>
    </Stack>
  );
}

function RoleRoute({
  role,
  path,
  children,
}: {
  role: Role;
  path: string;
  children: ReactNode;
}) {
  return roleModules[role].includes("*") || roleModules[role].includes(path)
    ? <>{children}</>
    : <Navigate to="/dashboard" replace />;
}

function AppLayout({ session, onLogout }: AppLayoutProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const closeMobileMenu = () => setMobileOpen(false);

  return (
    <Box sx={{ display: "flex", minHeight: "100vh", background: "#f4f7fb" }}>
      <Drawer
        variant="permanent"
        sx={{
          width: 250,
          flexShrink: 0,
          display: { xs: "none", md: "block" },
          "& .MuiDrawer-paper": {
            width: 250,
            boxSizing: "border-box",
            background: "#0f172a",
            color: "#e2e8f0",
            borderRight: "1px solid rgba(148,163,184,0.2)",
          },
        }}
      >
        <Sidebar role={session.role} />
      </Drawer>
      <Drawer
        variant="temporary"
        open={mobileOpen}
        onClose={closeMobileMenu}
        ModalProps={{ keepMounted: true }}
        sx={{
          display: { xs: "block", md: "none" },
          "& .MuiDrawer-paper": {
            width: 250,
            boxSizing: "border-box",
            background: "#0f172a",
            color: "#e2e8f0",
          },
        }}
      >
        <Sidebar role={session.role} onNavigate={closeMobileMenu} />
      </Drawer>

      <Box component="main" sx={{ flexGrow: 1, minWidth: 0 }}>
        <TopBar session={session} onLogout={onLogout} onMenuClick={() => setMobileOpen(true)} />
        <Box sx={{ p: 3 }}>
          <Routes>
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/clientes" element={<RoleRoute role={session.role} path="/clientes"><ClientesPage /></RoleRoute>} />
            <Route path="/materiales" element={<RoleRoute role={session.role} path="/materiales"><MaterialesPage /></RoleRoute>} />
            <Route path="/ordenes" element={<RoleRoute role={session.role} path="/ordenes"><WorkOrders user={session.user} role={session.role} /></RoleRoute>} />
            <Route path="/almacen" element={<RoleRoute role={session.role} path="/almacen"><WorkOrders user={session.user} role={session.role} defaultTab={2} scope="warehouse" /></RoleRoute>} />
            <Route path="/compras" element={<RoleRoute role={session.role} path="/compras"><PurchasingPage role={session.role} user={session.user} /></RoleRoute>} />
            <Route path="/contabilidad" element={<RoleRoute role={session.role} path="/contabilidad"><AccountingPage role={session.role} /></RoleRoute>} />
            <Route path="/rrhh" element={<RoleRoute role={session.role} path="/rrhh"><HumanResourcesPage /></RoleRoute>} />
            <Route path="/calidad" element={<RoleRoute role={session.role} path="/calidad"><WorkOrders user={session.user} role={session.role} defaultTab={4} scope="quality" /></RoleRoute>} />
            <Route path="/hojas-ruta" element={<RoleRoute role={session.role} path="/hojas-ruta"><IndustrialRoutes user={session.user} /></RoleRoute>} />
            <Route path="/planes-mantenimiento" element={<RoleRoute role={session.role} path="/planes-mantenimiento"><MaintenancePlanning role={session.role} /></RoleRoute>} />
            <Route path="/planning" element={<RoleRoute role={session.role} path="/planning"><MaintenancePlanning role={session.role} /></RoleRoute>} />
            <Route path="/supply" element={<RoleRoute role={session.role} path="/supply"><SupplyPage /></RoleRoute>} />
            <Route path="/pm" element={<RoleRoute role={session.role} path="/pm"><ProjectManagement role={session.role} /></RoleRoute>} />
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="*" element={<ModulePage title="Página no encontrada" />} />
          </Routes>
        </Box>
      </Box>
    </Box>
  );
}

function Sidebar({ role, onNavigate }: { role: Role; onNavigate?: () => void }) {
  const criticalMaterials = getMaterialRows().filter((material) =>
    material.minStock > 0 && material.available <= material.minStock,
  ).length;
  const navItems = [
    { label: "Dashboard", icon: <DashboardIcon />, to: "/dashboard" },
    { label: "Clientes", icon: <People />, to: "/clientes" },
    { label: "Materiales", icon: <Inventory2 />, to: "/materiales" },
    { label: "Planning", icon: <Build />, to: "/planning" },
    { label: "Supply · MRP", icon: <Inventory2 />, to: "/supply" },
    { label: "PM Proyecto", icon: <Timeline />, to: "/pm" },
    { label: "Hojas de ruta", icon: <Build />, to: "/hojas-ruta" },
    { label: "Órdenes", icon: <Build />, to: "/ordenes" },
    { label: "Almacén", icon: <Inventory2 />, to: "/almacen" },
    { label: "Compras", icon: <ShoppingCart />, to: "/compras" },
    { label: "Contabilidad", icon: <Timeline />, to: "/contabilidad" },
    { label: "Recursos humanos", icon: <People />, to: "/rrhh" },
    { label: "Calidad", icon: <WarningAmber />, to: "/calidad" },
  ].filter((item) => roleModules[role].includes("*") || roleModules[role].includes(item.to));

  return (
    <Box sx={{ p: 2 }}>
      <Box sx={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 1, py: 1.5, px: 1.5 }}>
        <BrandLogo compact />
        <Typography variant="caption" sx={{ color: "#cbd5e1" }}>{role}</Typography>
      </Box>

      <Divider sx={{ my: 2, borderColor: "rgba(148,163,184,0.2)" }} />

      <List>
        {navItems.map((item) => (
          <ListItemButton
            key={item.label}
            component={Link}
            to={item.to}
            onClick={onNavigate}
            sx={{
              borderRadius: 2,
              color: "#e2e8f0",
              mb: 0.5,
              "&:hover": { background: "rgba(148,163,184,0.1)" },
            }}
          >
            <ListItemIcon sx={{ color: "inherit", minWidth: 36 }}>{item.icon}</ListItemIcon>
            <ListItemText primary={item.label} />
          </ListItemButton>
        ))}
      </List>

      <Box sx={{ mt: 4, p: 2, borderRadius: 3, background: "rgba(37,99,235,0.12)", border: "1px solid rgba(96,165,250,0.2)" }}>
        <Typography variant="caption" sx={{ color: "#bfdbfe", letterSpacing: 1 }}>
          ALERTA
        </Typography>
        <Typography variant="body2" sx={{ mt: 1, color: "#e0f2fe", fontWeight: 600 }}>
          {criticalMaterials > 0
            ? `${criticalMaterials} materiales por debajo del stock mínimo`
            : "Sin materiales bajo el mínimo"}
        </Typography>
      </Box>
    </Box>
  );
}

type TopBarProps = {
  session: Session;
  onLogout: () => void;
  onMenuClick: () => void;
};

function TopBar({ session, onLogout, onMenuClick }: TopBarProps) {
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const navigate = useNavigate();

  return (
    <AppBar
      position="sticky"
      color="transparent"
      elevation={0}
      sx={{ background: "rgba(255,255,255,0.8)", backdropFilter: "blur(8px)", borderBottom: "1px solid rgba(148,163,184,0.2)" }}
    >
      <Toolbar sx={{ minHeight: 72, px: 3 }}>
        <IconButton sx={{ mr: 2, display: { xs: "inline-flex", md: "none" } }} onClick={onMenuClick}>
          <MenuIcon />
        </IconButton>

        <Box sx={{ flexGrow: 1, display: "flex", alignItems: "center", gap: 2 }}>
          <TextField
            size="small"
            placeholder="Buscar..."
            sx={{ minWidth: 260, display: { xs: "none", sm: "block" } }}
            slotProps={{
              input: {
                startAdornment: <Search sx={{ mr: 1, color: "text.secondary" }} />,
              },
            }}
          />
        </Box>

        {(roleModules[session.role].includes("*") || roleModules[session.role].includes("/ordenes")) && (
          <Button
            variant="contained"
            startIcon={<Add />}
            onClick={() => navigate("/ordenes")}
            sx={{ mr: 2, borderRadius: 2, textTransform: "none" }}
          >
            Nueva OT
          </Button>
        )}

        <IconButton onClick={(e) => setAnchorEl(e.currentTarget)}>
          <Avatar sx={{ width: 36, height: 36, bgcolor: "#1d4ed8" }}>{session.user.charAt(0).toUpperCase()}</Avatar>
        </IconButton>

        <Menu
          anchorEl={anchorEl}
          open={Boolean(anchorEl)}
          onClose={() => setAnchorEl(null)}
        >
          <MenuItem>{session.user} · {session.role}</MenuItem>
          <MenuItem onClick={onLogout}>
            <Logout sx={{ mr: 1 }} fontSize="small" />
            Cerrar sesión
          </MenuItem>
        </Menu>
      </Toolbar>
    </AppBar>
  );
}

function DashboardPage() {
  const totalClientes = mockClients.length;
  const materials = getMaterialRows();
  const totalMateriales = materials.length;
  const materialesCriticos = materials.filter((material) =>
    material.minStock > 0 && material.available <= material.minStock,
  ).length;
  const dashboardMetrics = metricCards.map((item) => item.title === "Inventario crítico"
    ? { ...item, value: String(materialesCriticos), detail: "Bajo stock mínimo utilizable" }
    : item);

  return (
    <Box>
      <Typography variant="h4" sx={{ mb: 3, fontWeight: 700 }}>
        Dashboard general
      </Typography>

      <Grid container spacing={2.5} sx={{ mb: 3 }}>
        {dashboardMetrics.map((item) => (
          <Grid size={{ xs: 12, sm: 6, md: 3 }} key={item.title}>
            <StatCard
              title={item.title}
              value={item.value}
              detail={item.detail}
              tone={item.tone as "success" | "warning" | "error" | "primary"}
            />
          </Grid>
        ))}
      </Grid>

      <Grid container spacing={2.5}>
        <Grid size={{ xs: 12, lg: 8 }}>
          <Paper sx={{ p: 2.5, borderRadius: 3, boxShadow: "none", border: "1px solid rgba(148,163,184,0.15)" }}>
            <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "center", mb: 2 }}>
              <Typography variant="h6">Evolución operativa</Typography>
              <Chip label="Seguimiento mensual" color="primary" variant="outlined" />
            </Stack>

            <Box
              sx={{
                height: 220,
                background: "linear-gradient(180deg, rgba(37,99,235,0.08), rgba(37,99,235,0.02))",
                borderRadius: 3,
                position: "relative",
                overflow: "hidden",
              }}
            >
              {[60, 72, 74, 80, 76, 88, 96].map((height, index) => (
                <Box
                  key={index}
                  sx={{
                    position: "absolute",
                    left: `${8 + index * 12}%`,
                    bottom: 24,
                    width: 30,
                    height: `${height}%`,
                    borderRadius: "12px 12px 0 0",
                    background: index === 6 ? "#2563eb" : "#93c5fd",
                  }}
                />
              ))}
            </Box>
          </Paper>
        </Grid>

        <Grid size={{ xs: 12, lg: 4 }}>
          <Paper sx={{ p: 2.5, borderRadius: 3, boxShadow: "none", border: "1px solid rgba(148,163,184,0.15)" }}>
            <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "center", mb: 2 }}>
              <Typography variant="h6">Resumen operativo</Typography>
              <WarningAmber color="warning" />
            </Stack>

            <Stack spacing={2}>
              <SummaryRow label="Clientes activos" value={String(totalClientes)} />
              <SummaryRow label="Materiales" value={String(totalMateriales)} />
              <SummaryRow label="Críticos" value={String(materialesCriticos)} />
              <SummaryRow label="OT abiertas" value="32" />
            </Stack>
          </Paper>
        </Grid>
      </Grid>

      <Grid container spacing={2.5} sx={{ mt: 1 }}>
        <Grid size={{ xs: 12, md: 6 }}>
          <Paper sx={{ p: 2.5, borderRadius: 3, boxShadow: "none", border: "1px solid rgba(148,163,184,0.15)" }}>
            <Typography variant="h6" sx={{ mb: 2 }}>Tareas programadas</Typography>
            <Stack spacing={2}>
              {tasks.map((task) => (
                <Box
                  key={task}
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    gap: 2,
                    p: 1.5,
                    borderRadius: 2,
                    background: "#f8fafc",
                  }}
                >
                  <Box sx={{ width: 10, height: 10, background: "#2563eb", borderRadius: "50%" }} />
                  <Typography sx={{ fontSize: 14 }}>{task}</Typography>
                </Box>
              ))}
            </Stack>
          </Paper>
        </Grid>

        <Grid size={{ xs: 12, md: 6 }}>
          <Paper sx={{ p: 2.5, borderRadius: 3, boxShadow: "none", border: "1px solid rgba(148,163,184,0.15)" }}>
            <Typography variant="h6" sx={{ mb: 2 }}>Indicadores clave</Typography>
            <Stack spacing={2}>
              <ProgressRow label="Cumplimiento de mantenimiento" value={86} />
              <ProgressRow label="Disponibilidad de equipos" value={91} />
              <ProgressRow label="Eficiencia de producción" value={78} />
              <ProgressRow label="Cobranza a tiempo" value={94} />
            </Stack>
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
}

function ClientesPage() {
  type ClientRecord = (typeof mockClients)[number] & {
    contractCode?: string;
    wbs?: string[];
    attachment?: { name: string; dataUrl: string };
  };
  const storageKey = "pmoptimizer-clients";
  const [clients, setClients] = useState<ClientRecord[]>(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (!saved) return mockClients;
      const parsed: unknown = JSON.parse(saved);
      return Array.isArray(parsed) ? parsed as ClientRecord[] : mockClients;
    } catch (error) {
      console.warn("No se pudieron leer los clientes guardados.", error);
      return mockClients;
    }
  });
  const [showForm, setShowForm] = useState(false);
  const [clientDraft, setClientDraft] = useState({ name: "", sector: "", contractCode: "", wbs: "", amount: "" });
  const [attachment, setAttachment] = useState<ClientRecord["attachment"]>();
  const [clientError, setClientError] = useState("");

  const saveClient = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const amount = Number(clientDraft.amount);
    const wbs = clientDraft.wbs.split(",").map((value) => value.trim()).filter(Boolean);
    if (!clientDraft.name.trim() || !clientDraft.sector.trim() || !clientDraft.contractCode.trim() ||
      !wbs.length || !Number.isFinite(amount) || amount < 0 || !attachment ||
      clients.some((client) => client.contractCode?.toLowerCase() === clientDraft.contractCode.trim().toLowerCase())) {
      setClientError("Completa todos los campos, indica códigos WBS válidos y asegúrate de que el código de contrato no esté duplicado.");
      return;
    }
    const next = [...clients, {
      id: `CLI-${Date.now()}`,
      name: clientDraft.name.trim(),
      sector: clientDraft.sector.trim(),
      status: "Activo",
      amount,
      contractCode: clientDraft.contractCode.trim(),
      wbs,
      attachment,
    }];
    try {
      localStorage.setItem(storageKey, JSON.stringify(next));
      setClients(next);
      setShowForm(false);
      setClientDraft({ name: "", sector: "", contractCode: "", wbs: "", amount: "" });
      setAttachment(undefined);
      setClientError("");
    } catch (error) {
      console.error("No se pudo guardar el nuevo cliente.", error);
      setClientError("No se pudo guardar el cliente. Verifica el espacio disponible del navegador.");
    }
  };

  return (
    <Box>
      <Stack direction={{ xs: "column", sm: "row" }} sx={{ justifyContent: "space-between", alignItems: { xs: "flex-start", sm: "center" }, mb: 3 }} spacing={2}>
        <Typography variant="h4" sx={{ fontWeight: 700 }}>Clientes</Typography>
        <Button variant="contained" startIcon={<Add />} onClick={() => setShowForm((value) => !value)} sx={{ borderRadius: 2, textTransform: "none" }}>
          {showForm ? "Cancelar" : "Nuevo cliente"}
        </Button>
      </Stack>
      {clientError && <Alert severity="error" sx={{ mb: 2 }}>{clientError}</Alert>}
      {showForm && (
        <Paper component="form" onSubmit={saveClient} sx={{ p: 3, mb: 3 }}>
          <Typography variant="h6" sx={{ mb: 2 }}>Cliente, contrato y WBS</Typography>
          <Grid container spacing={2}>
            <Grid size={{ xs: 12, md: 4 }}><TextField label="Razón social" value={clientDraft.name} onChange={(event) => setClientDraft((current) => ({ ...current, name: event.target.value }))} required fullWidth /></Grid>
            <Grid size={{ xs: 12, md: 3 }}><TextField label="Sector" value={clientDraft.sector} onChange={(event) => setClientDraft((current) => ({ ...current, sector: event.target.value }))} required fullWidth /></Grid>
            <Grid size={{ xs: 12, md: 2 }}><TextField label="Código de contrato" value={clientDraft.contractCode} onChange={(event) => setClientDraft((current) => ({ ...current, contractCode: event.target.value }))} required fullWidth /></Grid>
            <Grid size={{ xs: 12, md: 3 }}><TextField label="Monto anual CLP" type="number" value={clientDraft.amount} onChange={(event) => setClientDraft((current) => ({ ...current, amount: event.target.value }))} required fullWidth /></Grid>
            <Grid size={{ xs: 12, md: 8 }}><TextField label="Estructura WBS (códigos separados por coma)" value={clientDraft.wbs} onChange={(event) => setClientDraft((current) => ({ ...current, wbs: event.target.value }))} helperText="Ejemplo: CT-001-PRE, CT-001-COR, CT-001-MAT" required fullWidth /></Grid>
            <Grid size={{ xs: 12, md: 4 }}>
              <Button component="label" variant="outlined" fullWidth sx={{ height: 56 }}>
                {attachment?.name ?? "Adjuntar contrato (máx. 2 MB)"}
                <input hidden type="file" accept=".pdf,.doc,.docx,image/*" onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (!file) return;
                  if (file.size > 2 * 1024 * 1024) {
                    setClientError("El archivo supera el límite local de 2 MB.");
                    event.target.value = "";
                    return;
                  }
                  const reader = new FileReader();
                  reader.onload = () => {
                    if (typeof reader.result === "string") {
                      setAttachment({ name: file.name, dataUrl: reader.result });
                      setClientError("");
                    }
                  };
                  reader.onerror = () => setClientError("No se pudo leer el archivo de contrato.");
                  reader.readAsDataURL(file);
                }} />
              </Button>
            </Grid>
            <Grid size={{ xs: 12 }}><Button type="submit" variant="contained">Crear cliente y contrato</Button></Grid>
          </Grid>
        </Paper>
      )}

      <Paper sx={{ p: 2, borderRadius: 3, overflowX: "auto", border: "1px solid rgba(148,163,184,0.15)" }}>
        <Box component="table" sx={{ width: "100%", minWidth: 850, borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <TableHeadCell>Cliente</TableHeadCell>
              <TableHeadCell>Sector</TableHeadCell>
              <TableHeadCell>Estado</TableHeadCell>
              <TableHeadCell align="right">Monto anual</TableHeadCell>
              <TableHeadCell>Contrato / WBS</TableHeadCell>
            </tr>
          </thead>
          <tbody>
            {clients.map((client) => (
              <tr key={client.id}>
                <TableBodyCell>
                  <Box>
                    <Typography sx={{ fontWeight: 700 }}>{client.name}</Typography>
                    <Typography variant="caption" color="text.secondary">{client.id}</Typography>
                  </Box>
                </TableBodyCell>
                <TableBodyCell>{client.sector}</TableBodyCell>
                <TableBodyCell>
                  <Chip
                    label={client.status}
                    color={client.status === "Activo" ? "success" : "warning"}
                    size="small"
                    sx={{ borderRadius: 1 }}
                  />
                </TableBodyCell>
                <TableBodyCell align="right">
                  <Typography sx={{ fontWeight: 700 }}>
                    {new Intl.NumberFormat("es-CL", {
                      style: "currency",
                      currency: "CLP",
                      maximumFractionDigits: 0,
                    }).format(client.amount)}
                  </Typography>
                </TableBodyCell>
                <TableBodyCell>
                  {client.contractCode && <Typography sx={{ display: "block" }} variant="caption">Contrato: {client.contractCode} · WBS: {client.wbs?.join(", ")}</Typography>}
                  {client.attachment && <Button size="small" component="a" href={client.attachment.dataUrl} download={client.attachment.name}>Descargar contrato</Button>}
                </TableBodyCell>
              </tr>
            ))}
          </tbody>
        </Box>
      </Paper>
    </Box>
  );
}

function MaterialesPage() {
  const materials = getMaterialRows();

  return (
    <Box>
      <Stack direction={{ xs: "column", sm: "row" }} sx={{ justifyContent: "space-between", alignItems: { xs: "flex-start", sm: "center" }, mb: 3 }} spacing={2}>
        <Typography variant="h4" sx={{ fontWeight: 700 }}>Materiales y repuestos</Typography>
        <Button variant="contained" startIcon={<Add />} sx={{ borderRadius: 2, textTransform: "none" }}>
          Nuevo material
        </Button>
      </Stack>

      <Paper sx={{ p: 2, borderRadius: 3, overflow: "hidden", border: "1px solid rgba(148,163,184,0.15)" }}>
        <Box component="table" sx={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <TableHeadCell>Código</TableHeadCell>
              <TableHeadCell>Material</TableHeadCell>
              <TableHeadCell>Categoría</TableHeadCell>
              <TableHeadCell>Disponible</TableHeadCell>
              <TableHeadCell>Bloqueado QC</TableHeadCell>
              <TableHeadCell>En tránsito</TableHeadCell>
              <TableHeadCell>Mínimo</TableHeadCell>
              <TableHeadCell>Estado</TableHeadCell>
            </tr>
          </thead>
          <tbody>
            {materials.map((item) => {
              const hasMinimum = item.minStock > 0;
              const isCritical = hasMinimum && item.available <= item.minStock;
              return (
                <tr key={item.code}>
                  <TableBodyCell>{item.code}</TableBodyCell>
                  <TableBodyCell>{item.name}</TableBodyCell>
                  <TableBodyCell>{item.category}</TableBodyCell>
                  <TableBodyCell>{item.available} {item.unit}</TableBodyCell>
                  <TableBodyCell>{item.quality} {item.unit}</TableBodyCell>
                  <TableBodyCell>{item.inTransit} {item.unit}</TableBodyCell>
                  <TableBodyCell>{item.minStock} {item.unit}</TableBodyCell>
                  <TableBodyCell>
                    <Chip
                      label={!hasMinimum ? "Sin mínimo" : isCritical ? "Crítico" : "OK"}
                      color={!hasMinimum ? "default" : isCritical ? "error" : "success"}
                      size="small"
                      sx={{ borderRadius: 1 }}
                    />
                  </TableBodyCell>
                </tr>
              );
            })}
          </tbody>
        </Box>
      </Paper>
    </Box>
  );
}

function StatCard({
  title,
  value,
  detail,
  tone,
}: {
  title: string;
  value: string;
  detail: string;
  tone: "success" | "warning" | "error" | "primary";
}) {
  const tones = {
    success: { bg: "#ecfdf5", color: "#166534" },
    warning: { bg: "#fffbeb", color: "#92400e" },
    error: { bg: "#fef2f2", color: "#991b1b" },
    primary: { bg: "#eff6ff", color: "#1d4ed8" },
  };

  return (
    <Card sx={{ borderRadius: 3, boxShadow: "none", border: "1px solid rgba(148,163,184,0.15)" }}>
      <CardContent sx={{ p: 2.5 }}>
        <Typography variant="caption" sx={{ color: "text.secondary" }}>{title}</Typography>
        <Typography variant="h5" sx={{ mt: 1, fontWeight: 800 }}>{value}</Typography>
        <Box
          sx={{
            mt: 1.5,
            display: "inline-flex",
            px: 1.2,
            py: 0.55,
            borderRadius: 2,
            fontSize: 12,
            background: tones[tone].bg,
            color: tones[tone].color,
          }}
        >
          {detail}
        </Box>
      </CardContent>
    </Card>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", py: 0.4 }}>
      <Typography color="text.secondary">{label}</Typography>
      <Typography sx={{ fontWeight: 700 }}>{value}</Typography>
    </Box>
  );
}

function ProgressRow({ label, value }: { label: string; value: number }) {
  return (
    <Box>
      <Stack direction="row" sx={{ justifyContent: "space-between", mb: 0.8 }}>
        <Typography variant="body2">{label}</Typography>
        <Typography variant="body2" sx={{ fontWeight: 700 }}>{value}%</Typography>
      </Stack>
      <Box sx={{ height: 8, background: "#e2e8f0", borderRadius: 10, overflow: "hidden" }}>
        <Box sx={{ width: `${value}%`, height: "100%", background: "linear-gradient(90deg, #2563eb, #60a5fa)", borderRadius: 10 }} />
      </Box>
    </Box>
  );
}

function ModulePage({ title }: { title: string }) {
  return (
    <Paper sx={{ p: 3, borderRadius: 3, border: "1px solid rgba(148,163,184,0.15)", boxShadow: "none" }}>
      <Typography variant="h4" sx={{ mb: 1, fontWeight: 700 }}>{title}</Typography>
      <Typography color="text.secondary">
        Este módulo aún no está implementado.
      </Typography>
    </Paper>
  );
}

function TableHeadCell({
  children,
  align = "left",
}: {
  children: ReactNode;
  align?: "left" | "right" | "center";
}) {
  return (
    <th style={{ textAlign: align, padding: "14px 16px", borderBottom: "1px solid #e2e8f0", color: "#475569", fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>
      {children}
    </th>
  );
}

function TableBodyCell({
  children,
  align = "left",
}: {
  children: ReactNode;
  align?: "left" | "right" | "center";
}) {
  return (
    <td style={{ padding: "16px", borderBottom: "1px solid #f1f5f9", textAlign: align, verticalAlign: "middle" }}>
      {children}
    </td>
  );
}

export default App;