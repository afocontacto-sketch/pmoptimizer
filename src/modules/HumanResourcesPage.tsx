import { keys } from "../data/keys";
import { readContracts } from "../data/contracts";
import { demoAccounts } from "../app/roles";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import {
  Alert,
  Box,
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
  IconButton,
} from "@mui/material";
import { Delete as DeleteIcon, Edit as EditIcon } from "@mui/icons-material";
import { makeFinanceId, readFinanceState, readFinanceList, saveFinanceState } from "./financeData";
import type { FinanceAccount, JournalEntry } from "./financeData";
import { payslipDoc } from "../components/print/templates/payslipDoc";
import { printDocument } from "../components/print/printDocument";
import { can } from "../app/permissions";
import type { Role } from "../app/roles";
import { recalculatePayrollRun } from "./payrollRecalc";

export const hrEmployeesStorageKey = keys.hrEmployees;
export const payrollRunsStorageKey = keys.payrollRuns;
export const hrLeavesStorageKey = keys.hrLeaves;
export const hrContractsStorageKey = keys.hrContracts;

export type Employee = {
  id: string;
  name: string;
  position: string;
  contractType: "Indefinido" | "Plazo fijo" | "Honorarios";
  contractStart?: string;
  contractEnd?: string;
  employmentContractNumber?: string;
  workSchedule?: string;
  workplace?: string;
  monthlySalary: number;
  hoursPerMonth: number;
  deductionPercent?: number;
  direct: boolean;
  contractCode: string;
  contractCodes?: string[];
  supervisorId?: string;
  supervisorLogin?: string;
  login?: string;
};
export type ProjectContract = { code: string; client: string; active: boolean; };
export type HrContract = {
  id: string;
  code: string;
  client: string;
  type: "fijo" | "variable" | "mixto";
  costPerHour: number;
  startDate: string;
  endDate: string;
  description: string;
  createdAt: string;
};
export type PayrollLine = {
  employeeId: string;
  employee: string;
  gross: number;
  deductions: number;
  net: number;
  allocations: { contract: string; amount: number }[];
};
export type PayrollRun = {
  id: string;
  period: string;
  createdAt: string;
  status: "Pendiente de pago" | "Pagada";
  lines: PayrollLine[];
  gross: number;
  deductions: number;
  net: number;
};
type LeaveType = "Vacaciones" | "Licencia médica" | "Permiso con goce" | "Permiso sin goce";
type EmployeeLeave = {
  id: string;
  employeeId: string;
  employeeName: string;
  type: LeaveType;
  startDate: string;
  endDate: string;
  details: string;
  createdAt: string;
};

const demoEmployees: Employee[] = [
  { id: "EMP-001", name: "Camila Rojas", position: "Técnica mecánica", contractType: "Indefinido", monthlySalary: 1100000, hoursPerMonth: 180, deductionPercent: 20, direct: true, contractCode: "CT1234", contractCodes: ["CT1234"], supervisorId: "EMP-002", login: "tecnico" },
  { id: "EMP-002", name: "Diego Muñoz", position: "Supervisor de mantenimiento", contractType: "Indefinido", monthlySalary: 1450000, hoursPerMonth: 180, deductionPercent: 20, direct: false, contractCode: "", contractCodes: ["CT1234"], supervisorLogin: "supervisor" },
  { id: "EMP-004", name: "Tomás Vera", position: "Técnico eléctrico", contractType: "Indefinido", monthlySalary: 1050000, hoursPerMonth: 180, deductionPercent: 20, direct: true, contractCode: "CT1234", contractCodes: ["CT1234"], supervisorId: "EMP-002", login: "tecnico2" },
  { id: "EMP-003", name: "Paula Soto", position: "Administración", contractType: "Indefinido", monthlySalary: 1250000, hoursPerMonth: 180, deductionPercent: 20, direct: false, contractCode: "", contractCodes: ["CT1234"] },
];
const demoContracts: ProjectContract[] = [{ code: "CT1234", client: "Fiat Chile", active: true }];
const demoHrContracts: HrContract[] = [
  {
    id: "HR-001",
    code: "CT1234",
    client: "Fiat Chile",
    type: "mixto",
    costPerHour: 6100,
    startDate: "2024-01-01",
    endDate: "2025-12-31",
    description: "Servicios de mantenimiento integral",
    createdAt: new Date().toISOString(),
  },
];
const expenseCode = "510301";
const payableCode = "210301";
const deductionsCode = "210302";

function readList<T>(key: string, fallback: T[]): T[] {
  const saved = readFinanceList<T>(key);
  return saved.length ? saved : fallback;
}

export function readHrContracts(): HrContract[] {
  return readList<HrContract>(hrContractsStorageKey, demoHrContracts);
}

export function getContractCostPerHour(contractCode: string, fallback: number): number {
  const contract = readHrContracts().find((item) => item.code === contractCode);
  return contract ? contract.costPerHour : fallback;
}

export function readHrEmployees(): Employee[] {
  return readList<Employee>(hrEmployeesStorageKey, demoEmployees).map((employee) => ({
    ...employee,
    direct: employee.position.toLowerCase().includes("supervisor") ? false : employee.direct,
    contractCodes: employee.contractCodes?.length
      ? employee.contractCodes
      : employee.contractCode ? [employee.contractCode] : [],
    supervisorLogin: employee.supervisorLogin ??
      (employee.name === "Diego Muñoz" && employee.position.toLowerCase().includes("supervisor") ? "supervisor" : undefined),
    supervisorId: employee.supervisorId ??
      (employee.name === "Camila Rojas" ? "EMP-002" : undefined),
  }));
}

export function readProjectContracts(): ProjectContract[] {
  const clientContracts = readContracts().map((contract) => ({ code: contract.code, client: contract.customer, active: true }));
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

function allocationContracts(employee: Employee, available: ProjectContract[]): ProjectContract[] {
  const selectedCodes = employee.contractCodes?.length
    ? employee.contractCodes
    : employee.contractCode ? [employee.contractCode] : [];
  const contractsForEmployee = selectedCodes.length
    ? available.filter((contract) => selectedCodes.includes(contract.code))
    : available;
  return contractsForEmployee.length ? contractsForEmployee : available;
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

function buildPayrollLines(employees: Employee[], indirectContracts: ProjectContract[]): PayrollLine[] {
  return employees.map((employee) => {
    const gross = employee.monthlySalary;
    const deductions = Math.round(gross * (employee.deductionPercent ?? 20) / 100);
    const activeContracts = employee.direct
      ? allocationContracts(employee, indirectContracts).slice(0, 1)
      : allocationContracts(employee, indirectContracts);
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
}

export default function HumanResourcesPage({ user = "", role = "Administrador" }: { user?: string; role?: Role }) {
  const [employees, setEmployees] = useState(readHrEmployees);
  const [contracts] = useState(readProjectContracts);
  const [hrContracts, setHrContracts] = useState(readHrContracts);
  const [runs, setRuns] = useState(() => readList<PayrollRun>(payrollRunsStorageKey, []));
  const [leaves, setLeaves] = useState(() => readList<EmployeeLeave>(hrLeavesStorageKey, []));
  const [editingEmployeeId, setEditingEmployeeId] = useState("");
  const [draft, setDraft] = useState({ name: "", position: "", contractType: "Indefinido" as Employee["contractType"], contractStart: new Date().toISOString().slice(0, 10), contractEnd: "", employmentContractNumber: "", workSchedule: "", workplace: "", monthlySalary: "", hoursPerMonth: "180", deductionPercent: "20", direct: true, contractCodes: contracts[0]?.code ? [contracts[0].code] : [], supervisorId: "", supervisorLogin: "", login: "" });
  const [leaveDraft, setLeaveDraft] = useState({ employeeId: "", type: "Vacaciones" as LeaveType, startDate: new Date().toISOString().slice(0, 10), endDate: new Date().toISOString().slice(0, 10), details: "" });
  const [editingContractId, setEditingContractId] = useState("");
  const [contractDraft, setContractDraft] = useState({ code: "", client: "", type: "mixto" as HrContract["type"], costPerHour: "", startDate: new Date().toISOString().slice(0, 10), endDate: "", description: "" });
  const [period, setPeriod] = useState(new Date().toISOString().slice(0, 7));
  const [slipEmployeeId, setSlipEmployeeId] = useState("");
  const [slipPeriod, setSlipPeriod] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const indirectContracts = useMemo(() => contracts.filter((item) => item.active), [contracts]);

  const saveHrContract = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const costPerHour = Number(contractDraft.costPerHour);
    if (!contractDraft.code.trim() || !contractDraft.client.trim() || !Number.isFinite(costPerHour) || costPerHour <= 0 ||
      !contractDraft.startDate || (contractDraft.endDate && contractDraft.endDate < contractDraft.startDate)) {
      setError("Completa todos los campos del contrato correctamente.");
      return;
    }
    const contract: HrContract = {
      id: editingContractId || makeFinanceId("CT"),
      code: contractDraft.code.trim(),
      client: contractDraft.client.trim(),
      type: contractDraft.type,
      costPerHour,
      startDate: contractDraft.startDate,
      endDate: contractDraft.endDate,
      description: contractDraft.description.trim(),
      createdAt: editingContractId ? hrContracts.find((c) => c.id === editingContractId)?.createdAt ?? new Date().toISOString() : new Date().toISOString(),
    };
    const next = editingContractId
      ? hrContracts.map((item) => item.id === editingContractId ? contract : item)
      : [...hrContracts, contract];
    try {
      localStorage.setItem(hrContractsStorageKey, JSON.stringify(next));
      setHrContracts(next);
      setEditingContractId("");
      setContractDraft({ code: "", client: "", type: "mixto", costPerHour: "", startDate: new Date().toISOString().slice(0, 10), endDate: "", description: "" });
      setError("");
      setMessage(editingContractId ? "Contrato actualizado." : "Contrato creado.");
    } catch (cause) {
      console.error("No se pudo guardar el contrato.", cause);
      setError("No se pudo guardar el contrato.");
    }
  };

  const deleteHrContract = (id: string) => {
    const next = hrContracts.filter((item) => item.id !== id);
    try {
      localStorage.setItem(hrContractsStorageKey, JSON.stringify(next));
      setHrContracts(next);
      setError("");
      setMessage("Contrato eliminado.");
    } catch (cause) {
      console.error("No se pudo eliminar el contrato.", cause);
      setError("No se pudo eliminar el contrato.");
    }
  };

  const editHrContract = (contract: HrContract) => {
    setEditingContractId(contract.id);
    setContractDraft({
      code: contract.code,
      client: contract.client,
      type: contract.type,
      costPerHour: String(contract.costPerHour),
      startDate: contract.startDate,
      endDate: contract.endDate,
      description: contract.description,
    });
    setError("");
    setMessage("");
  };

  const saveEmployee = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const salary = Number(draft.monthlySalary);
    const hours = Number(draft.hoursPerMonth);
    const deductionPercent = Number(draft.deductionPercent);
    const isSupervisor = draft.position.toLowerCase().includes("supervisor");
    const direct = isSupervisor ? false : draft.direct;
    const selectedContracts = contracts.filter((item) => item.active && draft.contractCodes.includes(item.code));
    if (!draft.name.trim() || !draft.position.trim() || !Number.isFinite(salary) || salary <= 0 ||
      !Number.isFinite(hours) || hours <= 0 ||
      !Number.isFinite(deductionPercent) || deductionPercent < 0 || deductionPercent > 100 ||
      (draft.contractEnd && draft.contractEnd < draft.contractStart) ||
      (direct && selectedContracts.length !== 1) || (!direct && selectedContracts.length === 0) ||
      (isSupervisor && (!draft.supervisorLogin || employees.some((item) => item.supervisorLogin === draft.supervisorLogin && item.id !== editingEmployeeId))) ||
      (draft.supervisorId && !employees.some((item) => item.id === draft.supervisorId && item.position.toLowerCase().includes("supervisor")))) {
      setError("Completa los datos del colaborador y selecciona un contrato para imputación (uno para personal directo o uno o más para personal indirecto).");
      return;
    }
    if (draft.login && employees.some((item) => item.login === draft.login && item.id !== editingEmployeeId)) {
      setError("Ese usuario del sistema ya está vinculado a otro colaborador.");
      return;
    }
    const contractCodes = selectedContracts.map((contract) => contract.code);
    const employee: Employee = {
      ...draft,
      id: editingEmployeeId || makeFinanceId("EMP"),
      name: draft.name.trim(),
      position: draft.position.trim(),
      monthlySalary: salary,
      hoursPerMonth: hours,
      deductionPercent,
      direct,
      contractCodes,
      contractCode: direct ? contractCodes[0] : "",
      supervisorId: draft.supervisorId || undefined,
      supervisorLogin: isSupervisor ? draft.supervisorLogin : undefined,
      login: draft.login || undefined,
    };
    const next = editingEmployeeId
      ? employees.map((item) => item.id === editingEmployeeId ? employee : item)
      : [...employees, employee];
    try {
      localStorage.setItem(hrEmployeesStorageKey, JSON.stringify(next));
      setEmployees(next);
      setEditingEmployeeId("");
      setDraft({ name: "", position: "", contractType: "Indefinido", contractStart: new Date().toISOString().slice(0, 10), contractEnd: "", employmentContractNumber: "", workSchedule: "", workplace: "", monthlySalary: "", hoursPerMonth: "180", deductionPercent: "20", direct: true, contractCodes: contracts[0]?.code ? [contracts[0].code] : [], supervisorId: "", supervisorLogin: "", login: "" });
      setError("");
      setMessage(editingEmployeeId ? "Antecedentes del colaborador actualizados." : "Colaborador creado.");
    } catch (cause) {
      console.error("No se pudo guardar el colaborador.", cause);
      setError("No se pudo guardar el colaborador en este navegador.");
    }
  };

  const editEmployee = (employee: Employee) => {
    setEditingEmployeeId(employee.id);
    setDraft({
      name: employee.name,
      position: employee.position,
      contractType: employee.contractType,
      contractStart: employee.contractStart ?? "",
      contractEnd: employee.contractEnd ?? "",
      employmentContractNumber: employee.employmentContractNumber ?? "",
      workSchedule: employee.workSchedule ?? "",
      workplace: employee.workplace ?? "",
      monthlySalary: String(employee.monthlySalary),
      hoursPerMonth: String(employee.hoursPerMonth),
      deductionPercent: String(employee.deductionPercent ?? 20),
      direct: employee.direct,
      contractCodes: employee.contractCodes?.length ? employee.contractCodes : employee.contractCode ? [employee.contractCode] : [],
      supervisorId: employee.supervisorId ?? "",
      supervisorLogin: employee.supervisorLogin ?? "",
      login: employee.login ?? "",
    });
    setError("");
    setMessage("");
  };

  const addLeave = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const employee = employees.find((item) => item.id === leaveDraft.employeeId);
    if (!employee || !leaveDraft.startDate || !leaveDraft.endDate || leaveDraft.endDate < leaveDraft.startDate) {
      setError("Selecciona un trabajador y un rango de fechas válido.");
      return;
    }
    const next = [{
      id: makeFinanceId("AUS"),
      employeeId: employee.id,
      employeeName: employee.name,
      type: leaveDraft.type,
      startDate: leaveDraft.startDate,
      endDate: leaveDraft.endDate,
      details: leaveDraft.details.trim(),
      createdAt: new Date().toISOString(),
    }, ...leaves];
    try {
      localStorage.setItem(hrLeavesStorageKey, JSON.stringify(next));
      setLeaves(next);
      setLeaveDraft((current) => ({ ...current, details: "" }));
      setError("");
      setMessage(`${leaveDraft.type} registrada para ${employee.name}.`);
    } catch (cause) {
      console.error("No se pudo guardar la ausencia del trabajador.", cause);
      setError("No se pudo guardar el registro de ausencia en este navegador.");
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
    const lines = buildPayrollLines(employees, indirectContracts);
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
      setMessage(`Nómina ${period} generada y contabilizada. Los costos indirectos se prorratearon entre los contratos asociados a cada colaborador.`);
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

  const recalculateRun = (run: PayrollRun) => {
    const result = recalculatePayrollRun(run.id, buildPayrollLines(readHrEmployees(), indirectContracts), { user, role }, payrollEntry);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setRuns(readList<PayrollRun>(payrollRunsStorageKey, []));
    setError("");
    setMessage(`Liquidación ${run.period} recalculada: asiento de reverso y asiento nuevo registrados.`);
  };

  const printPayslip = () => {
    if (!activeSlipRun || !selectedSlipLine) return;
    printDocument(payslipDoc({
      period: activeSlipRun.period, status: activeSlipRun.status, employer: "PMOptimizer · Empresa demo",
      employeeName: selectedSlipLine.employee, employeeId: selectedSlipLine.employeeId,
      position: selectedSlipEmployee?.position, contractNumber: selectedSlipEmployee?.employmentContractNumber,
      contractType: selectedSlipEmployee?.contractType,
      schedule: selectedSlipEmployee?.workSchedule || (selectedSlipEmployee ? `${selectedSlipEmployee.hoursPerMonth} horas/mes` : undefined),
      contractStart: selectedSlipEmployee?.contractStart, workplace: selectedSlipEmployee?.workplace,
      gross: selectedSlipLine.gross, deductions: selectedSlipLine.deductions, net: selectedSlipLine.net,
    })).catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "No se pudo imprimir la liquidación."));
  };

  const selectedSlipEmployeeId = slipEmployeeId || employees[0]?.id || "";
  const selectedSlipPeriod = slipPeriod || runs[0]?.period || "";
  const activeSlipRun = runs.find((run) => run.period === selectedSlipPeriod);
  const selectedSlipLine = activeSlipRun?.lines.find((line) => line.employeeId === selectedSlipEmployeeId);
  const selectedSlipEmployee = employees.find((employee) => employee.id === selectedSlipEmployeeId);

  return (
    <Stack spacing={3}>
      <div>
        <Typography variant="h4">Recursos humanos y nómina</Typography>
        <Typography color="text.secondary">Gestión de contratos, empleados con asignación directa/indirecta, y cálculo automático de nóminas con prorrateo.</Typography>
      </div>
      <Alert severity="warning">Prototipo local: al último día del mes calcula la nómina si la aplicación está abierta; si no, usa el cálculo manual al ingresar. Las tasas de descuento son configurables y demostrativas, no cálculo legal chileno. AFP, salud, AFC, impuesto, Previred, liquidaciones y finiquitos requieren reglas vigentes y validación con contador/especialista laboral.</Alert>
      {error && <Alert severity="error">{error}</Alert>}
      {message && <Alert severity="success">{message}</Alert>}
      
      <Paper component="form" onSubmit={saveHrContract} sx={{ p: 3 }}>
        <Typography variant="h6" sx={{ mb: 2 }}>{editingContractId ? "Editar contrato" : "Agregar contrato de servicios"}</Typography>
        <Grid container spacing={2}>
          <Grid size={{ xs: 12, md: 2 }}><TextField label="Código" value={contractDraft.code} onChange={(event) => setContractDraft((current) => ({ ...current, code: event.target.value }))} required fullWidth /></Grid>
          <Grid size={{ xs: 12, md: 3 }}><TextField label="Cliente/Proyecto" value={contractDraft.client} onChange={(event) => setContractDraft((current) => ({ ...current, client: event.target.value }))} required fullWidth /></Grid>
          <Grid size={{ xs: 12, md: 2 }}><TextField select label="Tipo" value={contractDraft.type} onChange={(event) => setContractDraft((current) => ({ ...current, type: event.target.value as HrContract["type"] }))} fullWidth><MenuItem value="fijo">Fijo</MenuItem><MenuItem value="variable">Variable</MenuItem><MenuItem value="mixto">Mixto</MenuItem></TextField></Grid>
          <Grid size={{ xs: 12, md: 2 }}><TextField label="Costo/hora CLP" type="number" value={contractDraft.costPerHour} onChange={(event) => setContractDraft((current) => ({ ...current, costPerHour: event.target.value }))} required fullWidth /></Grid>
          <Grid size={{ xs: 12, md: 2 }}><TextField label="Inicio" type="date" value={contractDraft.startDate} onChange={(event) => setContractDraft((current) => ({ ...current, startDate: event.target.value }))} slotProps={{ inputLabel: { shrink: true } }} required fullWidth /></Grid>
          <Grid size={{ xs: 12, md: 2 }}><TextField label="Término" type="date" value={contractDraft.endDate} onChange={(event) => setContractDraft((current) => ({ ...current, endDate: event.target.value }))} slotProps={{ inputLabel: { shrink: true } }} fullWidth /></Grid>
          <Grid size={{ xs: 12 }}><TextField label="Descripción" value={contractDraft.description} onChange={(event) => setContractDraft((current) => ({ ...current, description: event.target.value }))} multiline rows={2} fullWidth /></Grid>
          <Grid size={{ xs: 12, md: 2 }}><Stack direction="row" spacing={1}><Button type="submit" variant="contained">{editingContractId ? "Guardar cambios" : "Guardar contrato"}</Button>{editingContractId && <Button onClick={() => { setEditingContractId(""); setContractDraft({ code: "", client: "", type: "mixto", costPerHour: "", startDate: new Date().toISOString().slice(0, 10), endDate: "", description: "" }); }}>Cancelar</Button>}</Stack></Grid>
        </Grid>
      </Paper>
      
      <Paper sx={{ p: 3 }}>
        <Typography variant="h6" sx={{ mb: 2 }}>Contratos de servicios</Typography>
        {hrContracts.length === 0 ? <Typography color="text.secondary">No hay contratos registrados.</Typography> : (
          <Table size="small">
            <TableHead><TableRow><TableCell>Código</TableCell><TableCell>Cliente</TableCell><TableCell>Tipo</TableCell><TableCell align="right">Costo/hora</TableCell><TableCell>Vigencia</TableCell><TableCell>Descripción</TableCell><TableCell>Acciones</TableCell></TableRow></TableHead>
            <TableBody>{hrContracts.map((contract) => <TableRow key={contract.id}><TableCell>{contract.code}</TableCell><TableCell>{contract.client}</TableCell><TableCell><Chip label={contract.type} size="small" /></TableCell><TableCell align="right">${contract.costPerHour.toLocaleString("es-CL")}</TableCell><TableCell>{contract.startDate} {contract.endDate ? `/ ${contract.endDate}` : ""}</TableCell><TableCell>{contract.description || "—"}</TableCell><TableCell><Stack direction="row" spacing={0.5}><IconButton size="small" onClick={() => editHrContract(contract)}><EditIcon fontSize="small" /></IconButton><IconButton size="small" color="error" onClick={() => deleteHrContract(contract.id)}><DeleteIcon fontSize="small" /></IconButton></Stack></TableCell></TableRow>)}</TableBody>
          </Table>
        )}
      </Paper>
      
      <Paper component="form" onSubmit={saveEmployee} sx={{ p: 3 }}>
        <Typography variant="h6" sx={{ mb: 2 }}>{editingEmployeeId ? "Editar trabajador" : "Agregar trabajador"}</Typography>
        <Grid container spacing={2}>
          <Grid size={{ xs: 12, md: 3 }}><TextField label="Nombre" value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} required fullWidth /></Grid>
          <Grid size={{ xs: 12, md: 3 }}><TextField label="Cargo / especialidad" value={draft.position} onChange={(event) => setDraft((current) => {
            const position = event.target.value;
            return { ...current, position, direct: position.toLowerCase().includes("supervisor") ? false : current.direct };
          })} required fullWidth /></Grid>
          <Grid size={{ xs: 12, md: 2 }}><TextField select label="Tipo de contrato" value={draft.contractType} onChange={(event) => setDraft((current) => ({ ...current, contractType: event.target.value as Employee["contractType"] }))} fullWidth><MenuItem value="Indefinido">Indefinido</MenuItem><MenuItem value="Plazo fijo">Plazo fijo</MenuItem><MenuItem value="Honorarios">Honorarios</MenuItem></TextField></Grid>
          <Grid size={{ xs: 12, md: 2 }}><TextField label="N.º contrato laboral" value={draft.employmentContractNumber} onChange={(event) => setDraft((current) => ({ ...current, employmentContractNumber: event.target.value }))} fullWidth /></Grid>
          <Grid size={{ xs: 12, md: 2 }}><TextField label="Inicio contrato" type="date" value={draft.contractStart} onChange={(event) => setDraft((current) => ({ ...current, contractStart: event.target.value }))} slotProps={{ inputLabel: { shrink: true } }} required fullWidth /></Grid>
          <Grid size={{ xs: 12, md: 2 }}><TextField label="Término (si aplica)" type="date" value={draft.contractEnd} onChange={(event) => setDraft((current) => ({ ...current, contractEnd: event.target.value }))} slotProps={{ inputLabel: { shrink: true } }} fullWidth /></Grid>
          <Grid size={{ xs: 12, md: 3 }}><TextField label="Jornada / horario" value={draft.workSchedule} onChange={(event) => setDraft((current) => ({ ...current, workSchedule: event.target.value }))} fullWidth /></Grid>
          <Grid size={{ xs: 12, md: 3 }}><TextField label="Lugar de trabajo" value={draft.workplace} onChange={(event) => setDraft((current) => ({ ...current, workplace: event.target.value }))} fullWidth /></Grid>
          <Grid size={{ xs: 12, md: 2 }}><TextField label="Sueldo mensual CLP" type="number" value={draft.monthlySalary} onChange={(event) => setDraft((current) => ({ ...current, monthlySalary: event.target.value }))} required fullWidth /></Grid>
          <Grid size={{ xs: 12, md: 2 }}><TextField label="Horas/mes" type="number" value={draft.hoursPerMonth} onChange={(event) => setDraft((current) => ({ ...current, hoursPerMonth: event.target.value }))} required fullWidth /></Grid>
          <Grid size={{ xs: 12, md: 2 }}><TextField label="Descuentos demo %" type="number" value={draft.deductionPercent} onChange={(event) => setDraft((current) => ({ ...current, deductionPercent: event.target.value }))} slotProps={{ htmlInput: { min: 0, max: 100, step: 0.01 } }} helperText="Configurable por colaborador" required fullWidth /></Grid>
          <Grid size={{ xs: 12, md: 3 }}><TextField select label="Asignación" value={draft.direct ? "directo" : "indirecto"} disabled={draft.position.toLowerCase().includes("supervisor")} helperText={draft.position.toLowerCase().includes("supervisor") ? "El costo de supervisión siempre es indirecto." : undefined} onChange={(event) => setDraft((current) => ({ ...current, direct: event.target.value === "directo", contractCodes: event.target.value === "directo" ? current.contractCodes.slice(0, 1) : current.contractCodes }))} fullWidth><MenuItem value="directo">Personal directo</MenuItem><MenuItem value="indirecto">Indirecto / prorrateable</MenuItem></TextField></Grid>
          <Grid size={{ xs: 12, md: 3 }}>
            <TextField
              select
              label={draft.direct ? "Contrato de servicio" : "Contratos para prorrateo"}
              value={draft.direct ? draft.contractCodes[0] ?? "" : draft.contractCodes}
              onChange={(event) => {
                const value: unknown = event.target.value;
                const contractCodes = Array.isArray(value)
                  ? value.filter((item): item is string => typeof item === "string")
                  : typeof value === "string" ? value.split(",").filter(Boolean) : [];
                setDraft((current) => ({ ...current, contractCodes }));
              }}
              slotProps={{ select: { multiple: !draft.direct, renderValue: (selected: unknown) => {
                const values = Array.isArray(selected)
                  ? selected.filter((value): value is string => typeof value === "string")
                  : typeof selected === "string" ? [selected] : [];
                return contracts.filter((contract) => values.includes(contract.code))
                  .map((contract) => contract.code).join(", ");
              } } }}
              helperText={draft.direct ? "Selecciona un contrato maestro." : "Selecciona uno o más contratos; el costo se divide en partes iguales."}
              fullWidth
            >
              {contracts.filter((contract) => contract.active).map((contract) => <MenuItem key={contract.code} value={contract.code}>{contract.code} · {contract.client}</MenuItem>)}
            </TextField>
          </Grid>
          <Grid size={{ xs: 12, md: 3 }}>
            <TextField select label="Supervisor a cargo" value={draft.supervisorId} onChange={(event) => setDraft((current) => ({ ...current, supervisorId: event.target.value }))} fullWidth>
              <MenuItem value="">Sin supervisor asignado</MenuItem>
              {employees.filter((employee) => employee.position.toLowerCase().includes("supervisor")).map((employee) => <MenuItem key={employee.id} value={employee.id}>{employee.name}</MenuItem>)}
            </TextField>
          </Grid>
          {draft.position.toLowerCase().includes("supervisor") && <Grid size={{ xs: 12, md: 3 }}>
            <TextField select label="Usuario Supervisor" value={draft.supervisorLogin} onChange={(event) => setDraft((current) => ({ ...current, supervisorLogin: event.target.value }))} required fullWidth>
              <MenuItem value="supervisor">supervisor · cuenta demo</MenuItem>
            </TextField>
          </Grid>}
          {!draft.position.toLowerCase().includes("supervisor") && <Grid size={{ xs: 12, md: 3 }}>
            <TextField select label="Usuario del sistema (Técnico)" value={draft.login} onChange={(event) => setDraft((current) => ({ ...current, login: event.target.value }))} helperText="Vincula al colaborador con su usuario Técnico. Cada usuario solo puede asignarse a un colaborador." fullWidth>
              <MenuItem value="">Sin usuario</MenuItem>
              {demoAccounts.filter((account) => account.role === "Técnico").map((account) => {
                const takenBy = employees.find((item) => item.login === account.username && item.id !== editingEmployeeId);
                return <MenuItem key={account.username} value={account.username} disabled={Boolean(takenBy)}>{account.username}{takenBy ? ` · ya vinculado a ${takenBy.name}` : ""}</MenuItem>;
              })}
            </TextField>
          </Grid>}
          <Grid size={{ xs: 12, md: 3 }}><Stack direction="row" spacing={1}><Button type="submit" variant="contained">{editingEmployeeId ? "Guardar cambios" : "Guardar colaborador"}</Button>{editingEmployeeId && <Button onClick={() => { setEditingEmployeeId(""); setDraft({ name: "", position: "", contractType: "Indefinido", contractStart: new Date().toISOString().slice(0, 10), contractEnd: "", employmentContractNumber: "", workSchedule: "", workplace: "", monthlySalary: "", hoursPerMonth: "180", deductionPercent: "20", direct: true, contractCodes: contracts[0]?.code ? [contracts[0].code] : [], supervisorId: "", supervisorLogin: "", login: "" }); }}>Cancelar</Button>}</Stack></Grid>
        </Grid>
      </Paper>
      <Paper sx={{ p: 3 }}>
        <Typography variant="h6" sx={{ mb: 2 }}>Personal y costo hora</Typography>
        <Table size="small"><TableHead><TableRow><TableCell>Colaborador</TableCell><TableCell>Cargo</TableCell><TableCell>Contrato laboral</TableCell><TableCell>Vigencia</TableCell><TableCell>Asignación</TableCell><TableCell>Contratos de servicio / Supervisor</TableCell><TableCell align="right">Sueldo</TableCell><TableCell align="right">Costo/hora</TableCell><TableCell>Acciones</TableCell></TableRow></TableHead>
          <TableBody>{employees.map((employee) => <TableRow key={employee.id}><TableCell>{employee.name}</TableCell><TableCell>{employee.position}</TableCell><TableCell>{employee.contractType}<Typography variant="caption" sx={{ display: "block" }}>{employee.employmentContractNumber || "Sin número de contrato"}</Typography></TableCell><TableCell>{employee.contractStart ?? "—"}{employee.contractEnd ? ` a ${employee.contractEnd}` : " · vigente"}</TableCell><TableCell><Chip size="small" label={employee.direct ? "Directo" : "Indirecto"} /></TableCell><TableCell>{(employee.contractCodes?.length ? employee.contractCodes : employee.contractCode ? [employee.contractCode] : []).join(", ") || "Sin contrato"}<Typography variant="caption" sx={{ display: "block" }}>{employees.find((item) => item.id === employee.supervisorId)?.name ?? "Sin supervisor"}</Typography></TableCell><TableCell align="right">{money(employee.monthlySalary)}</TableCell><TableCell align="right">{money(employee.monthlySalary / employee.hoursPerMonth)}</TableCell><TableCell><Button size="small" onClick={() => editEmployee(employee)}>Editar</Button></TableCell></TableRow>)}</TableBody>
        </Table>
      </Paper>
      <Paper sx={{ p: 3 }}>
        <Typography variant="h6" sx={{ mb: 2 }}>Vacaciones, licencias y permisos</Typography>
        <Stack component="form" direction={{ xs: "column", md: "row" }} spacing={2} onSubmit={addLeave} sx={{ mb: 2 }}>
          <TextField select label="Trabajador" value={leaveDraft.employeeId} onChange={(event) => setLeaveDraft((current) => ({ ...current, employeeId: event.target.value }))} required sx={{ minWidth: 220 }}>
            {employees.map((employee) => <MenuItem key={employee.id} value={employee.id}>{employee.name}</MenuItem>)}
          </TextField>
          <TextField select label="Tipo de ausencia" value={leaveDraft.type} onChange={(event) => setLeaveDraft((current) => ({ ...current, type: event.target.value as LeaveType }))} sx={{ minWidth: 220 }}>
            <MenuItem value="Vacaciones">Vacaciones</MenuItem>
            <MenuItem value="Licencia médica">Licencia médica</MenuItem>
            <MenuItem value="Permiso con goce">Permiso con goce de sueldo</MenuItem>
            <MenuItem value="Permiso sin goce">Permiso sin goce de sueldo</MenuItem>
          </TextField>
          <TextField type="date" label="Desde" value={leaveDraft.startDate} onChange={(event) => setLeaveDraft((current) => ({ ...current, startDate: event.target.value }))} slotProps={{ inputLabel: { shrink: true } }} required />
          <TextField type="date" label="Hasta" value={leaveDraft.endDate} onChange={(event) => setLeaveDraft((current) => ({ ...current, endDate: event.target.value }))} slotProps={{ inputLabel: { shrink: true } }} required />
          <TextField label="Observación / folio" value={leaveDraft.details} onChange={(event) => setLeaveDraft((current) => ({ ...current, details: event.target.value }))} />
          <Button type="submit" variant="contained">Registrar</Button>
        </Stack>
        {leaves.length === 0 ? <Typography color="text.secondary">No hay vacaciones, licencias o permisos registrados.</Typography> : (
          <Table size="small">
            <TableHead><TableRow><TableCell>Trabajador</TableCell><TableCell>Tipo</TableCell><TableCell>Desde</TableCell><TableCell>Hasta</TableCell><TableCell>Observación / folio</TableCell></TableRow></TableHead>
            <TableBody>{leaves.map((leave) => <TableRow key={leave.id}><TableCell>{leave.employeeName}</TableCell><TableCell>{leave.type}</TableCell><TableCell>{leave.startDate}</TableCell><TableCell>{leave.endDate}</TableCell><TableCell>{leave.details || "—"}</TableCell></TableRow>)}</TableBody>
          </Table>
        )}
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
              <Stack direction="row" spacing={1}><Chip label={run.status} color={run.status === "Pagada" ? "success" : "warning"} /><Button disabled={run.status === "Pagada"} onClick={() => payRun(run)}>Registrar pago</Button>{run.status === "Pendiente de pago" && can(role, "payroll.recalculate") && <Button onClick={() => recalculateRun(run)}>Recalcular</Button>}</Stack>
            </Stack>
            <Table size="small"><TableHead><TableRow><TableCell>Colaborador</TableCell><TableCell>Imputación (WBS/contrato)</TableCell><TableCell align="right">Costo bruto</TableCell><TableCell align="right">Líquido</TableCell></TableRow></TableHead><TableBody>{run.lines.map((line) => <TableRow key={line.employeeId}><TableCell>{line.employee}</TableCell><TableCell>{line.allocations.map((item) => `${item.contract}: ${money(item.amount)}`).join(" · ")}</TableCell><TableCell align="right">{money(line.gross)}</TableCell><TableCell align="right">{money(line.net)}</TableCell></TableRow>)}</TableBody></Table>
          </Paper>
        ))}
      </Paper>
      <Paper sx={{ p: 3 }}>
        <Typography variant="h6" sx={{ mb: 2 }}>Liquidaciones de sueldo</Typography>
        <Stack direction={{ xs: "column", sm: "row" }} spacing={2} sx={{ mb: 2 }}>
          <TextField select label="Trabajador" value={selectedSlipEmployeeId} onChange={(event) => setSlipEmployeeId(event.target.value)} sx={{ minWidth: 240 }}>
            {employees.map((employee) => <MenuItem key={employee.id} value={employee.id}>{employee.name}</MenuItem>)}
          </TextField>
          <TextField select label="Período" value={selectedSlipPeriod} onChange={(event) => setSlipPeriod(event.target.value)} sx={{ minWidth: 180 }}>
            {runs.map((run) => <MenuItem key={run.id} value={run.period}>{run.period}</MenuItem>)}
          </TextField>
        </Stack>
        {!activeSlipRun || !selectedSlipLine ? (
          <Alert severity="info">No hay una liquidación generada para el trabajador y período seleccionados. Genera primero la nómina mensual.</Alert>
        ) : (
          <Paper id="employee-payslip" variant="outlined" sx={{ p: { xs: 2, md: 4 }, maxWidth: 900, mx: "auto" }}>
            <style>{`@media print { body * { visibility: hidden !important; } #employee-payslip, #employee-payslip * { visibility: visible !important; } #employee-payslip { position: fixed; inset: 0; width: 100%; max-width: none; background: white; padding: 24px; border: 0; box-shadow: none; } .payslip-print-button { display: none !important; } }`}</style>
            <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "flex-start", borderBottom: "2px solid #0f172a", pb: 2, mb: 2 }}>
              <Box>
                <Typography variant="h5" sx={{ fontWeight: 800 }}>LIQUIDACIÓN DE SUELDO</Typography>
                <Typography variant="subtitle1">Período: {activeSlipRun.period}</Typography>
                <Typography variant="caption" color="text.secondary">Documento de demostración · sin validez laboral ni previsional</Typography>
              </Box>
              <Button className="payslip-print-button" variant="outlined" onClick={printPayslip}>Imprimir</Button>
            </Stack>
            <Grid container spacing={2} sx={{ mb: 2 }}>
              <Grid size={{ xs: 12, sm: 6 }}>
                <Paper variant="outlined" sx={{ p: 2, height: "100%" }}>
                  <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>EMPLEADOR</Typography>
                  <Typography>PMOptimizer · Empresa demo</Typography>
                  <Typography variant="body2" color="text.secondary">RUT y domicilio: no configurados</Typography>
                </Paper>
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <Paper variant="outlined" sx={{ p: 2, height: "100%" }}>
                  <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>TRABAJADOR</Typography>
                  <Typography>{selectedSlipLine.employee}</Typography>
                  <Typography variant="body2">Cargo: {selectedSlipEmployee?.position ?? "—"}</Typography>
                  <Typography variant="body2">Identificador interno: {selectedSlipLine.employeeId}</Typography>
                </Paper>
              </Grid>
              <Grid size={{ xs: 12 }}>
                <Paper variant="outlined" sx={{ p: 2 }}>
                  <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>ANTECEDENTES CONTRACTUALES</Typography>
                  <Grid container spacing={1}>
                    <Grid size={{ xs: 12, sm: 4 }}><Typography variant="body2">Contrato: {selectedSlipEmployee?.employmentContractNumber || "No registrado"}</Typography></Grid>
                    <Grid size={{ xs: 12, sm: 4 }}><Typography variant="body2">Tipo: {selectedSlipEmployee?.contractType ?? "—"}</Typography></Grid>
                    <Grid size={{ xs: 12, sm: 4 }}><Typography variant="body2">Jornada: {selectedSlipEmployee?.workSchedule || `${selectedSlipEmployee?.hoursPerMonth ?? "—"} horas/mes`}</Typography></Grid>
                    <Grid size={{ xs: 12, sm: 6 }}><Typography variant="body2">Inicio: {selectedSlipEmployee?.contractStart || "No registrado"}</Typography></Grid>
                    <Grid size={{ xs: 12, sm: 6 }}><Typography variant="body2">Lugar de trabajo: {selectedSlipEmployee?.workplace || "No registrado"}</Typography></Grid>
                  </Grid>
                </Paper>
              </Grid>
            </Grid>
            <Grid container spacing={2}>
              <Grid size={{ xs: 12, md: 6 }}>
                <Paper variant="outlined" sx={{ height: "100%" }}>
                  <Box sx={{ px: 2, py: 1, bgcolor: "#f1f5f9" }}><Typography variant="subtitle2" sx={{ fontWeight: 700 }}>HABERES</Typography></Box>
                  <Table size="small"><TableBody>
                    <TableRow><TableCell>Remuneración mensual registrada (demo)</TableCell><TableCell align="right">{money(selectedSlipLine.gross)}</TableCell></TableRow>
                    <TableRow><TableCell sx={{ fontWeight: 700 }}>Total haberes informados</TableCell><TableCell align="right" sx={{ fontWeight: 700 }}>{money(selectedSlipLine.gross)}</TableCell></TableRow>
                  </TableBody></Table>
                </Paper>
              </Grid>
              <Grid size={{ xs: 12, md: 6 }}>
                <Paper variant="outlined" sx={{ height: "100%" }}>
                  <Box sx={{ px: 2, py: 1, bgcolor: "#f1f5f9" }}><Typography variant="subtitle2" sx={{ fontWeight: 700 }}>DESCUENTOS</Typography></Box>
                  <Table size="small"><TableBody>
                    <TableRow><TableCell>Descuento estimado configurable (demo)</TableCell><TableCell align="right">-{money(selectedSlipLine.deductions)}</TableCell></TableRow>
                    <TableRow><TableCell sx={{ fontWeight: 700 }}>Total descuentos informados</TableCell><TableCell align="right" sx={{ fontWeight: 700 }}>-{money(selectedSlipLine.deductions)}</TableCell></TableRow>
                  </TableBody></Table>
                </Paper>
              </Grid>
              <Grid size={{ xs: 12 }}>
                <Paper sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", p: 2, bgcolor: "#f0fdf4", border: "1px solid #86efac" }}>
                  <Typography variant="h6" sx={{ fontWeight: 800 }}>LÍQUIDO A PAGO</Typography>
                  <Typography variant="h5" sx={{ fontWeight: 800 }}>{money(selectedSlipLine.net)}</Typography>
                </Paper>
              </Grid>
              <Grid size={{ xs: 12 }}>
                <Typography variant="body2">Estado del pago: <strong>{activeSlipRun.status}</strong></Typography>
                <Typography variant="caption" color="text.secondary">Este prototipo no desglosa cotizaciones previsionales, impuestos, haberes adicionales ni otros descuentos legales. Los valores deben ser revisados y calculados conforme a normativa vigente antes de uso real.</Typography>
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }} sx={{ mt: 5, textAlign: "center" }}><Typography sx={{ borderTop: "1px solid #64748b", pt: 1, mx: 3 }}>Firma empleador</Typography></Grid>
              <Grid size={{ xs: 12, sm: 6 }} sx={{ mt: 5, textAlign: "center" }}><Typography sx={{ borderTop: "1px solid #64748b", pt: 1, mx: 3 }}>Firma trabajador</Typography></Grid>
            </Grid>
          </Paper>
        )}
      </Paper>
    </Stack>
  );
}
