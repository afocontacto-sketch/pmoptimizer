import { keys } from "../data/keys";
import { readJson, updateJson } from "../data/storage";
import { useStoredValue } from "../hooks/useStore";
import { useState } from "react";
import type { FormEvent } from "react";
import {
  Autocomplete,
  Alert,
  Box,
  Button,
  Divider,
  Grid,
  MenuItem,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import { Add, DeleteOutlined, Save } from "@mui/icons-material";
import { Link } from "react-router-dom";
import { can } from "../app/permissions";
import type { Role } from "../app/roles";
import { routeStorageKey, sampleRoutes } from "./maintenanceData";
import type { RouteMaterial, RouteOperation, RouteTemplate } from "./maintenanceData";
import { getEmployeeHourlyRate, readHrEmployees } from "./HumanResourcesPage";

type OperationDraft = {
  name: string;
  durationHours: string;
  hourlyCost: string;
  technician: string;
};

type MaterialDraft = {
  code: string;
  name: string;
  quantity: string;
  unit: string;
  unitCost: string;
};

type MaterialOption = {
  code: string;
  name: string;
  unit: string;
  unitCost: number;
};

function readMaterialOptions(): MaterialOption[] {
  const fallback: MaterialOption[] = [
    { code: "MAT-114", name: "Cinta aislante 3M", unit: "rollo", unitCost: 3500 },
    { code: "MAT-301", name: "Motor eléctrico 7.5HP", unit: "unidad", unitCost: 285000 },
    { code: "MAT-422", name: "Rodamiento SKF 6205", unit: "unidad", unitCost: 7800 },
    { code: "MAT-880", name: "Soldadura ER70S-6", unit: "kilo", unitCost: 0 },
  ];
  try {
    const raw = localStorage.getItem(keys.warehouseBins);
    if (!raw) return fallback;
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      console.warn("El inventario local no tiene formato de lista; se muestran materiales demo.");
      return fallback;
    }
    const materials = new Map<string, MaterialOption>(
      fallback.map((item): [string, MaterialOption] => [item.code, item]),
    );
    for (const row of parsed) {
      if (typeof row !== "object" || row === null ||
        !("code" in row) || typeof row.code !== "string" ||
        !("name" in row) || typeof row.name !== "string" ||
        !("unit" in row) || typeof row.unit !== "string") continue;
      const current = materials.get(row.code);
      const unitCost = "unitCost" in row && typeof row.unitCost === "number" && Number.isFinite(row.unitCost)
        ? row.unitCost
        : current?.unitCost ?? 0;
      materials.set(row.code, {
        code: row.code,
        name: row.name,
        unit: row.unit,
        unitCost: current ? (current.unitCost + unitCost) / 2 : unitCost,
      });
    }
    return [...materials.values()];
  } catch (error) {
    console.warn("No se pudo leer el catálogo desde el inventario; se muestran materiales demo.", error);
    return fallback;
  }
}

function readRoutes(): RouteTemplate[] {  const stored = readJson<unknown>(routeStorageKey, sampleRoutes);  return Array.isArray(stored) ? (stored as RouteTemplate[]) : sampleRoutes;}

function makeRouteId(): string {
  return `HR-IND-${Date.now().toString(36).toUpperCase()}`;
}

function money(value: number): string {
  return new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: "CLP",
    maximumFractionDigits: 0,
  }).format(value);
}

export default function IndustrialRoutes({ user, role }: { user: string; role: Role }) {
  const canEdit = can(role, "route.edit");
  const routes = useStoredValue(routeStorageKey, readRoutes);
  const [materialOptions] = useState<MaterialOption[]>(readMaterialOptions);
  const [employees] = useState(readHrEmployees);
  const firstEmployee = employees.find((employee) => employee.direct) ?? employees[0];
  const [routeName, setRouteName] = useState("");
  const [operation, setOperation] = useState<OperationDraft>({
    name: "",
    durationHours: "1",
    hourlyCost: String(firstEmployee ? getEmployeeHourlyRate(firstEmployee.name, 0) : 0),
    technician: firstEmployee?.name ?? "",
  });
  const [material, setMaterial] = useState<MaterialDraft>({
    code: "",
    name: "",
    quantity: "1",
    unit: "unidad",
    unitCost: "0",
  });
  const [operationMaterials, setOperationMaterials] = useState<RouteMaterial[]>([]);
  const [operations, setOperations] = useState<RouteOperation[]>([]);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const addMaterial = () => {
    const quantity = Number(material.quantity);
    if (!material.code.trim() || !material.name.trim() || !material.unit.trim() ||
      !Number.isFinite(quantity) || quantity <= 0) {
      setError("Selecciona un material válido e indica una cantidad mayor a cero.");
      return;
    }
    const catalogItem = materialOptions.find((item) => item.code === material.code.trim().toUpperCase());
    setOperationMaterials((current) => [...current, {
      code: material.code.trim().toUpperCase(),
      name: material.name.trim(),
      quantity,
      unit: material.unit.trim(),
      unitCost: catalogItem?.unitCost ?? 0,
    }]);
    setMaterial({ code: "", name: "", quantity: "1", unit: "unidad", unitCost: "0" });
    setError("");
    setMessage("");
  };

  const addOperation = () => {
    const durationHours = Number(operation.durationHours);
    const hourlyCost = Number(operation.hourlyCost);
    if (!operation.name.trim() || !Number.isFinite(durationHours) || durationHours <= 0 ||
      !Number.isFinite(hourlyCost) || hourlyCost < 0 ||
      !employees.some((employee) => employee.name === operation.technician && employee.direct)) {
      setError("Completa una operación, duración y recurso técnico con costo hora vigente en Recursos Humanos.");
      return;
    }
    setOperations((current) => [...current, {
      order: (current.length + 1) * 10,
      name: operation.name.trim(),
      durationHours,
      hourlyCost: getEmployeeHourlyRate(operation.technician, hourlyCost),
      technician: operation.technician,
      materials: operationMaterials,
    }]);
    setOperation({ name: "", durationHours: "1", hourlyCost: String(firstEmployee ? getEmployeeHourlyRate(firstEmployee.name, 0) : 0), technician: firstEmployee?.name ?? "" });
    setOperationMaterials([]);
    setError("");
    setMessage("");
  };

  const saveRoute = (event: FormEvent<HTMLFormElement>) => {
    if (!canEdit) return;
    event.preventDefault();
    const finalOperations = [...operations];
    if (operation.name.trim()) {
      const durationHours = Number(operation.durationHours);
      const hourlyCost = Number(operation.hourlyCost);
      if (!Number.isFinite(durationHours) || durationHours <= 0 ||
        !Number.isFinite(hourlyCost) || hourlyCost < 0 ||
        !employees.some((employee) => employee.name === operation.technician && employee.direct)) {
        setError("Revisa las horas y el recurso técnico de la última operación.");
        return;
      }
      finalOperations.push({
        order: (finalOperations.length + 1) * 10,
        name: operation.name.trim(),
        durationHours,
        hourlyCost: getEmployeeHourlyRate(operation.technician, hourlyCost),
        technician: operation.technician,
        materials: operationMaterials,
      });
    } else if (operationMaterials.length) {
      setError("Agrega una operación antes de asociar los materiales pendientes.");
      return;
    }
    if (!routeName.trim() || finalOperations.length === 0) {
      setError("La hoja requiere nombre y al menos una operación.");
      return;
    }
    const route: RouteTemplate = {
      id: makeRouteId(),
      name: routeName.trim(),
      operations: finalOperations,
    };
    const next = [...routes, route];
if (!canEdit) {      setError("Tu rol no puede editar hojas de ruta.");      return;    }    if (updateJson<RouteTemplate[]>(routeStorageKey, sampleRoutes, () => next) === null) {      setError("No se pudo guardar la hoja de ruta.");      return;    }
    setRouteName("");
    setOperations([]);
    setOperation({ name: "", durationHours: "1", hourlyCost: String(firstEmployee ? getEmployeeHourlyRate(firstEmployee.name, 0) : 0), technician: firstEmployee?.name ?? "" });
    setOperationMaterials([]);
    setError("");
    setMessage(`${route.id} guardada por ${user}. Ya está disponible para asociar a un plan y a las OT.`);
  };

  const removeOperation = (order: number) => {
    setOperations((current) => current
      .filter((item) => item.order !== order)
      .map((item, index) => ({ ...item, order: (index + 1) * 10 })));
  };

  const draftOperation = operation.name.trim()
    ? [{
      order: (operations.length + 1) * 10,
      name: operation.name.trim(),
      durationHours: Number(operation.durationHours) || 0,
      hourlyCost: getEmployeeHourlyRate(operation.technician, Number(operation.hourlyCost) || 0),
      technician: operation.technician,
      materials: operationMaterials,
    }]
    : [];
  const previewOperations = [...operations, ...draftOperation];

  return (
    <Stack spacing={3}>
      <Box>
        <Stack direction={{ xs: "column", sm: "row" }} sx={{ justifyContent: "space-between", alignItems: { xs: "flex-start", sm: "center" }, gap: 2 }}>
          <Box>
            <Typography variant="h4" sx={{ fontWeight: 700 }}>Industrial · hojas de ruta</Typography>
            <Typography color="text.secondary">
              Define operaciones, duración y materiales requeridos para mantenimiento. El costo real de materiales se determina al consumirlos en la OT.
            </Typography>
          </Box>
          <Button component={Link} to="/planes-mantenimiento" variant="outlined">Ir a planes de mantenimiento</Button>
        </Stack>
      </Box>
      <Alert severity="info">
        Al guardar, la hoja queda disponible de inmediato en Planes de mantenimiento y en la creación de OT. Al crear la OT se guarda una copia de sus materiales y horas planificadas.
      </Alert>
      {message && <Alert severity="success">{message}</Alert>}
      {error && <Alert severity="error">{error}</Alert>}

      {canEdit ? <Paper component="form" onSubmit={saveRoute} sx={{ p: 3 }}>
        <Stack spacing={3}>
          <Typography variant="h6">Crear hoja de ruta</Typography>
          <TextField
            label="Nombre de la hoja de ruta"
            value={routeName}
            onChange={(event) => setRouteName(event.target.value)}
            placeholder="Ej.: Preventivo sistema de frenos"
            required
            fullWidth
          />

          <Paper variant="outlined" sx={{ p: 2 }}>
            <Stack spacing={2}>
              <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                Operación {operations.length + 1}
              </Typography>
              <Grid container spacing={2}>
                <Grid size={{ xs: 12, md: 5 }}>
                  <TextField label="Descripción de la actividad" value={operation.name} onChange={(event) => setOperation((current) => ({ ...current, name: event.target.value }))} fullWidth />
                </Grid>
                <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                  <TextField label="Duración estimada (h)" type="number" value={operation.durationHours} onChange={(event) => setOperation((current) => ({ ...current, durationHours: event.target.value }))} slotProps={{ htmlInput: { min: 0.1, step: 0.1 } }} fullWidth />
                </Grid>
                <Grid size={{ xs: 12, sm: 6, md: 2 }}>
                  <TextField select label="Recurso / contrato laboral" value={operation.technician} onChange={(event) => {
                    const employee = employees.find((item) => item.name === event.target.value);
                    setOperation((current) => ({ ...current, technician: event.target.value, hourlyCost: String(employee ? getEmployeeHourlyRate(employee.name, 0) : 0) }));
                  }} fullWidth>
                    {employees.filter((employee) => employee.direct).map((employee) => <MenuItem key={employee.id} value={employee.name}>{employee.name} · {employee.contractCode}</MenuItem>)}
                  </TextField>
                </Grid>
                <Grid size={{ xs: 12, sm: 6, md: 2 }}>
                  <TextField label="Costo hora RH (CLP)" type="number" value={operation.hourlyCost} slotProps={{ input: { readOnly: true } }} helperText="Sueldo / horas mensuales" fullWidth />
                </Grid>
              </Grid>

              <Divider />
              <Typography variant="subtitle2">Materiales para esta operación</Typography>
              <Grid container spacing={1.5}>
                <Grid size={{ xs: 12, sm: 4, md: 2 }}>
                  <Autocomplete
                    options={materialOptions}
                    value={materialOptions.find((item) => item.code === material.code) ?? null}
                    inputValue={material.code}
                    getOptionLabel={(item) => item.code}
                    isOptionEqualToValue={(option, value) => option.code === value.code}
                    filterOptions={(options, state) => {
                      const query = state.inputValue.trim().toLowerCase();
                      return options.filter((item) => `${item.code} ${item.name}`.toLowerCase().includes(query));
                    }}
                    onInputChange={(_, value) => {
                      const code = value.trim().toUpperCase();
                      const match = materialOptions.find((item) => item.code === code);
                      setMaterial((current) => ({
                        ...current,
                        code,
                        name: match?.name ?? "",
                        unit: match?.unit ?? "unidad",
                        unitCost: String(match?.unitCost ?? 0),
                      }));
                    }}
                    onChange={(_, item) => {
                      if (item) {
                        setMaterial((current) => ({ ...current, code: item.code, name: item.name, unit: item.unit, unitCost: String(item.unitCost) }));
                      }
                    }}
                    renderOption={(props, item) => <li {...props} key={item.code}>{item.code} · {item.name}</li>}
                    renderInput={(params) => <TextField {...params} label="Buscar código o material" required />}
                    fullWidth
                  />
                </Grid>
                <Grid size={{ xs: 12, sm: 8, md: 3 }}>
                  <TextField label="Material" value={material.name} onChange={(event) => setMaterial((current) => ({ ...current, name: event.target.value }))} fullWidth />
                </Grid>
                <Grid size={{ xs: 6, md: 2 }}>
                  <TextField label="Cantidad" type="number" value={material.quantity} onChange={(event) => setMaterial((current) => ({ ...current, quantity: event.target.value }))} slotProps={{ htmlInput: { min: 0.01, step: 0.01 } }} fullWidth />
                </Grid>
                <Grid size={{ xs: 6, md: 2 }}>
                  <TextField label="Unidad" value={material.unit} onChange={(event) => setMaterial((current) => ({ ...current, unit: event.target.value }))} fullWidth />
                </Grid>
                <Grid size={{ xs: 12, md: 3 }}>
                  <Button type="button" onClick={addMaterial} variant="outlined" sx={{ height: 56 }} fullWidth startIcon={<Add />}>Agregar material</Button>
                </Grid>
              </Grid>
              {operationMaterials.map((item, index) => (
                <Stack key={`${item.code}-${index}`} direction="row" sx={{ justifyContent: "space-between", alignItems: "center" }}>
                  <Typography variant="body2">{item.code} · {item.name} — {item.quantity} {item.unit}</Typography>
                  <Button type="button" size="small" color="error" onClick={() => setOperationMaterials((current) => current.filter((_, materialIndex) => materialIndex !== index))} aria-label={`Quitar ${item.name}`}><DeleteOutlined /></Button>
                </Stack>
              ))}
              <Box>
                <Button type="button" onClick={addOperation} variant="outlined" startIcon={<Add />}>Agregar operación a la hoja</Button>
              </Box>
            </Stack>
          </Paper>

          {previewOperations.length > 0 && (
            <Paper variant="outlined" sx={{ p: 2 }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1 }}>Resumen de operaciones</Typography>
              <Table size="small">
                <TableHead><TableRow><TableCell>Sec.</TableCell><TableCell>Operación</TableCell><TableCell>Recurso RH</TableCell><TableCell align="right">Horas</TableCell><TableCell align="right">Costo MO</TableCell><TableCell>Materiales</TableCell><TableCell /></TableRow></TableHead>
                <TableBody>{previewOperations.map((item) => (
                  <TableRow key={item.order}>
                    <TableCell>{item.order}</TableCell>
                    <TableCell>{item.name}</TableCell>
                    <TableCell>{item.technician ?? "Sin asignar"}</TableCell>
                    <TableCell align="right">{item.durationHours.toFixed(1)}</TableCell>
                    <TableCell align="right">{money(item.durationHours * item.hourlyCost)}</TableCell>
                    <TableCell>{item.materials.map((line) => `${line.code}: ${line.quantity} ${line.unit}`).join(" · ") || "Sin materiales"}</TableCell>
                    <TableCell>{item.order <= operations.length * 10 && <Button type="button" size="small" color="error" onClick={() => removeOperation(item.order)}><DeleteOutlined /></Button>}</TableCell>
                  </TableRow>
                ))}</TableBody>
              </Table>
            </Paper>
          )}
          <Box>
            <Button type="submit" variant="contained" startIcon={<Save />}>Guardar hoja de ruta</Button>
          </Box>
        </Stack>
      </Paper> : <Alert severity="info">Consulta de solo lectura: las hojas de ruta las mantiene Ingeniería e Industrial.</Alert>}

      <Paper sx={{ p: 3 }}>
        <Typography variant="h6" sx={{ mb: 2 }}>Hojas disponibles para planes y OT</Typography>
        <Table size="small">
          <TableHead><TableRow><TableCell>Código</TableCell><TableCell>Hoja</TableCell><TableCell align="right">Operaciones</TableCell><TableCell align="right">Horas</TableCell><TableCell>Materiales definidos</TableCell></TableRow></TableHead>
          <TableBody>{routes.map((route) => {
            const materials = route.operations.flatMap((item) => item.materials);
            return (
              <TableRow key={route.id}>
                <TableCell>{route.id}</TableCell>
                <TableCell>{route.name}</TableCell>
                <TableCell align="right">{route.operations.length}</TableCell>
                <TableCell align="right">{route.operations.reduce((sum, item) => sum + item.durationHours, 0).toFixed(1)} h</TableCell>
                <TableCell>{materials.map((item) => `${item.code} (${item.quantity} ${item.unit})`).join(" · ") || "Sin materiales"}</TableCell>
              </TableRow>
            );
          })}</TableBody>
        </Table>
      </Paper>
    </Stack>
  );
}
