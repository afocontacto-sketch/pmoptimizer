import { useMemo, useState } from "react";
import type { FormEvent } from "react";
import {
  Alert,
  Button,
  Grid,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { Add } from "@mui/icons-material";
import { allowedOrderTypes } from "../../app/permissions";
import { money } from "../../data/format";
import { createWorkOrder, typeLabels } from "../../data/workOrders";
import type { OrderType } from "../../data/workOrders";
import { readEquipmentMaster } from "../masterData";
import { materialsForRoute, routeLaborCost } from "../operationsData";
import type { ProductionCtx } from "./useProductionCtx";

export default function CreateOrderForm({ ctx }: { ctx: ProductionCtx }) {
  const { user, role, orders, routes, plans, contracts, employees, technicianProfiles, canCreate, setError, setMessage } = ctx;
  const allowedTypes = allowedOrderTypes(role);
  const [newOrder, setNewOrder] = useState(() => ({
    type: (allowedTypes[0] ?? "PRE") as OrderType,
    contract: contracts[0].code,
    planId: "",
    routeId: routes[0]?.id ?? "",
    equipment: "",
    description: "",
    technician: technicianProfiles[0].name,
    dueDate: new Date().toISOString().slice(0, 10),
  }));
  const currentContract = contracts.find((contract) => contract.code === newOrder.contract) ?? contracts[0];
  const selectedRoute = routes.find((route) => route.id === newOrder.routeId);
  const selectedPlan = plans.find((plan) => plan.id === newOrder.planId);
  const equipmentOptions = useMemo(() => {
    const masterEquipment = readEquipmentMaster();
    const allValues = [
      ...masterEquipment.map((item) => item.code),
      ...plans.map((plan) => plan.equipmentId),
      ...orders.map((order) => order.equipment),
    ];
    return [...new Set(allValues.filter(Boolean))].map((value) => ({
      value,
      label: (() => {
        const equipment = masterEquipment.find((item) => item.code === value);
        return equipment
          ? `${value}${equipment.serialNumber ? ` · Serie ${equipment.serialNumber}` : ""} · ${equipment.name}${equipment.contractCode ? ` · ${equipment.contractCode}` : ""}`
          : value;
      })(),
    }));
  }, [orders, plans]);

  const createOrder = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canCreate) {
      setError("Tu rol no tiene permiso para crear órdenes de trabajo.");
      return;
    }
    const route = newOrder.type === "ESPERA"
      ? undefined
      : routes.find((item) => item.id === newOrder.routeId);
    if (newOrder.type !== "ESPERA" && !route) {
      setError("Selecciona una hoja de ruta de Industrial para calcular horas y materiales de la OT.");
      return;
    }
    if (!newOrder.equipment.trim() || !newOrder.description.trim()) {
      setError("Completa equipo y descripción de la OT.");
      return;
    }
    const selectedPlan = plans.find((plan) => plan.id === newOrder.planId);
    const wbs = selectedPlan?.wbs || currentContract.wbs.find((item) => item.type === newOrder.type)?.code || "";
    if (!wbs) {
      setError("El contrato seleccionado no tiene un WBS configurado para este tipo de OT.");
      return;
    }
    const projectedHours = route?.operations.reduce((sum, item) => sum + item.durationHours, 0) ?? 0;
    const selectedContract = contracts.find((contract) => contract.code === selectedPlan?.contract) ?? currentContract;
    const technician = newOrder.technician
      ? technicianProfiles.find((item) => item.name === newOrder.technician) ?? technicianProfiles[0]
      : undefined;
    const result = createWorkOrder({
      contract: selectedContract.code,
      wbs,
      planId: selectedPlan?.id,
      routeId: route?.id,
      routeName: route?.name,
      routeOperations: route?.operations,
      type: newOrder.type,
      equipment: selectedPlan?.equipmentId || newOrder.equipment.trim(),
      description: `${newOrder.description.trim()}${selectedPlan ? ` · Plan ${selectedPlan.id}` : ""}`,
      assignees: technician
        ? [{ employeeId: employees.find((item) => item.name === technician.name)?.id ?? "", name: technician.name }]
        : [],
      projectedHours,
      projectedLaborCost: route ? routeLaborCost(route) : 0,
      materials: route ? materialsForRoute(route) : [],
      dueDate: newOrder.dueDate,
    }, { user, role });
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setNewOrder((current) => ({ ...current, equipment: "", description: "" }));
    setError("");
    setMessage(`OT ${result.value.id} creada con ${route?.name ?? "sin hoja (orden de espera)"}; materiales y horas de ruta asociados a ${wbs}.`);
  };

  return (
    <Paper sx={{ p: 3 }}>
      <Typography variant="h6" sx={{ mb: 2 }}>Crear OT vinculada a una hoja de ruta</Typography>
      <Stack component="form" onSubmit={createOrder} spacing={2}>
        <Grid container spacing={2}>
          <Grid size={{ xs: 12, sm: 6, lg: 2 }}>
            <TextField select label="Contrato" value={newOrder.contract} onChange={(event) => setNewOrder((current) => ({ ...current, contract: event.target.value, planId: "" }))} fullWidth>
              {contracts.map((contract) => <MenuItem key={contract.code} value={contract.code}>{contract.code} · {contract.customer}</MenuItem>)}
            </TextField>
          </Grid>
          <Grid size={{ xs: 12, sm: 6, lg: 2 }}>
            <TextField select label="Tipo de OT" value={newOrder.type} onChange={(event) => {
              const value = event.target.value as OrderType;
              if (allowedTypes.includes(value)) {
                setNewOrder((current) => ({
                  ...current,
                  type: value,
                  routeId: value === "ESPERA" ? "" : current.routeId || routes[0]?.id || "",
                  planId: "",
                }));
              }
            }} fullWidth>
              {allowedTypes.map((code) => <MenuItem key={code} value={code}>{code} · {typeLabels[code]}</MenuItem>)}
            </TextField>
          </Grid>
          <Grid size={{ xs: 12, sm: 6, lg: 2 }}>
            <TextField select label="Plan (opcional)" value={newOrder.planId} onChange={(event) => {
              const planId = event.target.value;
              const plan = plans.find((item) => item.id === planId);
              const planContract = contracts.find((item) => item.code === plan?.contract);
              const planType = planContract?.wbs.find((item) => item.code === plan?.wbs)?.type;
              setNewOrder((current) => ({
                ...current,
                planId,
                routeId: plan?.routeId ?? current.routeId,
                equipment: plan?.equipmentId ?? current.equipment,
                contract: planContract?.code ?? current.contract,
                type: planType && allowedTypes.includes(planType) ? planType : current.type,
                description: plan ? `${plan.name} · generado desde plan` : current.description,
              }));
            }} fullWidth>
              <MenuItem value="">Sin plan</MenuItem>
              {plans.map((plan) => <MenuItem key={plan.id} value={plan.id}>{plan.id} · {plan.name}</MenuItem>)}
            </TextField>
          </Grid>
          <Grid size={{ xs: 12, sm: 6, lg: 2 }}>
            <TextField select label="Hoja de ruta" value={newOrder.routeId} disabled={newOrder.type === "ESPERA"} onChange={(event) => setNewOrder((current) => ({
              ...current,
              routeId: event.target.value,
              planId: plans.find((plan) => plan.id === current.planId)?.routeId === event.target.value ? current.planId : "",
            }))} required={newOrder.type !== "ESPERA"} fullWidth>
              <MenuItem value="">Selecciona hoja</MenuItem>
              {routes.map((route) => <MenuItem key={route.id} value={route.id}>{route.id} · {route.name}</MenuItem>)}
            </TextField>
          </Grid>
          <Grid size={{ xs: 12, sm: 6, lg: 2 }}>
            <TextField select label="Técnico" value={newOrder.technician} onChange={(event) => setNewOrder((current) => ({ ...current, technician: event.target.value }))} fullWidth>
              <MenuItem value="">Sin asignar · Supervisor asigna equipo</MenuItem>
              {technicianProfiles.map((technician) => <MenuItem key={technician.name} value={technician.name}>{technician.name} · {money(technician.rate)}/h</MenuItem>)}
            </TextField>
          </Grid>
          <Grid size={{ xs: 12, sm: 6, lg: 1 }}>
            <TextField label="Horas ruta" value={selectedRoute?.operations.reduce((sum, item) => sum + item.durationHours, 0).toFixed(1) ?? "0"} slotProps={{ input: { readOnly: true } }} fullWidth />
          </Grid>
          <Grid size={{ xs: 12, sm: 6, lg: 1 }}>
            <Button type="submit" variant="contained" startIcon={<Add />} sx={{ height: 56 }} fullWidth>Crear</Button>
          </Grid>
          <Grid size={{ xs: 12, md: 4 }}>
            <TextField select label="Equipo / activo (maestro)" value={newOrder.equipment} onChange={(event) => {
              const selectedEquipment = readEquipmentMaster().find((item) => item.code === event.target.value);
              setNewOrder((current) => ({
                ...current,
                equipment: event.target.value,
                contract: selectedEquipment?.contractCode && contracts.some((contract) => contract.code === selectedEquipment.contractCode)
                  ? selectedEquipment.contractCode
                  : current.contract,
              }));
            }} required fullWidth>
              <MenuItem value="">Selecciona un equipo</MenuItem>
              {equipmentOptions.map((item) => <MenuItem key={item.value} value={item.value}>{item.label}</MenuItem>)}
            </TextField>
          </Grid>
          <Grid size={{ xs: 12, md: 8 }}>
            <TextField label="Descripción del trabajo" value={newOrder.description} onChange={(event) => setNewOrder((current) => ({ ...current, description: event.target.value }))} required fullWidth />
          </Grid>
          <Grid size={{ xs: 12, md: 8 }}>
            <TextField label="Elemento WBS de imputación" value={selectedPlan?.wbs || currentContract.wbs.find((item) => item.type === newOrder.type)?.code || "Sin WBS para este tipo"} slotProps={{ input: { readOnly: true } }} fullWidth />
          </Grid>
          <Grid size={{ xs: 12, md: 4 }}>
            <TextField type="date" label="Fecha programada" value={newOrder.dueDate} onChange={(event) => setNewOrder((current) => ({ ...current, dueDate: event.target.value }))} slotProps={{ inputLabel: { shrink: true } }} required fullWidth />
          </Grid>
        </Grid>
        {selectedRoute && newOrder.type !== "ESPERA" && (
          <Alert severity="info">
            <strong>{selectedRoute.name}:</strong>{" "}
            {selectedRoute.operations.flatMap((item) => item.materials)
              .map((item) => `${item.code} ${item.name} (${item.quantity} ${item.unit})`)
              .join(" · ") || "sin materiales definidos"}.
            {" "}La OT conservará {selectedRoute.operations.length} operaciones y{" "}
            {selectedRoute.operations.reduce((sum, item) => sum + item.durationHours, 0).toFixed(1)} horas planificadas.
          </Alert>
        )}
      </Stack>
    </Paper>
  );
}
