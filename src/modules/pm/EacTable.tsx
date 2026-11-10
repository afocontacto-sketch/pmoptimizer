import { Fragment, useEffect, useMemo, useState } from "react";
import {
  Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, MenuItem, Paper, Select,
  Stack, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography,
} from "@mui/material";
import KeyboardArrowDown from "@mui/icons-material/KeyboardArrowDown";
import KeyboardArrowRight from "@mui/icons-material/KeyboardArrowRight";
import { can } from "../../app/permissions";
import type { Role } from "../../app/roles";
import { downloadCsv } from "../../data/csv";
import {
  OUTSIDE_CONTRACT, computeEac, eacCategories, eacScales, formatScaled, periodOf,
} from "../../data/projectCost";
import type { EacRow, EacScale } from "../../data/projectCost";
import { closeMonth, saveBudgetVersion, saveProvisionalSnapshots } from "../../data/projectCostStore";
import { STORE_EVENT } from "../../data/storage";
import { eacHeaders, eacMatrix, eacTableDoc } from "../../components/print/templates/eacTableDoc";
import { printDocument } from "../../components/print/printDocument";
import { loadPmData } from "./pmData";

const months = Array.from({ length: 12 }, (_, index) => index + 1);
const monthName = (month: number) => new Intl.DateTimeFormat("es-CL", { month: "long" }).format(new Date(2026, month - 1, 15));
const scaleName = (scale: EacScale) => (scale === 1 ? "CLP" : `x${scale.toLocaleString("es-CL")}`);

function varColor(value: number | null): string | undefined {
  if (value === null || value === 0) return undefined;
  return value > 0 ? "error.main" : "success.main";
}

export default function EacTable({ role, user }: { role: Role; user: string }) {
  const [data, setData] = useState(loadPmData);
  const [nowMs] = useState(() => Date.now());
  const today = new Date(nowMs);
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [scale, setScale] = useState<EacScale>(1);
  const [selected, setSelected] = useState<string[]>([]);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [budgetOpen, setBudgetOpen] = useState(false);
  const [budgetContract, setBudgetContract] = useState("");
  const [budgetInputs, setBudgetInputs] = useState<Record<string, string>>({});

  useEffect(() => {
    const refresh = () => setData(loadPmData());
    window.addEventListener(STORE_EVENT, refresh);
    return () => window.removeEventListener(STORE_EVENT, refresh);
  }, []);

  const period = periodOf(year, month);
  const currentPeriod = periodOf(today.getFullYear(), today.getMonth() + 1);
  const full = useMemo(() => computeEac({ ...data, year, month, nowMs }), [data, year, month, nowMs]);
  const rows = useMemo(() => computeEac({ ...data, year, month, nowMs, contractCodes: selected }), [data, year, month, nowMs, selected]);

  // Snapshot provisional del mes en curso al abrir el dashboard (solo si no existe).
  useEffect(() => {
    const currentRows = computeEac({ ...data, year: today.getFullYear(), month: today.getMonth() + 1, nowMs });
    saveProvisionalSnapshots(currentRows, currentPeriod);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const canBudget = can(role, "budget.approve");
  const canClose = can(role, "eac.closeMonth");
  const closed = data.snapshots.some((item) => item.period === period && item.closed);
  const fmt = (value: number | null) => formatScaled(value, scale);

  const doClose = () => {
    const result = closeMonth(full, period, { user, role });
    if (result.ok) { setMessage(`Mes ${period} cerrado.`); setError(""); } else { setError(result.error); setMessage(""); }
  };

  const openBudget = () => {
    const code = budgetContract || selected[0] || data.contracts[0]?.code || "";
    setBudgetContract(code);
    loadBudgetInputs(code);
    setBudgetOpen(true);
  };
  const loadBudgetInputs = (code: string) => {
    const next: Record<string, string> = {};
    for (const category of eacCategories) {
      const row = full.find((item) => item.key === `${code}|${category}`);
      next[category] = row?.budget === null || row === undefined ? "" : String(row.budget);
    }
    setBudgetInputs(next);
  };
  const saveBudget = () => {
    const lines = eacCategories.filter((category) => budgetInputs[category]?.trim()).map((category) => ({
      category, amount: Number(budgetInputs[category]),
    }));
    const result = saveBudgetVersion(budgetContract, lines, { user, role });
    if (result.ok) { setBudgetOpen(false); setMessage("Presupuesto aprobado: nueva versión guardada."); setError(""); } else setError(result.error);
  };

  const exportCsv = () => downloadCsv(`eac-${period}.csv`, eacHeaders, eacMatrix(rows, scale, true));
  const exportPdf = () => {
    printDocument({ ...eacTableDoc(rows, { period, scale, contracts: selected }), user }).catch(() => setError("No se pudo preparar la impresión."));
  };

  const labelOf = (row: EacRow) => (row.kind === "result" ? "Resultado" : row.kind === "total" ? "Resultado total" : row.category);

  return (
    <Paper sx={{ p: 3 }} id="eac-table">
      <Stack spacing={2}>
        <Typography variant="h6">EAC por contrato (Real + Por gastar)</Typography>
        <Stack direction={{ xs: "column", md: "row" }} spacing={2} sx={{ alignItems: { md: "center" }, flexWrap: "wrap" }}>
          <Select multiple displayEmpty size="small" value={selected} sx={{ minWidth: 220 }}
            onChange={(event) => setSelected(typeof event.target.value === "string" ? event.target.value.split(",") : event.target.value)}
            renderValue={(value) => (value.length ? value.join(", ") : "Todos los contratos")} inputProps={{ "aria-label": "Contratos" }}>
            {data.contracts.map((contract) => <MenuItem key={contract.code} value={contract.code}>{contract.code} · {contract.customer}</MenuItem>)}
          </Select>
          <TextField size="small" type="number" label="Año" value={year} sx={{ width: 100 }}
            onChange={(event) => setYear(Number(event.target.value) || today.getFullYear())} />
          <TextField size="small" select label="Mes de corte" value={month} sx={{ width: 150 }} onChange={(event) => setMonth(Number(event.target.value))}>
            {months.map((item) => <MenuItem key={item} value={item}>{monthName(item)}</MenuItem>)}
          </TextField>
          <TextField size="small" select label="Escala" value={scale} sx={{ width: 120 }} onChange={(event) => setScale(Number(event.target.value) as EacScale)}>
            {eacScales.map((item) => <MenuItem key={item} value={item}>{scaleName(item)}</MenuItem>)}
          </TextField>
          {closed && <Chip size="small" color="success" label={`Mes ${period} cerrado`} />}
          <Box sx={{ flex: 1 }} />
          {canBudget && <Button variant="outlined" onClick={openBudget}>Presupuesto aprobado</Button>}
          {canClose && <Button variant="contained" onClick={doClose} disabled={closed}>Cerrar mes</Button>}
          <Button variant="outlined" onClick={exportCsv}>CSV</Button>
          <Button variant="outlined" onClick={exportPdf}>PDF</Button>
        </Stack>
        {message && <Alert severity="success" onClose={() => setMessage("")}>{message}</Alert>}
        {error && <Alert severity="error" onClose={() => setError("")}>{error}</Alert>}
        <Table size="small">
          <TableHead><TableRow>
            <TableCell />
            <TableCell>Contrato / categoría</TableCell>
            {["Real a la fecha", "Por gastar (ETC)", "EAC", "EAC mes anterior", "Variación mes", "Presupuesto", "Var. vs presupuesto"].map((label) => (
              <TableCell key={label} align="right">{label}</TableCell>
            ))}
          </TableRow></TableHead>
          <TableBody>
            {rows.map((row) => {
              const strong = row.kind === "result" || row.kind === "total" || row.kind === "outside";
              const expanded = open[row.key] === true;
              return (
                <Fragment key={row.key}>
                  <TableRow sx={strong ? { bgcolor: "action.hover", "& td": { fontWeight: 700 } } : undefined}>
                    <TableCell padding="checkbox">
                      <IconButton size="small" aria-label="Ver desglose" onClick={() => setOpen((current) => ({ ...current, [row.key]: !expanded }))}>
                        {expanded ? <KeyboardArrowDown fontSize="small" /> : <KeyboardArrowRight fontSize="small" />}
                      </IconButton>
                    </TableCell>
                    <TableCell>{row.kind === "category" ? `${row.contract} · ${labelOf(row)}` : row.kind === "outside" ? OUTSIDE_CONTRACT : row.kind === "total" ? "Resultado total" : `${row.contract} · Resultado`}</TableCell>
                    <TableCell align="right">{fmt(row.real)}</TableCell>
                    <TableCell align="right">{fmt(row.etc)}</TableCell>
                    <TableCell align="right">{fmt(row.eac)}</TableCell>
                    <TableCell align="right">{fmt(row.previousEac)}</TableCell>
                    <TableCell align="right">{fmt(row.variation)}</TableCell>
                    <TableCell align="right">{fmt(row.budget)}</TableCell>
                    <TableCell align="right" sx={{ color: varColor(row.varBudget) }}>{fmt(row.varBudget)}</TableCell>
                  </TableRow>
                  {expanded && (["materials", "labor", "services"] as const).map((part) => (
                    <TableRow key={`${row.key}-${part}`}>
                      <TableCell />
                      <TableCell sx={{ pl: 4, color: "text.secondary" }}>{part === "materials" ? "Materiales" : part === "labor" ? "Mano de obra" : "Servicios externos"}</TableCell>
                      <TableCell align="right">{fmt(row.realDetail[part])}</TableCell>
                      <TableCell align="right">{fmt(row.etcDetail[part])}</TableCell>
                      <TableCell align="right">{fmt(row.realDetail[part] + row.etcDetail[part])}</TableCell>
                      <TableCell colSpan={4} />
                    </TableRow>
                  ))}
                </Fragment>
              );
            })}
          </TableBody>
        </Table>
        <Typography variant="caption" color="text.secondary">
          Montos en {scaleName(scale)}{scale === 1 ? "" : " (monto dividido por la escala; solo presentación)"}. Var. vs presupuesto positiva = sobrecosto. "-" = sin dato.
        </Typography>
      </Stack>
      <Dialog open={budgetOpen} onClose={() => setBudgetOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle>Presupuesto aprobado (nueva versión)</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField select size="small" label="Contrato" value={budgetContract}
              onChange={(event) => { setBudgetContract(event.target.value); loadBudgetInputs(event.target.value); }}>
              {data.contracts.map((contract) => <MenuItem key={contract.code} value={contract.code}>{contract.code}</MenuItem>)}
            </TextField>
            {eacCategories.map((category) => (
              <TextField key={category} size="small" type="number" label={category} value={budgetInputs[category] ?? ""}
                onChange={(event) => setBudgetInputs((current) => ({ ...current, [category]: event.target.value }))} />
            ))}
            {error && <Alert severity="error">{error}</Alert>}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setBudgetOpen(false)}>Cancelar</Button>
          <Button variant="contained" onClick={saveBudget}>Guardar versión</Button>
        </DialogActions>
      </Dialog>
    </Paper>
  );
}
