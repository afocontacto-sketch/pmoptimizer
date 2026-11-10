import { Alert, Box, Grid, Paper, Stack, Tab, Tabs, Typography } from "@mui/material";
import { useSearchParams } from "react-router-dom";
import type { Role } from "../../app/roles";
import { KpiCard } from "../../components/KpiCard";
import { money } from "../../data/format";
import { useFeedback } from "../../hooks/useOperations";
import { costSummary } from "../operationsData";
import AssignmentTab from "./AssignmentTab";
import ClosedOrdersTab from "./ClosedOrdersTab";
import CreateOrderForm from "./CreateOrderForm";
import OrdersBoard from "./OrdersBoard";
import PlanCallsTab from "./PlanCallsTab";
import ProductionOrdersTab from "./ProductionOrdersTab";
import ReopenDialog from "./ReopenDialog";
import TeamTab from "./TeamTab";
import { useProductionCtx } from "./useProductionCtx";
import WbsCostTab from "./WbsCostTab";

// Pestañas por id; ?tab=equipo (redirect de /personal) y ?tab=ordenes (botón "Nueva OT") se resuelven aquí.
export default function ProductionPage({ user, role }: { user: string; role: Role }) {
  const { message, error, setMessage, setError } = useFeedback();
  const ctx = useProductionCtx(user, role, { setMessage, setError });
  const [params, setParams] = useSearchParams();
  const { isSupervisor, canCloseOrders, canCreate, contracts, visibleOrders, stock } = ctx;
  const canSeeCosts = role !== "Supervisor" && role !== "Técnico";
  const tabs = [
    { id: "ordenes", label: "Órdenes de trabajo" },
    ...(canSeeCosts ? [{ id: "costos", label: "Contrato y costos WBS" }] : []),
    ...(canSeeCosts && canCloseOrders ? [{ id: "cerradas", label: "OT cerradas" }] : []),
    ...(isSupervisor ? [{ id: "equipo", label: "Personal" }] : []),
    { id: "produccion", label: "Órdenes de producción" },
  ];
  const active = tabs.find((item) => item.id === params.get("tab"))?.id ?? tabs[0].id;
  const { actual: monthlyActual, committed: monthlyCommitted } = costSummary(visibleOrders, stock);
  const totalBudget = contracts[0].wbs.reduce((sum, item) => sum + item.budget, 0);

  return (
    <Stack spacing={3}>
      <Box>
        <Typography variant="h4" sx={{ fontWeight: 700 }}>Operaciones y órdenes de trabajo</Typography>
        <Typography color="text.secondary">Demostración con datos ficticios del contrato CT1234.</Typography>
      </Box>
      <Alert severity="warning">
        Prototipo local: estos datos de prueba se guardan en este navegador. Costos, roles, permisos e inventario requieren validación de backend antes de producción.
      </Alert>
      {message && <Alert severity="success">{message}</Alert>}
      {error && <Alert severity="error">{error}</Alert>}

      {!isSupervisor && (
        <Grid container spacing={2}>
          {[
            { label: "Presupuesto CT1234", value: money(totalBudget) },
            { label: "Costo real registrado", value: money(monthlyActual) },
            { label: "Comprometido estimado", value: money(monthlyCommitted) },
            { label: "Proyección actual", value: money(monthlyActual + monthlyCommitted) },
          ].map((item) => (
            <Grid size={{ xs: 12, sm: 6, lg: 3 }} key={item.label}>
              <KpiCard label={item.label} value={item.value} />
            </Grid>
          ))}
        </Grid>
      )}

      <Paper sx={{ px: 2 }}>
        <Tabs value={active} onChange={(_, value: string) => setParams({ tab: value }, { replace: true })} variant="scrollable" allowScrollButtonsMobile>
          {tabs.map((item) => <Tab key={item.id} value={item.id} label={item.label} />)}
        </Tabs>
      </Paper>

      {active === "ordenes" && canCreate && (
        <Stack spacing={3}>
          <PlanCallsTab ctx={ctx} />
          <CreateOrderForm ctx={ctx} />
          <OrdersBoard ctx={ctx} />
        </Stack>
      )}
      {active === "ordenes" && isSupervisor && <AssignmentTab ctx={ctx} />}
      {active === "costos" && <WbsCostTab ctx={ctx} />}
      {active === "cerradas" && <ClosedOrdersTab ctx={ctx} />}
      {active === "equipo" && <TeamTab ctx={ctx} />}
      {active === "produccion" && <ProductionOrdersTab user={user} role={role} />}

      <ReopenDialog ctx={ctx} />
    </Stack>
  );
}
