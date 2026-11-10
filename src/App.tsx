import { backupFilePrefix, backupFormat, keys, KEY_PREFIX, SCHEMA } from "./data/keys";
import { Fragment, useEffect, useState } from "react";
import type { ChangeEvent, FormEvent, ReactNode } from "react";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  ThemeProvider,
  Toolbar,
  Typography,
  createTheme,
} from "@mui/material";
import {
  AccountCircle,
  Add,
  Download,
  Logout,
  Menu as MenuIcon,
  Search,
  UploadFile,
  WarningAmber,
} from "@mui/icons-material";
import {
  BrowserRouter,
  Navigate,
  NavLink,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from "react-router-dom";
import MaintenancePlanning from "./modules/MaintenancePlanning";
import IndustrialRoutes from "./modules/IndustrialRoutes";
import TechnicianInbox from "./modules/technician/TechnicianInbox";
import WarehousePage from "./modules/warehouse/WarehousePage";
import SupplyPage from "./modules/SupplyPage";
import PurchasingPage from "./modules/PurchasingPage";
import ProjectManagement from "./modules/ProjectManagement";
import AccountingPage from "./modules/AccountingPage";
import HumanResourcesPage from "./modules/HumanResourcesPage";
import ClientsPage from "./modules/ClientsPage";
import QualityPage from "./modules/quality/QualityPage";
import ProductionPage from "./modules/production/ProductionPage";
import { equipmentStorageKey, readEquipmentMaster } from "./modules/masterData";
import type { EquipmentMaster } from "./modules/masterData";
import { BrandLogo } from "./components/BrandLogo";
import { allowedOrderTypes } from "./app/permissions";
import { canAccessRoute, defaultRoute, demoAccounts } from "./app/roles";
import type { Role } from "./app/roles";
import { legacyRedirects, navItemsForRole } from "./app/navigation";
import { clearSession, readSession, saveSession } from "./app/session";
import type { Session } from "./app/session";

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

type MaterialMasterRecord = {
  code: string;
  name: string;
  minStock: number;
  category: string;
  unit: string;
};

const materialsStorageKey = keys.materialMaster;

type EquipmentContractOption = { code: string; client: string };

function readEquipmentContracts(): EquipmentContractOption[] {
  const contracts = new Map<string, EquipmentContractOption>([
    ["CT1234", { code: "CT1234", client: "Fiat Chile" }],
  ]);
  try {
    const raw = localStorage.getItem(keys.clients);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) throw new Error("El maestro de clientes no tiene formato de lista.");
    for (const item of parsed) {
      if (typeof item !== "object" || item === null ||
        !("contractCode" in item) || typeof item.contractCode !== "string" ||
        !item.contractCode.trim()) continue;
      const client = "name" in item && typeof item.name === "string" ? item.name : "Cliente";
      contracts.set(item.contractCode, { code: item.contractCode, client });
    }
  } catch (error) {
    console.warn("No se pudieron leer los contratos para asociar equipos.", error);
  }
  return [...contracts.values()];
}

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
    const raw = localStorage.getItem(keys.warehouseBins);
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

  let savedMaster: MaterialMasterRecord[] = [];
  try {
    const raw = localStorage.getItem(materialsStorageKey);
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      if (Array.isArray(parsed)) savedMaster = parsed as MaterialMasterRecord[];
      else console.warn("El maestro de materiales local no tiene formato de lista.");
    }
  } catch (error) {
    console.warn("No se pudo leer el maestro local de materiales.", error);
  }
  const master: MaterialMasterRecord[] = [...new Map(
    [...mockMaterials.map(({ code, name, minStock, category, unit }) => ({ code, name, minStock, category, unit })), ...savedMaster]
      .map((material) => [material.code, material] as const),
  ).values()];
  const knownCodes = new Set(master.map((material) => material.code));
  const known = master.map((material): MaterialRow => {
    const balance = balances?.get(material.code);
    const demoStock = mockMaterials.find((item) => item.code === material.code)?.stock ?? 0;
    return {
      ...material,
      stock: balance?.stock ?? (balances === null ? demoStock : 0),
      available: balance?.available ?? (balances === null ? demoStock : 0),
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
  "Revisar OT 51000001 en Planta Norte",
  "Ajustar stock de repuestos de freno",
  "Enviar informe mensual a cliente Minera Sur",
  "Validar cotización de mantenimiento industrial",
];

type AppDataBackup = {
  format: typeof backupFormat;
  version: 1;
  schema: typeof SCHEMA;
  exportedAt: string;
  data: Record<string, string>;
};

const appDataPrefix = KEY_PREFIX;
const sessionStorageKey = keys.session;

function getAppDataBackup(): AppDataBackup {
  const data: Record<string, string> = {};
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);
    if (key?.startsWith(appDataPrefix) && key !== sessionStorageKey) {
      const value = localStorage.getItem(key);
      if (value !== null) data[key] = value;
    }
  }
  return { format: backupFormat, version: 1, schema: SCHEMA, exportedAt: new Date().toISOString(), data };
}

function isAppDataBackup(value: unknown): value is AppDataBackup {
  if (typeof value !== "object" || value === null ||
    !("format" in value) || value.format !== backupFormat ||
    !("version" in value) || value.version !== 1 ||
    !("schema" in value) || value.schema !== SCHEMA ||
    !("data" in value) || typeof value.data !== "object" || value.data === null || Array.isArray(value.data)) {
    return false;
  }
  return Object.entries(value.data).every(([key, item]) =>
    key.startsWith(appDataPrefix) && key !== sessionStorageKey && typeof item === "string",
  );
}

function App() {
  const [session, setSession] = useState<Session | null>(readSession);

  useEffect(() => {
    if (session) saveSession(session);
    else clearSession();
  }, [session]);

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <BrowserRouter>
        <Routes>
          <Route
            path="/login"
            element={session ? <Navigate to={defaultRoute(session.role)} replace /> : <LoginPage onLogin={setSession} />}
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
                {demoAccounts.filter((account) => account.username !== "IJOV").map(({ username: accountUser, password: accountPassword, role: accountRole }) => (
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

function RoleRoute({
  role,
  path,
  children,
}: {
  role: Role;
  path: string;
  children: ReactNode;
}) {
  return canAccessRoute(role, path)
    ? <>{children}</>
    : <Navigate to={defaultRoute(role)} replace />;
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
            <Route path="/dashboard" element={<RoleRoute role={session.role} path="/dashboard"><DashboardPage /></RoleRoute>} />
            <Route path="/clientes" element={<RoleRoute role={session.role} path="/clientes"><ClientsPage /></RoleRoute>} />
            <Route path="/materiales" element={<RoleRoute role={session.role} path="/materiales"><MaterialesPage role={session.role} /></RoleRoute>} />
            <Route path="/produccion" element={<RoleRoute role={session.role} path="/produccion"><ProductionPage user={session.user} role={session.role} /></RoleRoute>} />
            <Route path="/bandeja" element={<RoleRoute role={session.role} path="/bandeja"><TechnicianInbox user={session.user} role={session.role} /></RoleRoute>} />
            {Object.entries(legacyRedirects).map(([from, to]) => (
              <Route key={from} path={from} element={<Navigate to={to} replace />} />
            ))}
            <Route path="/almacen" element={<RoleRoute role={session.role} path="/almacen"><WarehousePage user={session.user} role={session.role} /></RoleRoute>} />
            <Route path="/compras" element={<RoleRoute role={session.role} path="/compras"><PurchasingPage role={session.role} user={session.user} /></RoleRoute>} />
            <Route path="/contabilidad" element={<RoleRoute role={session.role} path="/contabilidad"><AccountingPage role={session.role} /></RoleRoute>} />
            <Route path="/rrhh" element={<RoleRoute role={session.role} path="/rrhh"><HumanResourcesPage user={session.user} role={session.role} /></RoleRoute>} />
            <Route path="/calidad" element={<RoleRoute role={session.role} path="/calidad"><QualityPage user={session.user} role={session.role} /></RoleRoute>} />
            <Route path="/ingenieria" element={<RoleRoute role={session.role} path="/ingenieria"><IndustrialRoutes user={session.user} /></RoleRoute>} />
            <Route path="/planes-mantenimiento" element={<RoleRoute role={session.role} path="/planes-mantenimiento"><MaintenancePlanning role={session.role} /></RoleRoute>} />
            <Route path="/planning" element={<RoleRoute role={session.role} path="/planning"><MaintenancePlanning role={session.role} /></RoleRoute>} />
            <Route path="/supply" element={<RoleRoute role={session.role} path="/supply"><SupplyPage /></RoleRoute>} />
            <Route path="/pm" element={<RoleRoute role={session.role} path="/pm"><ProjectManagement role={session.role} /></RoleRoute>} />
            <Route path="/respaldo" element={<RoleRoute role={session.role} path="/respaldo"><DataBackupPage /></RoleRoute>} />
            <Route path="/" element={<Navigate to={defaultRoute(session.role)} replace />} />
            <Route path="*" element={<ModulePage title="Página no encontrada" />} />
          </Routes>
        </Box>
      </Box>
    </Box>
  );
}

function DataBackupPage() {
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const exportBackup = () => {
    try {
      const backup = getAppDataBackup();
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${backupFilePrefix}-${new Date().toISOString().slice(0, 10)}.json`;
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setError("");
      setMessage(`${Object.keys(backup.data).length} conjuntos de datos exportados. Guarda el archivo en un lugar seguro.`);
    } catch (cause) {
      console.error("No se pudo exportar el respaldo de PMOptimizer.", cause);
      setError("No se pudo crear el archivo de respaldo.");
      setMessage("");
    }
  };

  const importBackup = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    setError("");
    setMessage("");
    if (!file) return;
    if (file.size > 25 * 1024 * 1024) {
      setError("El archivo supera el límite de 25 MB.");
      return;
    }
    try {
      const parsed: unknown = JSON.parse(await file.text());
      if (typeof parsed === "object" && parsed !== null && (!("schema" in parsed) || parsed.schema !== SCHEMA)) {
        throw new Error(`Respaldo rechazado: su versión de esquema no es compatible (se requiere "${SCHEMA}").`);
      }
      if (!isAppDataBackup(parsed)) {
        throw new Error("El archivo no es un respaldo válido de PMOptimizer.");
      }
      const entries = Object.entries(parsed.data);
      if (!entries.length) throw new Error("El respaldo no contiene datos para restaurar.");
      if (!window.confirm(`Se reemplazarán los datos PMOptimizer de este navegador por ${entries.length} registros del archivo. La sesión actual se conservará. ¿Deseas continuar?`)) {
        return;
      }
      const previousData: Record<string, string> = {};
      for (let index = 0; index < localStorage.length; index += 1) {
        const key = localStorage.key(index);
        if (key?.startsWith(appDataPrefix) && key !== sessionStorageKey) {
          const value = localStorage.getItem(key);
          if (value !== null) previousData[key] = value;
        }
      }
      try {
        Object.keys(previousData).forEach((key) => localStorage.removeItem(key));
        entries.forEach(([key, value]) => localStorage.setItem(key, value));
      } catch (cause) {
        Object.keys(getAppDataBackup().data).forEach((key) => localStorage.removeItem(key));
        Object.entries(previousData).forEach(([key, value]) => localStorage.setItem(key, value));
        throw cause;
      }
      setMessage(`Respaldo restaurado: ${entries.length} conjuntos de datos. Recarga la página para verlos en todos los módulos.`);
    } catch (cause) {
      console.error("No se pudo restaurar el respaldo de PMOptimizer.", cause);
      setError(cause instanceof Error ? cause.message : "No se pudo leer o restaurar el archivo.");
    }
  };

  return (
    <Stack spacing={3}>
      <Box>
        <Typography variant="h4" sx={{ fontWeight: 700 }}>Respaldo y traslado de datos</Typography>
        <Typography color="text.secondary">Exporta los datos de este navegador e impórtalos en el sitio publicado.</Typography>
      </Box>
      <Alert severity="warning">
        Esta función traslada una copia local; no habilita sincronización entre usuarios ni dispositivos. El respaldo puede contener información personal o comercial: mantenlo protegido. La sesión y las credenciales no se exportan.
      </Alert>
      {message && <Alert severity="success">{message}</Alert>}
      {error && <Alert severity="error">{error}</Alert>}
      <Paper sx={{ p: 3 }}>
        <Stack spacing={2} sx={{ alignItems: "flex-start" }}>
          <Typography variant="h6">Exportar datos actuales</Typography>
          <Typography color="text.secondary">Descarga clientes, contratos, equipos, inventario, órdenes, planificación, compras, contabilidad y recursos humanos almacenados por PMOptimizer en este navegador.</Typography>
          <Button variant="contained" startIcon={<Download />} onClick={exportBackup}>Descargar respaldo</Button>
        </Stack>
      </Paper>
      <Paper sx={{ p: 3 }}>
        <Stack spacing={2} sx={{ alignItems: "flex-start" }}>
          <Typography variant="h6">Restaurar datos en este sitio</Typography>
          <Typography color="text.secondary">Selecciona un respaldo JSON. Los datos PMOptimizer existentes en este navegador se reemplazarán; primero exporta un respaldo por seguridad.</Typography>
          <Button component="label" variant="outlined" startIcon={<UploadFile />}>
            Seleccionar respaldo JSON
            <input hidden type="file" accept=".json,application/json" onChange={importBackup} />
          </Button>
        </Stack>
      </Paper>
    </Stack>
  );
}

function Sidebar({ role, onNavigate }: { role: Role; onNavigate?: () => void }) {
  const location = useLocation();
  const criticalMaterials = getMaterialRows().filter((material) =>
    material.minStock > 0 && material.available <= material.minStock,
  ).length;
  const visibleNavItems = navItemsForRole(role);

  return (
    <Box sx={{ p: 2 }}>
      <Box sx={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 1, py: 1.5, px: 1.5 }}>
        <BrandLogo size={190} />
        <Typography variant="caption" sx={{ color: "#cbd5e1" }}>{role}</Typography>
      </Box>

      <Divider sx={{ my: 2, borderColor: "rgba(148,163,184,0.2)" }} />

      <List>
        {visibleNavItems.map((item) => (
          <ListItemButton
            key={item.label}
            component={NavLink}
            to={item.to}
            className={location.pathname === item.to ||
              (item.to === "/planning" && location.pathname === "/planes-mantenimiento")
              ? "active"
              : undefined}
            onClick={onNavigate}
            sx={{
              borderRadius: 2,
              color: "#e2e8f0",
              mb: 0.5,
              "&.active": { background: "#16a34a", color: "#fff", fontWeight: 700 },
              "&.active .MuiListItemIcon-root": { color: "#fff" },
              "&:hover": { background: "rgba(148,163,184,0.1)" },
              "&.active:hover": { background: "#15803d" },
            }}
          >
            <ListItemIcon sx={{ color: "inherit", minWidth: 36 }}><item.icon /></ListItemIcon>
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

        <Box sx={{ mr: 2, color: "#0f172a", display: { xs: "flex", md: "none" } }}>
          <BrandLogo compact />
        </Box>

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

        {allowedOrderTypes(session.role).length > 0 && (
          <Button
            variant="contained"
            startIcon={<Add />}
            onClick={() => navigate("/produccion?tab=ordenes")}
            sx={{ mr: 2, borderRadius: 2, textTransform: "none", display: { xs: "none", md: "inline-flex" } }}
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

function MaterialesPage({ role }: { role: Role }) {
  const [materials, setMaterials] = useState(getMaterialRows);
  const [equipment, setEquipment] = useState(readEquipmentMaster);
  const [equipmentDraft, setEquipmentDraft] = useState({ code: "", serialNumber: "", name: "", contractCode: "" });
  const [equipmentError, setEquipmentError] = useState("");
  const [equipmentMessage, setEquipmentMessage] = useState("");
  const [showMaterialForm, setShowMaterialForm] = useState(false);
  const [materialDraft, setMaterialDraft] = useState({ code: "", name: "", category: "", unit: "", minStock: "" });
  const [materialError, setMaterialError] = useState("");
  const isAdministrator = role === "Administrador";
  const equipmentContracts = readEquipmentContracts();

  const saveEquipment = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const code = equipmentDraft.code.trim();
    const serialNumber = equipmentDraft.serialNumber.trim();
    const name = equipmentDraft.name.trim();
    if (!code || !serialNumber || !name || equipment.some((item) => item.code.toLowerCase() === code.toLowerCase()) ||
      (serialNumber && equipment.some((item) => item.serialNumber?.toLowerCase() === serialNumber.toLowerCase())) ||
      (equipmentDraft.contractCode && !equipmentContracts.some((contract) => contract.code === equipmentDraft.contractCode))) {
      setEquipmentError("Completa código y descripción únicos, verifica que el número de serie no esté repetido y selecciona un contrato válido.");
      return;
    }
    const next = [...equipment, { code, serialNumber, name, contractCode: equipmentDraft.contractCode }];
    try {
      localStorage.setItem(equipmentStorageKey, JSON.stringify(next));
      setEquipment(readEquipmentMaster());
      setEquipmentDraft({ code: "", serialNumber: "", name: "", contractCode: "" });
      setEquipmentError("");
      setEquipmentMessage("Equipo agregado al maestro.");
    } catch (error) {
      console.error("No se pudo guardar el equipo maestro.", error);
      setEquipmentError("No se pudo guardar el equipo en este navegador.");
    }
  };

  const importEquipment = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    setEquipmentError("");
    setEquipmentMessage("");
    if (!file) return;
    if (!isAdministrator) {
      setEquipmentError("Solo el Administrador puede realizar cargas masivas.");
      return;
    }
    try {
      const lines = (await file.text()).replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => line.trim());
      if (lines.length < 2) throw new Error("El archivo CSV no contiene equipos para importar.");
      const parseRow = (line: string) => {
        const values: string[] = [];
        let value = "";
        let quoted = false;
        for (let index = 0; index < line.length; index += 1) {
          const character = line[index];
          if (character === '"' && quoted && line[index + 1] === '"') {
            value += '"';
            index += 1;
          } else if (character === '"') quoted = !quoted;
          else if (character === "," && !quoted) {
            values.push(value);
            value = "";
          } else value += character;
        }
        if (quoted) throw new Error("El archivo CSV contiene comillas sin cerrar.");
        values.push(value);
        return values;
      };
      const headers = parseRow(lines[0]).map((header) => header.trim());
      const required = ["code", "serialNumber", "name", "contractCode"];
      const indexes = new Map(headers.map((header, index) => [header, index]));
      const missing = required.filter((header) => !indexes.has(header));
      if (missing.length) throw new Error(`Faltan columnas requeridas: ${missing.join(", ")}.`);
      const imported = lines.slice(1).map((line, rowIndex): EquipmentMaster => {
        const values = parseRow(line);
        const get = (header: string) => values[indexes.get(header) ?? -1]?.trim() ?? "";
        const contractCode = get("contractCode");
        if (!get("code") || !get("serialNumber") || !get("name")) {
          throw new Error(`Fila ${rowIndex + 2}: código, número de serie y descripción son obligatorios.`);
        }
        if (contractCode && !equipmentContracts.some((contract) => contract.code === contractCode)) {
          throw new Error(`Fila ${rowIndex + 2}: el contrato ${contractCode} no existe en el maestro de contratos.`);
        }
        return {
          code: get("code"),
          serialNumber: get("serialNumber"),
          name: get("name"),
          contractCode,
        };
      });
      const existingCodes = new Set(equipment.map((item) => item.code.toLowerCase()));
      const existingSerials = new Set(equipment.map((item) => item.serialNumber?.toLowerCase()).filter(Boolean));
      const importedCodes = new Set<string>();
      const importedSerials = new Set<string>();
      for (const [index, item] of imported.entries()) {
        const code = item.code.toLowerCase();
        const serial = item.serialNumber?.toLowerCase() ?? "";
        if (existingCodes.has(code) || importedCodes.has(code)) {
          throw new Error(`Fila ${index + 2}: el código ${item.code} ya existe o está repetido.`);
        }
        if (serial && (existingSerials.has(serial) || importedSerials.has(serial))) {
          throw new Error(`Fila ${index + 2}: el número de serie ${item.serialNumber} ya existe o está repetido.`);
        }
        importedCodes.add(code);
        if (serial) importedSerials.add(serial);
      }
      const next = [...equipment, ...imported];
      localStorage.setItem(equipmentStorageKey, JSON.stringify(next));
      setEquipment(readEquipmentMaster());
      setEquipmentMessage(`${imported.length} equipo(s) agregados al maestro.`);
    } catch (error) {
      console.error("No se pudo importar el maestro de equipos.", error);
      setEquipmentError(error instanceof Error ? error.message : "No se pudo importar el archivo CSV.");
    }
  };

  const downloadEquipmentTemplate = () => {
    const csv = "code,serialNumber,name,contractCode\r\nVEH-004,SERIE-001,Equipo de ejemplo,CT1234\r\n";
    const url = URL.createObjectURL(new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "plantilla_maestro_equipos.csv";
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const saveMaterial = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const code = materialDraft.code.trim();
    const name = materialDraft.name.trim();
    const minStock = Number(materialDraft.minStock || 0);
    const master: MaterialMasterRecord[] = (() => {
      try {
        const parsed: unknown = JSON.parse(localStorage.getItem(materialsStorageKey) ?? "[]");
        if (!Array.isArray(parsed)) throw new Error("El maestro guardado de materiales tiene un formato inválido.");
        return parsed as MaterialMasterRecord[];
      } catch (error) {
        console.error("No se pudo leer el maestro de materiales antes de guardar.", error);
        return [];
      }
    })();
    if (!code || !name || !materialDraft.category.trim() || !materialDraft.unit.trim() ||
      !Number.isFinite(minStock) || minStock < 0 ||
      [...mockMaterials, ...master].some((item) => item.code.toLowerCase() === code.toLowerCase())) {
      setMaterialError("Completa código, descripción, categoría y unidad; el código no debe estar duplicado.");
      return;
    }
    const next = [...master, { code, name, category: materialDraft.category.trim(), unit: materialDraft.unit.trim(), minStock }];
    try {
      localStorage.setItem(materialsStorageKey, JSON.stringify(next));
      setMaterials(getMaterialRows());
      setMaterialDraft({ code: "", name: "", category: "", unit: "", minStock: "" });
      setMaterialError("");
      setShowMaterialForm(false);
    } catch (error) {
      console.error("No se pudo guardar el nuevo material.", error);
      setMaterialError("No se pudo guardar el material en este navegador.");
    }
  };

  const importMaterials = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    setMaterialError("");
    if (!file) return;
    if (!isAdministrator) {
      setMaterialError("Solo el Administrador puede realizar cargas masivas.");
      return;
    }
    try {
      const lines = (await file.text()).replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => line.trim());
      if (lines.length < 2) throw new Error("El archivo CSV no contiene materiales para importar.");
      const parseRow = (line: string) => {
        const values: string[] = [];
        let value = "";
        let quoted = false;
        for (let index = 0; index < line.length; index += 1) {
          const character = line[index];
          if (character === '"' && quoted && line[index + 1] === '"') {
            value += '"';
            index += 1;
          } else if (character === '"') quoted = !quoted;
          else if (character === "," && !quoted) {
            values.push(value);
            value = "";
          } else value += character;
        }
        if (quoted) throw new Error("El archivo CSV contiene comillas sin cerrar.");
        values.push(value);
        return values;
      };
      const headers = parseRow(lines[0]).map((value) => value.trim());
      const required = ["code", "name", "category", "unit", "minStock"];
      const indexes = new Map(headers.map((header, index) => [header, index]));
      const missing = required.filter((header) => !indexes.has(header));
      if (missing.length) throw new Error(`Faltan columnas requeridas: ${missing.join(", ")}.`);
      const imported = lines.slice(1).map((line, rowIndex): MaterialMasterRecord => {
        const values = parseRow(line);
        const get = (header: string) => values[indexes.get(header) ?? -1]?.trim() ?? "";
        const minStock = Number(get("minStock"));
        if (!get("code") || !get("name") || !get("category") || !get("unit") ||
          !get("minStock") || !Number.isFinite(minStock) || minStock < 0) {
          throw new Error(`Fila ${rowIndex + 2}: datos incompletos o stock mínimo inválido.`);
        }
        return { code: get("code"), name: get("name"), category: get("category"), unit: get("unit"), minStock };
      });
      const stored: MaterialMasterRecord[] = (() => {
        const raw = localStorage.getItem(materialsStorageKey);
        if (!raw) return [];
        const parsed: unknown = JSON.parse(raw);
        if (!Array.isArray(parsed)) throw new Error("El maestro guardado de materiales tiene un formato inválido.");
        return parsed as MaterialMasterRecord[];
      })();
      const existing = new Set([...mockMaterials, ...stored].map((item) => item.code.toLowerCase()));
      const importedCodes = new Set<string>();
      for (const [index, item] of imported.entries()) {
        const key = item.code.toLowerCase();
        if (existing.has(key) || importedCodes.has(key)) {
          throw new Error(`Fila ${index + 2}: el código ${item.code} ya existe o está repetido en el archivo.`);
        }
        importedCodes.add(key);
      }
      localStorage.setItem(materialsStorageKey, JSON.stringify([...stored, ...imported]));
      setMaterials(getMaterialRows());
      setMaterialError("");
    } catch (error) {
      console.error("No se pudo importar el maestro de materiales.", error);
      setMaterialError(error instanceof Error ? error.message : "No se pudo importar el archivo CSV.");
    }
  };

  const downloadMaterialTemplate = () => {
    const csv = "code,name,category,unit,minStock\r\nMAT-001,Repuesto de ejemplo,Mecánica,unidad,5\r\n";
    const url = URL.createObjectURL(new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "plantilla_maestro_materiales.csv";
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <Stack spacing={3}>
      <Stack direction={{ xs: "column", sm: "row" }} sx={{ justifyContent: "space-between", alignItems: { xs: "flex-start", sm: "center" }, mb: 3 }} spacing={2}>
        <Typography variant="h4" sx={{ fontWeight: 700 }}>Materiales y repuestos</Typography>
        {isAdministrator && <Button variant="contained" startIcon={<Add />} onClick={() => setShowMaterialForm((visible) => !visible)} sx={{ borderRadius: 2, textTransform: "none" }}>
          Nuevo material
        </Button>}
      </Stack>
      {materialError && <Alert severity="error">{materialError}</Alert>}
      {isAdministrator && (
        <Paper sx={{ p: 2 }}>
          <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
            <Button variant="outlined" onClick={downloadMaterialTemplate}>Descargar plantilla CSV</Button>
            <Button component="label" variant="outlined">
              Carga masiva de materiales · solo Administrador
              <input hidden type="file" accept=".csv,text/csv" onChange={importMaterials} />
            </Button>
          </Stack>
        </Paper>
      )}
      {showMaterialForm && isAdministrator && (
        <Paper component="form" onSubmit={saveMaterial} sx={{ p: 3 }}>
          <Typography variant="h6" sx={{ mb: 2 }}>Nuevo material en el maestro</Typography>
          <Grid container spacing={2}>
            <Grid size={{ xs: 12, sm: 2 }}><TextField label="Código" value={materialDraft.code} onChange={(event) => setMaterialDraft((current) => ({ ...current, code: event.target.value }))} required fullWidth /></Grid>
            <Grid size={{ xs: 12, sm: 4 }}><TextField label="Descripción" value={materialDraft.name} onChange={(event) => setMaterialDraft((current) => ({ ...current, name: event.target.value }))} required fullWidth /></Grid>
            <Grid size={{ xs: 12, sm: 2 }}><TextField label="Categoría" value={materialDraft.category} onChange={(event) => setMaterialDraft((current) => ({ ...current, category: event.target.value }))} required fullWidth /></Grid>
            <Grid size={{ xs: 12, sm: 2 }}><TextField label="Unidad" value={materialDraft.unit} onChange={(event) => setMaterialDraft((current) => ({ ...current, unit: event.target.value }))} required fullWidth /></Grid>
            <Grid size={{ xs: 12, sm: 2 }}><TextField label="Stock mínimo" type="number" value={materialDraft.minStock} onChange={(event) => setMaterialDraft((current) => ({ ...current, minStock: event.target.value }))} slotProps={{ htmlInput: { min: 0, step: "any" } }} required fullWidth /></Grid>
            <Grid size={{ xs: 12 }}><Button type="submit" variant="contained">Guardar material</Button></Grid>
          </Grid>
        </Paper>
      )}

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
      <Paper sx={{ p: 3 }}>
        <Typography variant="h6" sx={{ mb: 2 }}>Maestro de equipos y activos</Typography>
        {equipmentError && <Alert severity="error" sx={{ mb: 2 }}>{equipmentError}</Alert>}
        {equipmentMessage && <Alert severity="success" sx={{ mb: 2 }}>{equipmentMessage}</Alert>}
        {isAdministrator && (
          <>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={1} sx={{ mb: 2 }}>
              <Button variant="outlined" onClick={downloadEquipmentTemplate}>Descargar plantilla CSV</Button>
              <Button component="label" variant="outlined">
                Carga masiva de equipos · solo Administrador
                <input hidden type="file" accept=".csv,text/csv" onChange={importEquipment} />
              </Button>
            </Stack>
            <Stack component="form" direction={{ xs: "column", md: "row" }} spacing={1} sx={{ mb: 2 }} onSubmit={saveEquipment}>
              <TextField size="small" label="Código de equipo" value={equipmentDraft.code} onChange={(event) => setEquipmentDraft((current) => ({ ...current, code: event.target.value }))} required />
              <TextField size="small" label="Número de serie" value={equipmentDraft.serialNumber} onChange={(event) => setEquipmentDraft((current) => ({ ...current, serialNumber: event.target.value }))} required />
              <TextField size="small" label="Descripción del activo" value={equipmentDraft.name} onChange={(event) => setEquipmentDraft((current) => ({ ...current, name: event.target.value }))} required fullWidth />
              <TextField select size="small" label="Contrato asociado" value={equipmentDraft.contractCode} onChange={(event) => setEquipmentDraft((current) => ({ ...current, contractCode: event.target.value }))} sx={{ minWidth: 220 }}>
                <MenuItem value="">Sin contrato</MenuItem>
                {equipmentContracts.map((contract) => <MenuItem key={contract.code} value={contract.code}>{contract.code} · {contract.client}</MenuItem>)}
              </TextField>
              <Button type="submit" variant="outlined">Agregar al maestro</Button>
            </Stack>
          </>
        )}
        <Table size="small">
          <TableHead><TableRow><TableCell>Código</TableCell><TableCell>Número de serie</TableCell><TableCell>Descripción del activo</TableCell><TableCell>Contrato asociado</TableCell></TableRow></TableHead>
          <TableBody>{equipment.map((item) => (
            <TableRow key={item.code}>
              <TableCell>{item.code}</TableCell>
              <TableCell>{item.serialNumber || "—"}</TableCell>
              <TableCell>{item.name}</TableCell>
              <TableCell>{item.contractCode || "Sin contrato"}</TableCell>
            </TableRow>
          ))}</TableBody>
        </Table>
      </Paper>
    </Stack>
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