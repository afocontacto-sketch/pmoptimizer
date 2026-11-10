import { keys } from "../data/keys";
import { readClients, readContracts } from "../data/contracts";
import { orderTimeTotals, readTimeEntries } from "../data/workOrders";
import { useMemo, useState } from "react";
import type { FormEvent } from "react";
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Grid,
  MenuItem,
  Paper,
  Stack,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Tabs,
  TextField,
  Typography,
} from "@mui/material";
import { Add, Paid, Print, ReceiptLong } from "@mui/icons-material";
import {
  defaultAccounts,
  emptyFinanceState,
  makeFinanceId,
  readFinanceState,
  readFinanceList,
  roundCurrency,
  saveFinanceState,
} from "./financeData";
import type {
  AccountType,
  FinanceAccount,
  FinanceCurrency,
  FinanceInvoice,
  FinanceState,
  InvoiceKind,
  JournalEntry,
  JournalLine,
} from "./financeData";
import { printDocument } from "../components/print/printDocument";
import { invoiceDoc } from "../components/print/templates/invoiceDoc";
import { purchaseInvoiceWbsError, purchaseOrdersStorageKey, suppliersStorageKey } from "./supplyData";
import { dueDateFromTerm, orderPaymentDays, readSuppliers } from "../data/suppliers";
import type { PurchaseOrder, SupplierMaster } from "./supplyData";
import { payrollRunsStorageKey } from "./HumanResourcesPage";

type OperationalOrder = {
  id: string;
  status: string;
  contract: string;
  wbs: string;
  equipment: string;
  consumedMaterials?: { code: string; quantity: number; unitCost?: number }[];
  materials?: { code: string; picked: number; unitCostAvg?: number }[];
};
type StockBin = { code: string; quantity: number; unitCost: number };
type ClientMaster = { name: string; contractCode?: string; wbs?: string[] };
type InvoiceDraft = {
  kind: InvoiceKind;
  documentType: "Factura afecta" | "Factura exenta";
  number: string;
  counterparty: string;
  issueDate: string;
  dueDate: string;
  currency: FinanceCurrency;
  exchangeRate: string;
  netAmount: string;
  accountCode: string;
  purchaseOrder: string;
  contract: string;
  wbs: string;
};
type AccountDraft = { code: string; name: string; type: AccountType };
type PayrollPaymentDraft = {
  selectedRuns: string[];
  paymentDate: string;
  bankAccount: string;
  reference: string;
  observations: string;
};

const demoAccounts = defaultAccounts;
const supplierAccountCode = "210101";
const customerAccountCode = "110201";
const bankAccountCode = "110101";
const payableAccountCode = "210301";
const personalExpenseAccountCode = "510301";
const inputVatAccountCode = "110301";
const outputVatAccountCode = "210201";
const workOrdersStorageKey = keys.workOrders;
const warehouseStorageKey = keys.warehouseBins;
const vatRate = 0.19;
const fallbackClients: ClientMaster[] = [
  { name: "Comercial Aconcagua" },
  { name: "Minera Sur Ltda." },
  { name: "Maderas del Valle" },
  { name: "Fiat Chile", contractCode: "CT1234", wbs: ["CT1234-CL-B2N4-PRE", "CT1234-CL-B2N4-OVH", "CT1234-CL-B2N4-COR", "CT1234-CL-B2N4-REP"] },
];

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function money(value: number, currency = "CLP"): string {
  return new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency,
    maximumFractionDigits: currency === "CLP" ? 0 : 2,
  }).format(value);
}

function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T12:00:00`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function makeLine(account: FinanceAccount, debit: number, credit: number): JournalLine {
  return {
    accountCode: account.code,
    accountName: account.name,
    debit: roundCurrency(debit),
    credit: roundCurrency(credit),
  };
}

function requiredAccount(accounts: Map<string, FinanceAccount>, code: string): FinanceAccount {
  const account = accounts.get(code);
  if (!account) throw new Error(`Falta configurar la cuenta contable ${code}.`);
  return account;
}

function makeInvoiceEntry(invoice: FinanceInvoice, accounts: FinanceAccount[]): JournalEntry {
  const byCode = new Map(accounts.map((account) => [account.code, account]));
  const account = requiredAccount(byCode, invoice.accountCode);
  const control = requiredAccount(byCode, invoice.kind === "Compra" ? supplierAccountCode : customerAccountCode);
  const vatAccountCode = invoice.kind === "Compra" ? inputVatAccountCode : outputVatAccountCode;
  const vatAccount = invoice.vatAmount > 0 ? requiredAccount(byCode, vatAccountCode) : null;
  const lines = invoice.kind === "Compra"
    ? [
      makeLine(account, invoice.netAmount * invoice.exchangeRate, 0),
      ...(vatAccount
        ? [makeLine(vatAccount, invoice.vatAmount * invoice.exchangeRate, 0)]
        : []),
      makeLine(control, 0, invoice.totalClp),
    ]
    : [
      makeLine(control, invoice.totalClp, 0),
      makeLine(account, 0, invoice.netAmount * invoice.exchangeRate),
      ...(vatAccount
        ? [makeLine(vatAccount, 0, invoice.vatAmount * invoice.exchangeRate)]
        : []),
    ];
  return {
    id: makeFinanceId("ASI"),
    date: invoice.issueDate,
    description: `${invoice.kind === "Compra" ? "Registro factura proveedor" : "Emisión demo factura cliente"} ${invoice.number}`,
    sourceId: invoice.id,
    lines,
  };
}

function makePaymentEntry(invoice: FinanceInvoice, accounts: FinanceAccount[], date: string, reference: string): JournalEntry {
  const byCode = new Map(accounts.map((account) => [account.code, account]));
  const control = byCode.get(invoice.kind === "Compra" ? supplierAccountCode : customerAccountCode);
  const bank = byCode.get(bankAccountCode);
  if (!control || !bank) throw new Error("Falta configurar la cuenta de banco o de control.");
  return {
    id: makeFinanceId("ASI"),
    date,
    description: `${invoice.kind === "Compra" ? "Pago proveedor" : "Cobro cliente"} ${invoice.number} · ${reference}`,
    sourceId: invoice.id,
    lines: invoice.kind === "Compra"
      ? [makeLine(control, invoice.totalClp, 0), makeLine(bank, 0, invoice.totalClp)]
      : [makeLine(bank, invoice.totalClp, 0), makeLine(control, 0, invoice.totalClp)],
  };
}

function makePayrollPaymentEntry(
  payrollId: string,
  period: string,
  net: number,
  date: string,
  bankCode: string,
  reference: string,
  accounts: FinanceAccount[]
): JournalEntry {
  const byCode = new Map(accounts.map((account) => [account.code, account]));
  const payableAccount = requiredAccount(byCode, payableAccountCode);
  const bankAccount = requiredAccount(byCode, bankCode);
  
  return {
    id: makeFinanceId("ASI"),
    date,
    description: `Pago de nómina ${period} · ${reference}`,
    sourceId: payrollId,
    lines: [
      makeLine(payableAccount, net, 0),
      makeLine(bankAccount, 0, net),
    ],
  };
}

function readOperationsCost(): { id: string; contract: string; wbs: string; equipment: string; labor: number; materials: number; total: number }[] {
  const orders = readFinanceList<OperationalOrder>(workOrdersStorageKey);
  const timeEntries = readTimeEntries();
  const bins = readFinanceList<StockBin>(warehouseStorageKey);
  const averageCost = new Map<string, { quantity: number; value: number }>();
  for (const bin of bins) {
    const balance = averageCost.get(bin.code) ?? { quantity: 0, value: 0 };
    balance.quantity += Math.max(0, bin.quantity);
    balance.value += Math.max(0, bin.quantity) * Math.max(0, bin.unitCost);
    averageCost.set(bin.code, balance);
  }
  return orders.filter((order) => order.status === "Cerrada").map((order) => {
    const labor = orderTimeTotals(order.id, timeEntries, Date.now()).laborCost;
    // OT nuevas: materials.picked x costo medio; las antiguas sin materials usan consumedMaterials.
    const consumed = order.materials?.length
      ? order.materials.map((item) => ({ code: item.code, quantity: item.picked, unitCost: item.unitCostAvg }))
      : order.consumedMaterials ?? [];
    const materials = consumed.reduce((total, item) => {
      const balance = averageCost.get(item.code);
      const unitCost = item.unitCost ?? (balance && balance.quantity > 0 ? balance.value / balance.quantity : 0);
      return total + Math.max(0, item.quantity) * Math.max(0, unitCost);
    }, 0);
    return {
      id: order.id,
      contract: order.contract,
      wbs: order.wbs,
      equipment: order.equipment,
      labor: roundCurrency(labor),
      materials: roundCurrency(materials),
      total: roundCurrency(labor + materials),
    };
  });
}

function newInvoiceDraft(kind: InvoiceKind): InvoiceDraft {
  return {
    kind,
    documentType: "Factura afecta",
    number: "",
    counterparty: "",
    issueDate: today(),
    dueDate: today(),
    currency: "CLP",
    exchangeRate: "1",
    netAmount: "",
    accountCode: kind === "Compra" ? "510101" : "410101",
    purchaseOrder: "",
    contract: "",
    wbs: "",
  };
}

export default function AccountingPage({ role }: { role: string }) {
  const [finance, setFinance] = useState<FinanceState>(() => {
    const saved = readFinanceState();
    return saved.accounts.length ? saved : { ...emptyFinanceState, accounts: demoAccounts };
  });
  const [tab, setTab] = useState(0);
  const [draft, setDraft] = useState<InvoiceDraft>(() => newInvoiceDraft("Compra"));
  const [accountDraft, setAccountDraft] = useState<AccountDraft>({ code: "", name: "", type: "Gasto" });
  const [paymentTarget, setPaymentTarget] = useState<string | null>(null);
  const [paymentDate, setPaymentDate] = useState(today());
  const [paymentReference, setPaymentReference] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [payrollPaymentDialog, setPayrollPaymentDialog] = useState(false);
  const [payrollPaymentDraft, setPayrollPaymentDraft] = useState<PayrollPaymentDraft>({
    selectedRuns: [],
    paymentDate: today(),
    bankAccount: bankAccountCode,
    reference: "",
    observations: "",
  });
  const [payrollPaymentHistory, setPayrollPaymentHistory] = useState(() => 
    readFinanceList<{ runId: string; period: string; date: string; amount: number; reference: string }>(keys.payrollPayments, [])
  );
  const canEdit = role === "Administrador" || role === "Contabilidad";

  const activeExpenseAccounts = finance.accounts.filter((account) => account.type === "Gasto");
  const activeRevenueAccounts = finance.accounts.filter((account) => account.type === "Ingreso");
  const purchaseOrders = readFinanceList<PurchaseOrder>(purchaseOrdersStorageKey);
  const savedClients: ClientMaster[] = readClients().map((client) => ({ name: client.name }));
  const clients = savedClients.length ? savedClients : fallbackClients;
  const clientNames = [...new Set(clients.map((client) => client.name).filter(Boolean))];
  const savedSupplierNames = readFinanceList<SupplierMaster>(suppliersStorageKey).map((supplier) => supplier.name);
  // Factura ligada a OC: vencimiento = fecha de factura + plazo de pago de la OC (editable después).
  const linkedOrder = (current: InvoiceDraft) => current.kind === "Compra" ? purchaseOrders.find((order) => order.id === current.purchaseOrder) : undefined;
  const linkedTermDays = (current: InvoiceDraft) => {
    const order = linkedOrder(current);
    return order ? orderPaymentDays(order, readSuppliers()) : null;
  };
  const withTermDueDate = (current: InvoiceDraft): InvoiceDraft => {
    const days = linkedTermDays(current);
    return days === null || !validDate(current.issueDate) ? current : { ...current, dueDate: dueDateFromTerm(current.issueDate, days) };
  };
  const draftTermDays = linkedTermDays(draft);
  const quotedSupplierNames = readFinanceList<{ quotes?: { supplier: string }[] }>(keys.purchaseRequests)
    .flatMap((request) => request.quotes?.map((quote) => quote.supplier) ?? []);
  const supplierNames = [...new Set([...savedSupplierNames, ...purchaseOrders.map((order) => order.supplier), ...quotedSupplierNames].filter(Boolean))];
  const contractOptions: (ClientMaster & { contractCode: string })[] = readContracts().map((contract) => ({ name: contract.customer, contractCode: contract.code, wbs: contract.wbs.map((element) => element.code) }));
  const selectedClient = contractOptions.find((client) => client.contractCode === draft.contract);
  const wbsOptions = selectedClient?.wbs ?? [];
  const payrollRuns = readFinanceList<{
    id: string;
    period: string;
    status: string;
    gross: number;
    deductions: number;
    net: number;
    lines: { employee: string; allocations: { contract: string; amount: number }[] }[];
  }>(payrollRunsStorageKey);
  const operationalCosts = useMemo(readOperationsCost, [finance.invoices, finance.entries]);
  const openPayables = finance.invoices.filter((invoice) => invoice.kind === "Compra" && invoice.status === "Contabilizada");
  const pendingPayroll = payrollRuns.filter((run) => run.status === "Pendiente de pago");
  const openReceivables = finance.invoices.filter((invoice) => invoice.kind === "Venta" && invoice.status === "Emitida (demo)");
  const totalDebits = finance.entries.reduce((sum, entry) =>
    sum + entry.lines.reduce((lineSum, line) => lineSum + line.debit, 0), 0);
  const totalCredits = finance.entries.reduce((sum, entry) =>
    sum + entry.lines.reduce((lineSum, line) => lineSum + line.credit, 0), 0);
  const balances = useMemo(() => {
    const totals = new Map<string, { debit: number; credit: number }>();
    for (const entry of finance.entries) {
      for (const line of entry.lines) {
        const total = totals.get(line.accountCode) ?? { debit: 0, credit: 0 };
        total.debit += line.debit;
        total.credit += line.credit;
        totals.set(line.accountCode, total);
      }
    }
    return totals;
  }, [finance.entries]);
  const revenueTotal = finance.accounts.filter((account) => account.type === "Ingreso")
    .reduce((sum, account) => {
      const value = balances.get(account.code);
      return sum + (value ? value.credit - value.debit : 0);
    }, 0);
  const expenseTotal = finance.accounts.filter((account) => account.type === "Gasto")
    .reduce((sum, account) => {
      const value = balances.get(account.code);
      return sum + (value ? value.debit - value.credit : 0);
    }, 0);
  const assetTotal = finance.accounts.filter((account) => account.type === "Activo")
    .reduce((sum, account) => {
      const value = balances.get(account.code);
      return sum + (value ? value.debit - value.credit : 0);
    }, 0);
  const liabilitiesAndEquity = finance.accounts
    .filter((account) => account.type === "Pasivo" || account.type === "Patrimonio")
    .reduce((sum, account) => {
      const value = balances.get(account.code);
      return sum + (value ? value.credit - value.debit : 0);
    }, 0) + revenueTotal - expenseTotal;

  const persist = (next: FinanceState, successMessage: string) => {
    if (!saveFinanceState(next)) {
      setError("No se pudieron guardar los cambios contables. Revisa el almacenamiento disponible del navegador.");
      return false;
    }
    setFinance(next);
    setError("");
    setMessage(successMessage);
    return true;
  };

  const updateCurrency = (currency: FinanceCurrency) => {
    setDraft((current) => ({ ...current, currency, exchangeRate: currency === "CLP" ? "1" : "" }));
  };

  const handleInvoiceSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canEdit) {
      setError("Solo Contabilidad o Administrador puede registrar documentos.");
      return;
    }
    const netAmount = Number(draft.netAmount);
    const exchangeRate = Number(draft.exchangeRate);
    if (!draft.number.trim() || !draft.counterparty.trim() || !draft.accountCode ||
      !Number.isFinite(netAmount) || netAmount <= 0 ||
      !Number.isFinite(exchangeRate) || exchangeRate <= 0 ||
      !validDate(draft.issueDate) || !validDate(draft.dueDate) || draft.dueDate < draft.issueDate) {
      setError("Completa folio, contraparte, cuenta, montos y fechas válidos. El vencimiento no puede ser anterior a la emisión.");
      return;
    }
    const wbsError = purchaseInvoiceWbsError({ kind: draft.kind, purchaseOrder: draft.purchaseOrder, wbs: draft.wbs });
    if (wbsError) {
      setError(wbsError);
      return;
    }
    const alreadyExists = finance.invoices.some((invoice) =>
      invoice.kind === draft.kind && invoice.number.toLowerCase() === draft.number.trim().toLowerCase());
    if (alreadyExists) {
      setError("Ya existe un documento de este tipo con ese folio.");
      return;
    }
    const vatAmount = draft.documentType === "Factura afecta" ? roundCurrency(netAmount * vatRate) : 0;
    const invoice: FinanceInvoice = {
      id: makeFinanceId(draft.kind === "Compra" ? "FC" : "FV"),
      kind: draft.kind,
      documentType: draft.documentType,
      number: draft.number.trim(),
      counterparty: draft.counterparty.trim(),
      issueDate: draft.issueDate,
      dueDate: draft.dueDate,
      currency: draft.currency,
      exchangeRate,
      netAmount,
      vatAmount,
      totalAmount: roundCurrency(netAmount + vatAmount),
      totalClp: roundCurrency(netAmount * exchangeRate) + roundCurrency(vatAmount * exchangeRate),
      accountCode: draft.accountCode,
      purchaseOrder: draft.kind === "Compra" ? draft.purchaseOrder : undefined,
      contract: draft.contract.trim() || undefined,
      wbs: draft.wbs.trim() || undefined,
      status: draft.kind === "Compra" ? "Contabilizada" : "Emitida (demo)",
    };
    try {
      const entry = makeInvoiceEntry(invoice, finance.accounts);
      const next = { ...finance, invoices: [invoice, ...finance.invoices], entries: [entry, ...finance.entries] };
      if (persist(next, draft.kind === "Compra"
        ? `Factura ${invoice.number} contabilizada; se generó el asiento ${entry.id}.`
        : `Documento ${invoice.number} emitido en modo demo; se generó el asiento ${entry.id}.`)) {
        setDraft(newInvoiceDraft(draft.kind));
      }
    } catch (submitError) {
      console.error("No se pudo contabilizar el documento.", submitError);
      setError(submitError instanceof Error ? submitError.message : "No se pudo contabilizar el documento.");
    }
  };

  const registerPayment = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canEdit) {
      setError("Solo Contabilidad o Administrador puede registrar pagos o cobros.");
      return;
    }
    const invoice = finance.invoices.find((item) => item.id === paymentTarget);
    if (!invoice || !validDate(paymentDate) || !paymentReference.trim()) {
      setError("Selecciona una factura abierta, fecha válida y referencia de pago.");
      return;
    }
    const paidStatus = invoice.kind === "Compra" ? "Pagada" as const : "Pagada" as const;
    try {
      const entry = makePaymentEntry(invoice, finance.accounts, paymentDate, paymentReference.trim());
      const next = {
        ...finance,
        invoices: finance.invoices.map((item) => item.id === invoice.id
          ? { ...item, status: paidStatus, paymentDate, paymentReference: paymentReference.trim() }
          : item),
        entries: [entry, ...finance.entries],
      };
      if (persist(next, `${invoice.kind === "Compra" ? "Pago" : "Cobro"} registrado; asiento ${entry.id}.`)) {
        setPaymentTarget(null);
        setPaymentReference("");
      }
    } catch (paymentError) {
      console.error("No se pudo registrar el pago/cobro.", paymentError);
      setError(paymentError instanceof Error ? paymentError.message : "No se pudo registrar el pago/cobro.");
    }
  };

  const addAccount = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canEdit) {
      setError("Solo Contabilidad o Administrador puede mantener el plan de cuentas.");
      return;
    }
    const code = accountDraft.code.trim();
    const name = accountDraft.name.trim();
    if (!/^[0-9A-Za-z.-]{3,20}$/.test(code) || !name ||
      finance.accounts.some((account) => account.code.toLowerCase() === code.toLowerCase())) {
      setError("Ingresa código válido (3–20 caracteres), nombre y un código no duplicado.");
      return;
    }
    const next = { ...finance, accounts: [...finance.accounts, { ...accountDraft, code, name }] };
    if (persist(next, `Cuenta ${code} agregada al plan de cuentas.`)) {
      setAccountDraft({ code: "", name: "", type: "Gasto" });
    }
  };

  const beginPayment = (invoiceId: string) => {
    setPaymentTarget(invoiceId);
    setPaymentDate(today());
    setPaymentReference("");
    setError("");
  };

  const registerPayrollPayment = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canEdit) {
      setError("Solo Contabilidad o Administrador puede registrar pagos de nómina.");
      return;
    }
    if (payrollPaymentDraft.selectedRuns.length === 0 || !validDate(payrollPaymentDraft.paymentDate) || 
        !payrollPaymentDraft.reference.trim() || !payrollPaymentDraft.bankAccount) {
      setError("Selecciona nóminas, fecha válida, banco y referencia de pago.");
      return;
    }

    const selectedPayrollRuns = pendingPayroll.filter((run) => payrollPaymentDraft.selectedRuns.includes(run.id));
    const totalNet = selectedPayrollRuns.reduce((sum, run) => sum + run.net, 0);

    try {
      const newEntries: JournalEntry[] = [];
      const updatedPayrollRuns = payrollRuns.map((run) => {
        if (payrollPaymentDraft.selectedRuns.includes(run.id)) {
          const entry = makePayrollPaymentEntry(
            run.id,
            run.period,
            run.net,
            payrollPaymentDraft.paymentDate,
            payrollPaymentDraft.bankAccount,
            payrollPaymentDraft.reference.trim(),
            finance.accounts
          );
          newEntries.push(entry);
          return { ...run, status: "Pagada" as const };
        }
        return run;
      });

      const next = {
        ...finance,
        entries: [...newEntries, ...finance.entries],
      };

      if (persist(next, `${selectedPayrollRuns.length} nómina(s) pagada(s); ${totalNet.toLocaleString("es-CL")} CLP procesado(s).`)) {
        localStorage.setItem(payrollRunsStorageKey, JSON.stringify(updatedPayrollRuns));
        
        const paymentRecords = selectedPayrollRuns.map((run) => ({
          runId: run.id,
          period: run.period,
          date: payrollPaymentDraft.paymentDate,
          amount: run.net,
          reference: payrollPaymentDraft.reference.trim(),
        }));
        const updatedHistory = [...paymentRecords, ...payrollPaymentHistory];
        setPayrollPaymentHistory(updatedHistory);
        localStorage.setItem(keys.payrollPayments, JSON.stringify(updatedHistory));

        setPayrollPaymentDialog(false);
        setPayrollPaymentDraft({
          selectedRuns: [],
          paymentDate: today(),
          bankAccount: bankAccountCode,
          reference: "",
          observations: "",
        });
      }
    } catch (paymentError) {
      console.error("No se pudo registrar el pago de nómina.", paymentError);
      setError(paymentError instanceof Error ? paymentError.message : "No se pudo registrar el pago de nómina.");
    }
  };

  const bankAccounts = finance.accounts.filter((account) => account.type === "Activo" && account.name.includes("Banco"));
  const paymentInvoice = finance.invoices.find((invoice) => invoice.id === paymentTarget);

  return (
    <Stack spacing={3}>
      <Box>
        <Typography variant="h4" sx={{ fontWeight: 700 }}>Contabilidad y finanzas</Typography>
        <Typography color="text.secondary">
          Registro de facturas, cuentas por pagar/cobrar, pagos, asientos y control de costos operacionales.
        </Typography>
      </Box>
      <Alert severity="warning">
        Prototipo local: no emite ni valida DTE ante el SII, no reemplaza libros tributarios ni integra bancos. SUPUESTO: IVA de 19% para facturas afectas; confirma tasas y tratamiento con tu contador. USD y UF requieren ingresar el tipo de cambio CLP por unidad de la fecha del documento.
      </Alert>
      {message && <Alert severity="success">{message}</Alert>}
      {error && <Alert severity="error">{error}</Alert>}
      <Grid container spacing={2}>
        {[
          { label: "Cuentas por pagar", value: money(openPayables.reduce((sum, invoice) => sum + invoice.totalClp, 0) + pendingPayroll.reduce((sum, run) => sum + run.net, 0)) },
          { label: "Cuentas por cobrar", value: money(openReceivables.reduce((sum, invoice) => sum + invoice.totalClp, 0)) },
          { label: "Ingresos contabilizados", value: money(revenueTotal) },
          { label: "Gastos contabilizados", value: money(expenseTotal) },
        ].map((item) => (
          <Grid size={{ xs: 12, sm: 6, lg: 3 }} key={item.label}>
            <Paper sx={{ p: 2 }}>
              <Typography variant="body2" color="text.secondary">{item.label}</Typography>
              <Typography variant="h6" sx={{ mt: 1, fontWeight: 700 }}>{item.value}</Typography>
            </Paper>
          </Grid>
        ))}
      </Grid>
      <Paper sx={{ px: 2 }}>
        <Tabs value={tab} onChange={(_, value: number) => {
          setTab(value);
          if (value === 1 || value === 2) setDraft(newInvoiceDraft(value === 1 ? "Compra" : "Venta"));
          setPaymentTarget(null);
        }} variant="scrollable" allowScrollButtonsMobile>
          <Tab label="Resumen" />
          <Tab label="Cuentas por pagar" />
          <Tab label="Cuentas por cobrar" />
          <Tab label="Libro diario" />
          <Tab label="Plan de cuentas" />
          <Tab label="Nóminas a Pagar" />
        </Tabs>
      </Paper>

      {tab === 0 && (
        <Stack spacing={3}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" sx={{ mb: 2 }}>Estado de resultados · movimientos contabilizados</Typography>
            <Stack spacing={1}>
              <Box sx={{ display: "flex", justifyContent: "space-between" }}>
                <Typography>Ingresos</Typography><Typography>{money(revenueTotal)}</Typography>
              </Box>
              <Box sx={{ display: "flex", justifyContent: "space-between" }}>
                <Typography>Gastos</Typography><Typography>{money(expenseTotal)}</Typography>
              </Box>
              <Box sx={{ display: "flex", justifyContent: "space-between", borderTop: "1px solid", borderColor: "divider", pt: 1 }}>
                <Typography sx={{ fontWeight: 700 }}>Resultado del período demo</Typography>
                <Typography sx={{ fontWeight: 700 }}>{money(revenueTotal - expenseTotal)}</Typography>
              </Box>
            </Stack>
          </Paper>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" sx={{ mb: 2 }}>Balance general · demo</Typography>
            <Stack spacing={1}>
              <Box sx={{ display: "flex", justifyContent: "space-between" }}>
                <Typography>Total activos</Typography><Typography>{money(assetTotal)}</Typography>
              </Box>
              <Box sx={{ display: "flex", justifyContent: "space-between" }}>
                <Typography>Pasivos + patrimonio + resultado</Typography><Typography>{money(liabilitiesAndEquity)}</Typography>
              </Box>
            </Stack>
          </Paper>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" sx={{ mb: 2 }}>Costos reales de órdenes cerradas · lectura operacional</Typography>
            {operationalCosts.length === 0 ? (
              <Typography color="text.secondary">No hay OT cerradas disponibles para consolidar costos.</Typography>
            ) : (
              <Table size="small">
                <TableHead><TableRow><TableCell>OT</TableCell><TableCell>Contrato / WBS</TableCell><TableCell>Equipo</TableCell><TableCell align="right">Mano de obra</TableCell><TableCell align="right">Materiales</TableCell><TableCell align="right">Total</TableCell></TableRow></TableHead>
                <TableBody>{operationalCosts.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>{item.id}</TableCell>
                    <TableCell>{item.contract}<Typography variant="caption" sx={{ display: "block" }}>{item.wbs}</Typography></TableCell>
                    <TableCell>{item.equipment}</TableCell>
                    <TableCell align="right">{money(item.labor)}</TableCell>
                    <TableCell align="right">{money(item.materials)}</TableCell>
                    <TableCell align="right">{money(item.total)}</TableCell>
                  </TableRow>
                ))}</TableBody>
              </Table>
            )}
            <Typography variant="caption" color="text.secondary">
              Estas cifras se leen de OT cerradas, pero aún no generan asientos automáticos de consumo/inventario. Evita sumarlas otra vez a gastos contabilizados desde facturas.
            </Typography>
          </Paper>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" sx={{ mb: 2 }}>Distribución de costos de nómina por contrato</Typography>
            {payrollRuns.length === 0 ? <Typography color="text.secondary">Genera nóminas desde Recursos Humanos para visualizar sus imputaciones mensuales.</Typography> : (
              <Table size="small">
                <TableHead><TableRow><TableCell>Período</TableCell><TableCell>Contrato / empleado</TableCell><TableCell align="right">Costo bruto imputado</TableCell><TableCell>Estado de pago</TableCell></TableRow></TableHead>
                <TableBody>{payrollRuns.flatMap((run) => run.lines.flatMap((line) => line.allocations.map((allocation, index) => (
                  <TableRow key={`${run.id}-${line.employee}-${allocation.contract}-${index}`}>
                    <TableCell>{run.period}</TableCell><TableCell>{allocation.contract}<Typography variant="caption" sx={{ display: "block" }}>{line.employee}</Typography></TableCell><TableCell align="right">{money(allocation.amount)}</TableCell><TableCell>{run.status}</TableCell>
                  </TableRow>
                ))))}</TableBody>
              </Table>
            )}
          </Paper>
          <Alert severity={Math.abs(totalDebits - totalCredits) < 0.01 ? "success" : "error"}>
            Balance del libro diario: debe {money(totalDebits)} · haber {money(totalCredits)} · diferencia {money(Math.abs(totalDebits - totalCredits))}.
          </Alert>
        </Stack>
      )}

      {(tab === 1 || tab === 2) && (
        <Stack spacing={3}>
          {canEdit && (
            <Paper component="form" onSubmit={handleInvoiceSubmit} sx={{ p: 3 }}>
              <Stack spacing={2}>
                <Typography variant="h6">
                  {tab === 1 ? "Registrar factura de proveedor" : "Emitir factura de prueba"}
                </Typography>
                {tab === 2 && (
                  <Alert severity="info">
                    Simulación para pruebas: crea un registro, genera su asiento y permite imprimirlo. No es un DTE, no tiene validez tributaria y no se envía al SII.
                  </Alert>
                )}
                {tab === 1 && supplierNames.length === 0 && (
                  <Alert severity="warning">No hay proveedores en el maestro. Regístralos desde Compras antes de ingresar facturas.</Alert>
                )}
                <Grid container spacing={2}>
                  <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                    <TextField select label="Tipo de documento" value={draft.documentType} onChange={(event) => setDraft((current) => ({ ...current, documentType: event.target.value as InvoiceDraft["documentType"] }))} fullWidth>
                      <MenuItem value="Factura afecta">Factura afecta</MenuItem>
                      <MenuItem value="Factura exenta">Factura exenta</MenuItem>
                    </TextField>
                  </Grid>
                  <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                    <TextField label="Folio / número" value={draft.number} onChange={(event) => setDraft((current) => ({ ...current, number: event.target.value }))} required fullWidth />
                  </Grid>
                  <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                    <TextField select label={tab === 1 ? "Proveedor maestro" : "Cliente maestro"} value={draft.counterparty} onChange={(event) => setDraft((current) => ({ ...current, counterparty: event.target.value }))} required fullWidth>
                      {(tab === 1 ? supplierNames : clientNames).map((name) => <MenuItem key={name} value={name}>{name}</MenuItem>)}
                    </TextField>
                  </Grid>
                  <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                    <TextField select label="Moneda" value={draft.currency} onChange={(event) => updateCurrency(event.target.value as FinanceCurrency)} fullWidth>
                      <MenuItem value="CLP">CLP</MenuItem><MenuItem value="USD">USD</MenuItem><MenuItem value="UF">UF</MenuItem>
                    </TextField>
                  </Grid>
                  <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                    <TextField label="Fecha de emisión" type="date" value={draft.issueDate} onChange={(event) => setDraft((current) => withTermDueDate({ ...current, issueDate: event.target.value }))} slotProps={{ inputLabel: { shrink: true } }} required fullWidth />
                  </Grid>
                  <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                    <TextField label="Fecha de vencimiento" type="date" value={draft.dueDate} onChange={(event) => setDraft((current) => ({ ...current, dueDate: event.target.value }))} slotProps={{ inputLabel: { shrink: true } }} helperText={draftTermDays !== null ? `Emisión + plazo de la OC (${draftTermDays === 0 ? "contado" : `${draftTermDays} días`})` : undefined} required fullWidth />
                  </Grid>
                  <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                    <TextField label={`Tipo de cambio (${draft.currency} a CLP)`} type="number" value={draft.exchangeRate} onChange={(event) => setDraft((current) => ({ ...current, exchangeRate: event.target.value }))} slotProps={{ htmlInput: { min: 0.0001, step: "any" } }} helperText="CLP por 1 unidad de moneda" required fullWidth />
                  </Grid>
                  <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                    <TextField label={`Monto neto (${draft.currency})`} type="number" value={draft.netAmount} onChange={(event) => setDraft((current) => ({ ...current, netAmount: event.target.value }))} slotProps={{ htmlInput: { min: 1, step: "any" } }} required fullWidth />
                  </Grid>
                  <Grid size={{ xs: 12, sm: 6, md: 4 }}>
                    <TextField select label={tab === 1 ? "Cuenta de gasto" : "Cuenta de ingreso"} value={draft.accountCode} onChange={(event) => setDraft((current) => ({ ...current, accountCode: event.target.value }))} required fullWidth>
                      {(tab === 1 ? activeExpenseAccounts : activeRevenueAccounts).map((account) => <MenuItem key={account.code} value={account.code}>{account.code} · {account.name}</MenuItem>)}
                    </TextField>
                  </Grid>
                  {tab === 1 && (
                    <Grid size={{ xs: 12, sm: 6, md: 4 }}>
                      <TextField select label="Orden de compra vinculada (opcional)" value={draft.purchaseOrder} onChange={(event) => setDraft((current) => withTermDueDate({ ...current, purchaseOrder: event.target.value }))} fullWidth>
                        <MenuItem value="">Sin OC</MenuItem>
                        {purchaseOrders.map((order) => <MenuItem key={order.id} value={order.id}>{order.id} · {order.supplier} · {order.materialCode}</MenuItem>)}
                      </TextField>
                    </Grid>
                  )}
                  <Grid size={{ xs: 12, sm: 6, md: 4 }}>
                    <TextField select label={draft.kind === "Compra" && !draft.purchaseOrder ? "Contrato (obligatorio sin OC)" : "Contrato (opcional)"} value={draft.contract} onChange={(event) => setDraft((current) => ({ ...current, contract: event.target.value, wbs: "" }))} fullWidth>
                      <MenuItem value="">Sin contrato</MenuItem>
                      {contractOptions.map((contract) => <MenuItem key={contract.contractCode} value={contract.contractCode}>{contract.contractCode} · {contract.name}</MenuItem>)}
                    </TextField>
                  </Grid>
                  <Grid size={{ xs: 12, sm: 6, md: 4 }}>
                    <TextField select label={draft.kind === "Compra" && !draft.purchaseOrder ? "Elemento WBS (obligatorio sin OC)" : "Elemento WBS (opcional)"} value={draft.wbs} disabled={!draft.contract} onChange={(event) => setDraft((current) => ({ ...current, wbs: event.target.value }))} fullWidth>
                      <MenuItem value="">Sin WBS</MenuItem>
                      {wbsOptions.map((code) => <MenuItem key={code} value={code}>{code}</MenuItem>)}
                    </TextField>
                  </Grid>
                </Grid>
                <Typography variant="body2" color="text.secondary">
                  IVA calculado: {draft.documentType === "Factura afecta" && Number(draft.netAmount) > 0
                    ? money(roundCurrency(Number(draft.netAmount) * vatRate), draft.currency)
                    : money(0, draft.currency)}
                  {" · "}Total CLP estimado: {money(
                    (Number(draft.netAmount) + (draft.documentType === "Factura afecta" ? Number(draft.netAmount) * vatRate : 0))
                      * Number(draft.exchangeRate || 0),
                  )}
                </Typography>
                <Box>
                  <Button type="submit" variant="contained" disabled={!canEdit || (tab === 1 && supplierNames.length === 0)} startIcon={tab === 1 ? <ReceiptLong /> : <Add />}>
                    {tab === 1 ? "Registrar y contabilizar" : "Emitir factura de prueba"}
                  </Button>
                </Box>
              </Stack>
            </Paper>
          )}

          {paymentInvoice && paymentInvoice.kind === (tab === 1 ? "Compra" : "Venta") && (
            <Paper component="form" onSubmit={registerPayment} sx={{ p: 3 }}>
              <Stack spacing={2}>
                <Typography variant="h6">{paymentInvoice.kind === "Compra" ? "Registrar pago" : "Registrar cobro"} · {paymentInvoice.number}</Typography>
                <Grid container spacing={2}>
                  <Grid size={{ xs: 12, sm: 4 }}><TextField label="Fecha de pago/cobro" type="date" value={paymentDate} onChange={(event) => setPaymentDate(event.target.value)} slotProps={{ inputLabel: { shrink: true } }} required fullWidth /></Grid>
                  <Grid size={{ xs: 12, sm: 4 }}><TextField label="Referencia bancaria" value={paymentReference} onChange={(event) => setPaymentReference(event.target.value)} required fullWidth /></Grid>
                  <Grid size={{ xs: 12, sm: 4 }}><TextField label="Monto aplicado (CLP)" value={money(paymentInvoice.totalClp)} slotProps={{ input: { readOnly: true } }} fullWidth /></Grid>
                </Grid>
                <Stack direction="row" spacing={1}>
                  <Button type="submit" variant="contained" startIcon={<Paid />}>Confirmar pago/cobro total</Button>
                  <Button onClick={() => setPaymentTarget(null)}>Cancelar</Button>
                </Stack>
              </Stack>
            </Paper>
          )}

          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" sx={{ mb: 2 }}>{tab === 1 ? "Facturas de proveedor" : "Facturas de cliente · pruebas"}</Typography>
            <InvoiceTable
              invoices={finance.invoices.filter((invoice) => invoice.kind === (tab === 1 ? "Compra" : "Venta"))}
              onPay={beginPayment}
              onPrint={(invoice) => {
                printDocument(invoiceDoc(invoice)).catch((printError: unknown) => {
                  setError(printError instanceof Error ? printError.message : "No se pudo imprimir el documento.");
                });
              }}
              canEdit={canEdit}
            />
            {tab === 1 && (
              <Box sx={{ mt: 3 }}>
                <Typography variant="h6" sx={{ mb: 1 }}>Remuneraciones pendientes de pago</Typography>
                {pendingPayroll.length === 0 ? <Typography color="text.secondary">No hay nóminas pendientes.</Typography> : (
                  <Table size="small">
                    <TableHead><TableRow><TableCell>Período</TableCell><TableCell>Documento de nómina</TableCell><TableCell>Estado</TableCell><TableCell align="right">Líquido por pagar</TableCell></TableRow></TableHead>
                    <TableBody>{pendingPayroll.map((run) => <TableRow key={run.id}><TableCell>{run.period}</TableCell><TableCell>{run.id}</TableCell><TableCell>{run.status}</TableCell><TableCell align="right">{money(run.net)}</TableCell></TableRow>)}</TableBody>
                  </Table>
                )}
              </Box>
            )}
          </Paper>
        </Stack>
      )}

      {tab === 3 && (
        <Paper sx={{ p: 3 }}>
          <Stack direction={{ xs: "column", sm: "row" }} sx={{ justifyContent: "space-between", gap: 1, mb: 2 }}>
            <Typography variant="h6">Libro diario</Typography>
            <Chip label={finance.entries.length ? `${finance.entries.length} asientos` : "Sin asientos"} />
          </Stack>
          {finance.entries.length === 0 ? (
            <Typography color="text.secondary">Los asientos se generan al contabilizar facturas y registrar pagos/cobros.</Typography>
          ) : (
            <Table size="small">
              <TableHead><TableRow><TableCell>Fecha</TableCell><TableCell>Asiento / origen</TableCell><TableCell>Cuenta</TableCell><TableCell>Descripción</TableCell><TableCell align="right">Debe</TableCell><TableCell align="right">Haber</TableCell></TableRow></TableHead>
              <TableBody>{finance.entries.flatMap((entry) => entry.lines.map((line, index) => (
                <TableRow key={`${entry.id}-${index}`}>
                  <TableCell>{entry.date}</TableCell>
                  <TableCell>{entry.id}<Typography variant="caption" sx={{ display: "block" }}>{entry.sourceId}</Typography></TableCell>
                  <TableCell>{line.accountCode}</TableCell>
                  <TableCell>{index === 0 ? entry.description : line.accountName}</TableCell>
                  <TableCell align="right">{line.debit ? money(line.debit) : "—"}</TableCell>
                  <TableCell align="right">{line.credit ? money(line.credit) : "—"}</TableCell>
                </TableRow>
              )))}</TableBody>
              <TableHead><TableRow><TableCell colSpan={4}>Totales</TableCell><TableCell align="right">{money(totalDebits)}</TableCell><TableCell align="right">{money(totalCredits)}</TableCell></TableRow></TableHead>
            </Table>
          )}
        </Paper>
      )}

      {tab === 4 && (
        <Stack spacing={3}>
          {canEdit && (
            <Paper component="form" onSubmit={addAccount} sx={{ p: 3 }}>
              <Typography variant="h6" sx={{ mb: 2 }}>Agregar cuenta contable</Typography>
              <Grid container spacing={2} sx={{ alignItems: "center" }}>
                <Grid size={{ xs: 12, sm: 3 }}><TextField label="Código" value={accountDraft.code} onChange={(event) => setAccountDraft((current) => ({ ...current, code: event.target.value }))} required fullWidth /></Grid>
                <Grid size={{ xs: 12, sm: 4 }}><TextField label="Nombre" value={accountDraft.name} onChange={(event) => setAccountDraft((current) => ({ ...current, name: event.target.value }))} required fullWidth /></Grid>
                <Grid size={{ xs: 12, sm: 3 }}>
                  <TextField select label="Tipo" value={accountDraft.type} onChange={(event) => setAccountDraft((current) => ({ ...current, type: event.target.value as AccountType }))} fullWidth>
                    {(["Activo", "Pasivo", "Patrimonio", "Ingreso", "Gasto"] as AccountType[]).map((type) => <MenuItem key={type} value={type}>{type}</MenuItem>)}
                  </TextField>
                </Grid>
                <Grid size={{ xs: 12, sm: 2 }}><Button type="submit" variant="contained" startIcon={<Add />} fullWidth>Agregar</Button></Grid>
              </Grid>
            </Paper>
          )}
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" sx={{ mb: 2 }}>Plan de cuentas</Typography>
            <Table size="small">
              <TableHead><TableRow><TableCell>Código</TableCell><TableCell>Cuenta</TableCell><TableCell>Tipo</TableCell><TableCell align="right">Saldo de movimientos (CLP)</TableCell></TableRow></TableHead>
              <TableBody>{finance.accounts.map((account) => {
                const total = balances.get(account.code) ?? { debit: 0, credit: 0 };
                const balance = ["Activo", "Gasto"].includes(account.type)
                  ? total.debit - total.credit
                  : total.credit - total.debit;
                return (
                  <TableRow key={account.code}>
                    <TableCell>{account.code}</TableCell><TableCell>{account.name}</TableCell><TableCell>{account.type}</TableCell><TableCell align="right">{money(balance)}</TableCell>
                  </TableRow>
                );
              })}</TableBody>
            </Table>
          </Paper>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" sx={{ mb: 2 }}>Balance de comprobación · demo</Typography>
            <Stack direction="row" sx={{ justifyContent: "space-between" }}>
              <Typography>Total debe</Typography><Typography>{money(totalDebits)}</Typography>
              <Typography>Total haber</Typography><Typography>{money(totalCredits)}</Typography>
            </Stack>
          </Paper>
        </Stack>
      )}

      {tab === 5 && (
        <Stack spacing={3}>
          <Paper sx={{ p: 3 }}>
            <Stack spacing={2}>
              <Box>
                <Typography variant="h6" sx={{ mb: 1 }}>Nóminas a Pagar</Typography>
                <Typography variant="body2" color="text.secondary">
                  Gestión de pagos de nóminas y generación de asientos contables automáticos en Gastos de Personal.
                </Typography>
              </Box>
              {pendingPayroll.length === 0 ? (
                <Typography color="text.secondary">No hay nóminas pendientes de pago.</Typography>
              ) : (
                <>
                  <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 2 }}>
                    <Typography variant="subtitle2">
                      {`${pendingPayroll.length} nómina(s) pendiente(s) · Total neto: ${money(pendingPayroll.reduce((sum, run) => sum + run.net, 0))}`}
                    </Typography>
                    {canEdit && (
                      <Button variant="contained" startIcon={<Paid />} onClick={() => setPayrollPaymentDialog(true)}>
                        Pagar Seleccionadas
                      </Button>
                    )}
                  </Box>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell><Checkbox /></TableCell>
                        <TableCell>Período</TableCell>
                        <TableCell>Empleados</TableCell>
                        <TableCell align="right">Salario Bruto</TableCell>
                        <TableCell align="right">Descuentos</TableCell>
                        <TableCell align="right">Salario Neto</TableCell>
                        <TableCell>Estado</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {pendingPayroll.map((run) => (
                        <TableRow key={run.id}>
                          <TableCell>
                            <Checkbox 
                              checked={payrollPaymentDraft.selectedRuns.includes(run.id)}
                              onChange={(event) => {
                                setPayrollPaymentDraft((current) => ({
                                  ...current,
                                  selectedRuns: event.target.checked
                                    ? [...current.selectedRuns, run.id]
                                    : current.selectedRuns.filter((id) => id !== run.id),
                                }));
                              }}
                            />
                          </TableCell>
                          <TableCell>{run.period}</TableCell>
                          <TableCell>{run.lines.length} colaboradores</TableCell>
                          <TableCell align="right">{money(run.gross)}</TableCell>
                          <TableCell align="right">{money(run.deductions)}</TableCell>
                          <TableCell align="right"><Typography sx={{ fontWeight: 700 }}>{money(run.net)}</Typography></TableCell>
                          <TableCell><Chip size="small" label={run.status} color="warning" /></TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </>
              )}
            </Stack>
          </Paper>

          {payrollPaymentHistory.length > 0 && (
            <Paper sx={{ p: 3 }}>
              <Typography variant="h6" sx={{ mb: 2 }}>Historial de Pagos de Nóminas</Typography>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Período</TableCell>
                    <TableCell>Fecha de Pago</TableCell>
                    <TableCell align="right">Monto Pagado</TableCell>
                    <TableCell>Referencia</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {payrollPaymentHistory.map((payment, index) => (
                    <TableRow key={index}>
                      <TableCell>{payment.period}</TableCell>
                      <TableCell>{payment.date}</TableCell>
                      <TableCell align="right">{money(payment.amount)}</TableCell>
                      <TableCell>{payment.reference}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Paper>
          )}

          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" sx={{ mb: 2 }}>Reportes de Nómina</Typography>
            <Stack spacing={2}>
              <Box sx={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 2 }}>
                <Box>
                  <Typography variant="body2" color="text.secondary">Total Pagado (mes actual)</Typography>
                  <Typography sx={{ fontWeight: 700, mt: 0.5 }}>
                    {money(payrollPaymentHistory.filter((p) => p.date.startsWith(today().slice(0, 7))).reduce((sum, p) => sum + p.amount, 0))}
                  </Typography>
                </Box>
                <Box>
                  <Typography variant="body2" color="text.secondary">Total Pendiente</Typography>
                  <Typography sx={{ fontWeight: 700, mt: 0.5 }}>
                    {money(pendingPayroll.reduce((sum, run) => sum + run.net, 0))}
                  </Typography>
                </Box>
                <Box>
                  <Typography variant="body2" color="text.secondary">Gastos de Personal (contabilizado)</Typography>
                  <Typography sx={{ fontWeight: 700, mt: 0.5 }}>
                    {money(finance.entries.flatMap((e) => e.lines).filter((l) => l.accountCode === personalExpenseAccountCode).reduce((sum, l) => sum + l.debit, 0))}
                  </Typography>
                </Box>
              </Box>
            </Stack>
          </Paper>

          <Dialog open={payrollPaymentDialog} onClose={() => setPayrollPaymentDialog(false)} maxWidth="sm" fullWidth>
            <DialogTitle>Registrar Pago de Nóminas</DialogTitle>
            <form onSubmit={registerPayrollPayment}>
              <DialogContent sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
                <Box>
                  <Typography variant="subtitle2" sx={{ mb: 1 }}>
                    Nóminas seleccionadas: {payrollPaymentDraft.selectedRuns.length}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Total: {money(pendingPayroll.filter((r) => payrollPaymentDraft.selectedRuns.includes(r.id)).reduce((sum, r) => sum + r.net, 0))}
                  </Typography>
                </Box>
                <TextField
                  label="Fecha de pago"
                  type="date"
                  value={payrollPaymentDraft.paymentDate}
                  onChange={(event) => setPayrollPaymentDraft((current) => ({ ...current, paymentDate: event.target.value }))}
                  slotProps={{ inputLabel: { shrink: true } }}
                  required
                  fullWidth
                />
                <TextField
                  select
                  label="Banco / Cuenta de Pago"
                  value={payrollPaymentDraft.bankAccount}
                  onChange={(event) => setPayrollPaymentDraft((current) => ({ ...current, bankAccount: event.target.value }))}
                  required
                  fullWidth
                >
                  {bankAccounts.map((account) => (
                    <MenuItem key={account.code} value={account.code}>
                      {account.code} · {account.name}
                    </MenuItem>
                  ))}
                </TextField>
                <TextField
                  label="Referencia de pago (ej: Transferencia #12345)"
                  value={payrollPaymentDraft.reference}
                  onChange={(event) => setPayrollPaymentDraft((current) => ({ ...current, reference: event.target.value }))}
                  required
                  fullWidth
                />
                <TextField
                  label="Observaciones"
                  value={payrollPaymentDraft.observations}
                  onChange={(event) => setPayrollPaymentDraft((current) => ({ ...current, observations: event.target.value }))}
                  multiline
                  rows={3}
                  fullWidth
                />
              </DialogContent>
              <DialogActions>
                <Button onClick={() => setPayrollPaymentDialog(false)}>Cancelar</Button>
                <Button type="submit" variant="contained">Confirmar Pago</Button>
              </DialogActions>
            </form>
          </Dialog>
        </Stack>
      )}
    </Stack>
  );
}

function InvoiceTable({
  invoices,
  onPay,
  onPrint,
  canEdit,
}: {
  invoices: FinanceInvoice[];
  onPay: (id: string) => void;
  onPrint: (invoice: FinanceInvoice) => void;
  canEdit: boolean;
}) {
  if (invoices.length === 0) {
    return <Typography color="text.secondary">No hay documentos registrados en esta sección.</Typography>;
  }
  return (
    <Table size="small">
      <TableHead><TableRow>
        <TableCell>Documento</TableCell><TableCell>Contraparte</TableCell><TableCell>Emisión / vencimiento</TableCell>
        <TableCell>Moneda</TableCell><TableCell>OC / WBS</TableCell><TableCell align="right">Total CLP</TableCell>
        <TableCell>Estado</TableCell><TableCell>Acciones</TableCell>
      </TableRow></TableHead>
      <TableBody>{invoices.map((invoice) => (
        <TableRow key={invoice.id}>
          <TableCell>{invoice.documentType} {invoice.number}<Typography variant="caption" sx={{ display: "block" }}>{invoice.id}</Typography></TableCell>
          <TableCell>{invoice.counterparty}</TableCell>
          <TableCell>{invoice.issueDate}<Typography variant="caption" sx={{ display: "block" }}>Vence {invoice.dueDate}</Typography></TableCell>
          <TableCell>{invoice.currency} · TC {invoice.exchangeRate}</TableCell>
          <TableCell>{invoice.purchaseOrder ?? invoice.contract ?? "—"}<Typography variant="caption" sx={{ display: "block" }}>{invoice.wbs ?? ""}</Typography></TableCell>
          <TableCell align="right">{money(invoice.totalClp)}</TableCell>
          <TableCell><Chip size="small" label={invoice.status} color={invoice.status === "Pagada" ? "success" : invoice.status === "Borrador" ? "default" : "warning"} /></TableCell>
          <TableCell>
            <Button size="small" startIcon={<Print />} onClick={() => onPrint(invoice)}>Imprimir</Button>
            {canEdit && (invoice.status === "Contabilizada" || invoice.status === "Emitida (demo)") &&
              <Button size="small" onClick={() => onPay(invoice.id)}>{invoice.kind === "Compra" ? "Pagar" : "Cobrar"}</Button>}
          </TableCell>
        </TableRow>
      ))}</TableBody>
    </Table>
  );
}
