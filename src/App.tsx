import { getAppDataBackup, parseBackup, resetDemoData, restoreBackup } from "./data/backup";
import { backupFilePrefix } from "./data/keys";
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
import EngineeringPage from "./modules/EngineeringPage";
import MaterialsMaster from "./modules/materials/MaterialsMaster";
import { getMaterialRows, isCritical } from "./modules/materials/materialRows";
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
import { BrandLogo } from "./components/BrandLogo";
import { allowedOrderTypes, can } from "./app/permissions";
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
            <Route path="/clientes" element={<RoleRoute role={session.role} path="/clientes"><ClientsPage role={session.role} /></RoleRoute>} />
            <Route path="/materiales" element={<RoleRoute role={session.role} path="/materiales"><MaterialsMaster mode={can(session.role, "material.create") ? "master" : "readonly"} user={session.user} role={session.role} /></RoleRoute>} />
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
            <Route path="/ingenieria" element={<RoleRoute role={session.role} path="/ingenieria"><EngineeringPage user={session.user} role={session.role} /></RoleRoute>} />
            <Route path="/planes-mantenimiento" element={<RoleRoute role={session.role} path="/planes-mantenimiento"><MaintenancePlanning role={session.role} /></RoleRoute>} />
            <Route path="/planning" element={<RoleRoute role={session.role} path="/planning"><MaintenancePlanning role={session.role} /></RoleRoute>} />
            <Route path="/supply" element={<RoleRoute role={session.role} path="/supply"><SupplyPage user={session.user} role={session.role} /></RoleRoute>} />
            <Route path="/pm" element={<RoleRoute role={session.role} path="/pm"><ProjectManagement role={session.role} /></RoleRoute>} />
            <Route path="/respaldo" element={<RoleRoute role={session.role} path="/respaldo"><DataBackupPage role={session.role} /></RoleRoute>} />
            <Route path="/" element={<Navigate to={defaultRoute(session.role)} replace />} />
            <Route path="*" element={<ModulePage title="Página no encontrada" />} />
          </Routes>
        </Box>
      </Box>
    </Box>
  );
}

function DataBackupPage({ role }: { role: Role }) {
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const resetDemo = () => {
    setError("");
    setMessage("");
    if (!window.confirm("Se borrarán todos los datos de este navegador y se cargarán los datos demo. ¿Deseas continuar?")) return;
    const result = resetDemoData(role);
    if (!result.ok) setError(result.error);
    else setMessage("Datos demo restablecidos. Recarga la página para verlos en todos los módulos.");
  };

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
      const parsed = parseBackup(await file.text());
      if (!parsed.ok) throw new Error(parsed.error);
      const count = Object.keys(parsed.value.data).length;
      if (!window.confirm(`Se reemplazarán los datos PMOptimizer de este navegador por ${count} registros del archivo. La sesión actual se conservará. ¿Deseas continuar?`)) return;
      const restored = restoreBackup(parsed.value, role);
      if (!restored.ok) throw new Error(restored.error);
      setMessage(`Respaldo restaurado: ${restored.value} conjuntos de datos. Recarga la página para verlos en todos los módulos.`);
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
      <Paper sx={{ p: 3 }}>
        <Stack spacing={2} sx={{ alignItems: "flex-start" }}>
          <Typography variant="h6">Restablecer datos demo</Typography>
          <Typography color="text.secondary">Reemplaza todos los datos de este navegador por el conjunto demo inicial (contadores de numeración incluidos). La sesión se conserva.</Typography>
          <Button variant="outlined" color="warning" onClick={resetDemo}>Restablecer datos demo</Button>
        </Stack>
      </Paper>
    </Stack>
  );
}

function Sidebar({ role, onNavigate }: { role: Role; onNavigate?: () => void }) {
  const location = useLocation();
  const criticalMaterials = getMaterialRows().filter(isCritical).length;
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
  const materialesCriticos = materials.filter(isCritical).length;
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

export default App;