import { beforeEach, describe, expect, test } from "vitest";
import { payslipDoc } from "../src/components/print/templates/payslipDoc";
import type { AuditRecord } from "../src/data/audit";
import { keys } from "../src/data/keys";
import { defaultAccounts, emptyFinanceState } from "../src/modules/financeData";
import type { FinanceState, JournalEntry } from "../src/modules/financeData";
import type { PayrollLine, PayrollRun } from "../src/modules/HumanResourcesPage";
import { recalculatePayrollRun } from "../src/modules/payrollRecalc";
import { installStorage, readStore, store } from "./helpers/storageMock";

const line = (gross: number): PayrollLine => ({ employeeId: "E1", employee: "Ana", gross, deductions: gross / 5, net: gross * 0.8, allocations: [] });
const entryOf = (run: PayrollRun): JournalEntry => ({
  id: `ASI-${run.gross}`, date: `${run.period}-01`, description: `Devengo de remuneraciones ${run.period}`, sourceId: run.id,
  lines: [
    { accountCode: "510301", accountName: "Gasto", debit: run.gross, credit: 0 },
    { accountCode: "210301", accountName: "Por pagar", debit: 0, credit: run.net },
    { accountCode: "210302", accountName: "Descuentos", debit: 0, credit: run.deductions },
  ],
});
const actor = { user: "conta", role: "Contabilidad" as const };
const makeRun = (status: PayrollRun["status"]): PayrollRun => ({ id: "NOM-1", period: "2026-11", createdAt: "", status, lines: [line(1000)], gross: 1000, deductions: 200, net: 800 });

function seed(status: PayrollRun["status"]) {
  const run = makeRun(status);
  store.set(keys.payrollRuns, JSON.stringify([run]));
  store.set(keys.financeState, JSON.stringify({ ...emptyFinanceState, accounts: defaultAccounts, entries: [entryOf(run)] }));
}

beforeEach(installStorage);

describe("recalculatePayrollRun", () => {
  test("revierte el devengo, crea uno nuevo y deja audit", () => {
    seed("Pendiente de pago");
    const result = recalculatePayrollRun("NOM-1", [line(2000)], actor, (run) => entryOf(run));
    expect(result.ok).toBe(true);
    expect(readStore<PayrollRun[]>(keys.payrollRuns, [])[0]).toMatchObject({ gross: 2000, net: 1600 });
    const entries = readStore<FinanceState>(keys.financeState, emptyFinanceState).entries;
    expect(entries).toHaveLength(3);
    expect(entries[1].sourceId).toBe("NOM-1");
    expect(entries[1].lines[0]).toMatchObject({ debit: 0, credit: 1000 });
    expect(entries[2].lines[0].debit).toBe(2000);
    const net = entries.flatMap((e) => e.lines).reduce((sum, l) => sum + l.debit - l.credit, 0);
    expect(net).toBe(0);
    expect(readStore<AuditRecord[]>(keys.auditLog, [])[0]).toMatchObject({ entity: "payroll", action: "recalculate", before: { net: 800 }, after: { net: 1600 } });
  });

  test("no recalcula liquidaciones pagadas ni sin permiso", () => {
    seed("Pagada");
    expect(recalculatePayrollRun("NOM-1", [line(2000)], actor, entryOf).ok).toBe(false);
    seed("Pendiente de pago");
    expect(recalculatePayrollRun("NOM-1", [line(2000)], { user: "x", role: "Supervisor" }, entryOf).ok).toBe(false);
    expect(readStore<FinanceState>(keys.financeState, emptyFinanceState).entries).toHaveLength(1);
  });
});

describe("payslipDoc", () => {
  test("incluye líquido y trabajador", () => {
    const doc = payslipDoc({ period: "2026-11", status: "Pendiente de pago", employer: "Demo", employeeName: "Ana", employeeId: "E1", gross: 1000, deductions: 200, net: 800 });
    expect(doc.title).toBe("Liquidación de sueldo");
    expect(doc.bodyHtml).toContain("Líquido a pago");
  });
});
