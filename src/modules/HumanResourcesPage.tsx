import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import {
  Alert,
  Button,
  Chip,
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
import { makeFinanceId, readFinanceState, readFinanceList, saveFinanceState } from "./financeData";
import type { FinanceAccount, JournalEntry } from "./financeData";

export const hrEmployeesStorageKey = "pmoptimizer-hr-employees";
export const payrollRunsStorageKey = "pmoptimizer-payroll-runs";

export type Employee = {
  id: string;
  name: string;
  position: string;
  contractType: "Indefinido" | "Plazo fijo" | "Honorarios";
  contractStart?: string;
  contractEnd?: string;
  monthlySalary: number;
  hoursPerMonth: number;
  deductionPercent?: number;
  direct: boolean;
  contractCode: string;
};
type ProjectContract = { code: string; client: string; active: boolean; };
type PayrollLine = {
  employeeId: string;
  employee: string;
  gross: number;
  deductions: number;
  net: number;
  allocations: { contract: string; amount: number }[];
};
type PayrollRun = {
  id: string;
  period: string;
  createdAt: string;
  status: "Pendiente de pago" | "Pagada";
  lines: PayrollLine[];
  gross: number;
  deductions: number;
  net: number;
};

const demoEmployees: Employee[] = [
  { id: "EMP-001", name: "Camila Rojas", position: "Técnica mecánica", contractType: "Indefinido", monthlySalary: 1100000, hoursPerMonth: 180, deductionPercent: 20, direct: true, contractCode: "CT1234" },
  { id: "EMP-002", name: "Diego Muñoz", position: "Supervisor de mantenimiento", contractType: "Indefinido", monthlySalary: 1450000, hoursPerMonth: 180, deductionPercent: 20, direct: true, contractCode: "CT1234" },
  { id: "EMP-003", name: "Paula Soto", position: "Administración", contractType: "Indefinido", monthlySalary: 1250000, hoursPerMonth: 180, deductionPercent: 20, direct: false, contractCode: "" },
];
const demoContracts: ProjectContract[] = [{ code: "CT1234", client: "Fiat Chile", active: true }];
const expenseCode = "510301";
const payableCode = "210301";
const deductionsCode = "210302";

function readList<T>(key: string, fallback: T[]): T[] {
  const saved = readFinanceList<T>(key);
  return saved.length ? saved : fallback;
}

export function readHrEmployees(): Employee[] {
  return readList<Employee>(hrEmployeesStorageKey, demoEmployees);
}

function readProjectContracts(): ProjectContract[] {
  const clientContracts = readFinanceList<{ name: string; contractCode?: string }>("pmoptimizer-clients")
    .flatMap((client) => client.contractCode
      ? [{ code: client.contractCode, client: client.name, active: true }]
      : []);
  const merged = [...demoContracts, ...clientContracts];
  return [...new Map<string, ProjectContract>(
    merged.map((contract): [string, ProjectContract] => [contract.code, contract]),
  ).values()];
}

export function getEmployeeHourlyRate(name: string, fallback: number): number {
  const employee = readHrEmployees().find((item) => item.name === name);
  if (!employee || employee.hoursPerMonth <= 0) return fallback;
  return employee.monthlySalary / employee.hoursPerMonth;
}

function money(value: number): string {
  return new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 }).format(value);
}

function payrollEntry(run: PayrollRun, accounts: FinanceAccount[]): JournalEntry {
  const byCode = new Map(accounts.map((account) => [account.code, account]));
  const expense = byCode.get(expenseCode);
  const payable = byCode.get(payableCode);
  const deductions = byCode.get(deductionsCode);
  if (!expense || !payable || !deductions) throw new Error("Faltan cuentas contables para contabilizar remuneraciones.");
  return {
    id: makeFinanceId("ASI"),
    date: `${run.period}-01`,
    description: `Devengo de remuneraciones ${run.period}`,
    sourceId: run.id,
    lines: [
      { accountCode: expense.code, accountName: expense.name, debit: run.gross, credit: 0 },
      { accountCode: payable.code, accountName: payable.name, debit: 0, credit: run.net },
      { accountCode: deductions.code, accountName: deductions.name, debit: 0, credit: run.deductions },
    ],
  };
}

export default function HumanResourcesPage() {
  const [employees, setEmployees] = useState(() => readList<Employee>(hrEmployeesStorageKey, demoEmployees));
  const [contracts] = useState(readProjectContracts);
  const [runs, setRuns] = useState(() => readList<PayrollRun>(payrollRunsStorageKey, []));
  const [draft, setDraft] = useState({ name: "", position: "", contractType: "Indefinido" as Employee["contractType"], contractStart: new Date().toISOString().slice(0, 10), contractEnd: "", monthlySalary: "", hoursPerMonth: "180", deductionPercent: "20", direct: true, contractCode: contracts[0]?.code ?? "" });
  const [period, setPeriod] = useState(new Date().toISOString().slice(0, 7));
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const indirectContracts = useMemo(() => contracts.filter((item) => item.active), [contracts]);

  const addEmployee = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const salary = Number(draft.monthlySalary);
    const hours = Number(draft.hoursPerMonth);
    const deductionPercent = Number(draft.deductionPercent);
    if (!draft.name.trim() || !draft.position.trim() || salary <= 0 || hours <= 0 ||
      !Number.isFinite(deductionPercent) || deductionPercent < 0 || deductionPercent > 100 ||
      (draft.contractEnd && draft.contractEnd < draft.contractStart) ||
      (draft.direct && !contracts.some((item) => item.code === draft.contractCode))) {
      setError("Completa los datos del colaborador, sueldo, horas, porcentaje de descuento y contrato para personal directo.");
      return;
    }
    const next = [...employees, { ...draft, id: makeFinanceId("EMP"), name: draft.name.trim(), position: draft.position.trim(), monthlySalary: salary, hoursPerMonth: hours, deductionPercent }];
    try {
      localStorage.setItem(hrEmployeesStorageKey, JSON.stringify(next));
      setEmployees(next);
      setDraft((current) => ({ ...current, name: "", position: "", monthlySalary: "" }));
      setError("");
      setMessage("Colaborador creado.");
    } catch (cause) {
      console.error("No se pudo guardar el colaborador.", cause);
      setError("No se pudo guardar el colaborador en este navegador.");
    }
  };

  const generatePayroll = useCallback(() => {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) {
      setError("Selecciona un período válido.");
      return;
    }
    const storedRuns = readList<PayrollRun>(payrollRunsStorageKey, []);
    if (runs.some((run) => run.period === period) || storedRuns.some((run) => run.period === period)) {
      setRuns(storedRuns);
      return;
    }
    if (!employees.length) {
      setError("Agrega colaboradores antes de generar la nómina.");
      return;
    }
    const lines: PayrollLine[] = employees.map((employee) => {
      const gross = employee.monthlySalary;
      const deductions = Math.round(gross * (employee.deductionPercent ?? 20) / 100);
      const activeContracts = indirectContracts;
      const indirectShare = activeContracts.length ? Math.floor(gross / activeContracts.length) : gross;
      let indirectAllocated = 0;
      const allocations = employee.direct
        ? [{ contract: employee.contractCode, amount: gross }]
        : activeContracts.length
          ? activeContracts.map((contract, index) => {
            const amount = index === activeContracts.length - 1 ? gross - indirectAllocated : indirectShare;
            indirectAllocated += amount;
            return { contract: contract.code, amount };
          })
          : [{ contract: "GASTO-EMPRESA", amount: gross }];
      return { employeeId: employee.id, employee: employee.name, gross, deductions, net: gross - deductions, allocations };
    });
    const run: PayrollRun = {
      id: makeFinanceId("NOM"),
      period,
      createdAt: new Date().toISOString(),
      status: "Pendiente de pago",
      lines,
      gross: lines.reduce((sum, line) => sum + line.gross, 0),
      deductions: lines.reduce((sum, line) => sum + line.deductions, 0),
      net: lines.reduce((sum, line) => sum + line.net, 0),
    };
    const finance = readFinanceState();
    const accounts = [...finance.accounts];
    for (const account of [
      { code: expenseCode, name: "Gastos de remuneraciones", type: "Gasto" as const },
      { code: payableCode, name: "Remuneraciones por pagar", type: "Pasivo" as const },
      { code: deductionsCode, name: "Descuentos previsionales por pagar", type: "Pasivo" as const },
    ]) if (!accounts.some((item) => item.code === account.code)) accounts.push(account);
    const nextRuns = [...runs, run];
    try {
      localStorage.setItem(payrollRunsStorageKey, JSON.stringify(nextRuns));
      if (!saveFinanceState({ ...finance, accounts, entries: [...finance.entries, payrollEntry(run, accounts)] })) {
        localStorage.setItem(payrollRunsStorageKey, JSON.stringify(runs));
        setError("No se pudo contabilizar el devengo; la nómina no quedó generada.");
        return;
      }
      setRuns(nextRuns);
      setError("");
      setMessage(`Nómina ${period} generada y contabilizada. Los costos indirectos se distribuyeron entre contratos activos.`);
    } catch (cause) {
      console.error("No se pudo generar la nómina.", cause);
      setError("No se pudo guardar la nómina.");
    }
  }, [employees, indirectContracts, period, runs]);

  useEffect(() => {
    const now = new Date();
    const currentPeriod = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    if (now.getDate() === lastDay && period === currentPeriod && !runs.some((run) => run.period === currentPeriod)) {
      generatePayroll();
    }
  }, [generatePayroll, period, runs]);

  const payRun = (run: PayrollRun) => {
    if (run.status === "Pagada") return;
    const finance = readFinanceState();
    const payable = finance.accounts.find((account) => account.code === payableCode);
    const bank = finance.accounts.find((account) => account.code === "110101");
    if (!payable || !bank) {
      setError("Configura las cuentas de remuneraciones por pagar y banco antes del pago.");
      return;
    }
    const entry: JournalEntry = {
      id: makeFinanceId("ASI"),
      date: new Date().toISOString().slice(0, 10),
      description: `Pago de remuneraciones ${run.period}`,
      sourceId: run.id,
      lines: [
        { accountCode: payable.code, accountName: payable.name, debit: run.net, credit: 0 },
        { accountCode: bank.code, accountName: bank.name, debit: 0, credit: run.net },
      ],
    };
    const nextRuns = runs.map((item) => item.id === run.id ? { ...item, status: "Pagada" as const } : item);
    try {
      localStorage.setItem(payrollRunsStorageKey, JSON.stringify(nextRuns));
      if (!saveFinanceState({ ...finance, entries: [...finance.entries, entry] })) {
        localStorage.setItem(payrollRunsStorageKey, JSON.stringify(runs));
        setError("No se pudo guardar el asiento de pago.");
        return;
      }
      setRuns(nextRuns);
      setError("");
      setMessage(`Pago de nómina ${run.period} registrado con asiento contable.`);
    } catch (cause) {
      console.error("No se pudo registrar el pago de nómina.", cause);
      setError("No se pudo guardar el pago de nómina.");
    }
  };

  return (
    <Stack spacing={3}>
      <div>
        <Typography variant="h4">Recursos humanos y nómina</Typography>
        <Typography color="text.secondary">Contratos laborales, costos horarios y distribución de remuneraciones por contrato.</Typography>
      </div>
      <Alert severity="warning">Prototipo local: al último día del mes calcula la nómina si la aplicación está abierta; si no, usa el cálculo manual al ingresar. Las tasas de descuento son configurables y demostrativas, no cálculo legal chileno. AFP, salud, AFC, impuesto, Previred, liquidaciones y finiquitos requieren reglas vigentes y validación con contador/especialista laboral.</Alert>
      {error && <Alert severity="error">{error}</Alert>}
      {message && <Alert severity="success">{message}</Alert>}
      <Paper component="form" onSubmit={addEmployee} sx={{ p: 3 }}>
        <Typography variant="h6" sx={{ mb: 2 }}>Agregar colaborador y contrato laboral</Typography>
        <Grid container spacing={2}>
          <Grid size={{ xs: 12, md: 3 }}><TextField label="Nombre" value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} required fullWidth /></Grid>
          <Grid size={{ xs: 12, md: 3 }}><TextField label="Cargo / especialidad" value={draft.position} onChange={(event) => setDraft((current) => ({ ...current, position: event.target.value }))} required fullWidth /></Grid>
          <Grid size={{ xs: 12, md: 2 }}><TextField select label="Tipo de contrato" value={draft.contractType} onChange={(event) => setDraft((current) => ({ ...current, contractType: event.target.value as Employee["contractType"] }))} fullWidth><MenuItem value="Indefinido">Indefinido</MenuItem><MenuItem value="Plazo fijo">Plazo fijo</MenuItem><MenuItem value="Honorarios">Honorarios</MenuItem></TextField></Grid>
          <Grid size={{ xs: 12, md: 2 }}><TextField label="Inicio contrato" type="date" value={draft.contractStart} onChange={(event) => setDraft((current) => ({ ...current, contractStart: event.target.value }))} slotProps={{ inputLabel: { shrink: true } }} required fullWidth /></Grid>
          <Grid size={{ xs: 12, md: 2 }}><TextField label="Término (si aplica)" type="date" value={draft.contractEnd} onChange={(event) => setDraft((current) => ({ ...current, contractEnd: event.target.value }))} slotProps={{ inputLabel: { shrink: true } }} fullWidth /></Grid>
          <Grid size={{ xs: 12, md: 2 }}><TextField label="Sueldo mensual CLP" type="number" value={draft.monthlySalary} onChange={(event) => setDraft((current) => ({ ...current, monthlySalary: event.target.value }))} required fullWidth /></Grid>
          <Grid size={{ xs: 12, md: 2 }}><TextField label="Horas/mes" type="number" value={draft.hoursPerMonth} onChange={(event) => setDraft((current) => ({ ...current, hoursPerMonth: event.target.value }))} required fullWidth /></Grid>
          <Grid size={{ xs: 12, md: 2 }}><TextField label="Descuentos demo %" type="number" value={draft.deductionPercent} onChange={(event) => setDraft((current) => ({ ...current, deductionPercent: event.target.value }))} slotProps={{ htmlInput: { min: 0, max: 100, step: 0.01 } }} helperText="Configurable por colaborador" required fullWidth /></Grid>
          <Grid size={{ xs: 12, md: 3 }}><TextField select label="Asignación" value={draft.direct ? "directo" : "indirecto"} onChange={(event) => setDraft((current) => ({ ...current, direct: event.target.value === "directo" }))} fullWidth><MenuItem value="directo">Personal directo</MenuItem><MenuItem value="indirecto">Indirecto / soporte</MenuItem></TextField></Grid>
          {draft.direct && <Grid size={{ xs: 12, md: 3 }}><TextField select label="Contrato de servicio" value={draft.contractCode} onChange={(event) => setDraft((current) => ({ ...current, contractCode: event.target.value }))} fullWidth>{contracts.map((contract) => <MenuItem key={contract.code} value={contract.code}>{contract.code} · {contract.client}</MenuItem>)}</TextField></Grid>}
          <Grid size={{ xs: 12, md: 3 }}><Button type="submit" variant="contained">Guardar colaborador</Button></Grid>
        </Grid>
      </Paper>
      <Paper sx={{ p: 3 }}>
        <Typography variant="h6" sx={{ mb: 2 }}>Personal y costo hora</Typography>
        <Table size="small"><TableHead><TableRow><TableCell>Colaborador</TableCell><TableCell>Cargo</TableCell><TableCell>Contrato laboral</TableCell><TableCell>Vigencia</TableCell><TableCell>Asignación</TableCell><TableCell>Contrato de servicio</TableCell><TableCell align="right">Sueldo</TableCell><TableCell align="right">Costo/hora</TableCell></TableRow></TableHead>
          <TableBody>{employees.map((employee) => <TableRow key={employee.id}><TableCell>{employee.name}</TableCell><TableCell>{employee.position}</TableCell><TableCell>{employee.contractType}</TableCell><TableCell>{employee.contractStart ?? "—"}{employee.contractEnd ? ` a ${employee.contractEnd}` : " · vigente"}</TableCell><TableCell><Chip size="small" label={employee.direct ? "Directo" : "Indirecto"} /></TableCell><TableCell>{employee.direct ? employee.contractCode : "Prorrateado"}</TableCell><TableCell align="right">{money(employee.monthlySalary)}</TableCell><TableCell align="right">{money(employee.monthlySalary / employee.hoursPerMonth)}</TableCell></TableRow>)}</TableBody>
        </Table>
      </Paper>
      <Paper sx={{ p: 3 }}>
        <Stack direction={{ xs: "column", sm: "row" }} spacing={2} sx={{ alignItems: { sm: "center" }, mb: 2 }}>
          <Typography variant="h6" sx={{ flexGrow: 1 }}>Nómina mensual y cuentas por pagar</Typography>
          <TextField type="month" label="Período" value={period} onChange={(event) => setPeriod(event.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
          <Button variant="contained" onClick={generatePayroll}>Calcular y contabilizar</Button>
        </Stack>
        {runs.length === 0 ? <Typography color="text.secondary">No hay nóminas generadas.</Typography> : runs.map((run) => (
          <Paper key={run.id} variant="outlined" sx={{ p: 2, mb: 2 }}>
            <Stack direction={{ xs: "column", sm: "row" }} sx={{ justifyContent: "space-between", alignItems: { sm: "center" }, gap: 1 }}>
              <Typography sx={{ fontWeight: 700 }}>{run.period} · Bruto {money(run.gross)} · Descuentos {money(run.deductions)} · Líquido {money(run.net)}</Typography>
              <Stack direction="row" spacing={1}><Chip label={run.status} color={run.status === "Pagada" ? "success" : "warning"} /><Button disabled={run.status === "Pagada"} onClick={() => payRun(run)}>Registrar pago</Button></Stack>
            </Stack>
            <Table size="small"><TableHead><TableRow><TableCell>Colaborador</TableCell><TableCell>Imputación (WBS/contrato)</TableCell><TableCell align="right">Costo bruto</TableCell><TableCell align="right">Líquido</TableCell></TableRow></TableHead><TableBody>{run.lines.map((line) => <TableRow key={line.employeeId}><TableCell>{line.employee}</TableCell><TableCell>{line.allocations.map((item) => `${item.contract}: ${money(item.amount)}`).join(" · ")}</TableCell><TableCell align="right">{money(line.gross)}</TableCell><TableCell align="right">{money(line.net)}</TableCell></TableRow>)}</TableBody></Table>
          </Paper>
        ))}
      </Paper>
    </Stack>
  );
}
