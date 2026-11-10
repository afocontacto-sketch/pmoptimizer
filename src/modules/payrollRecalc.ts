import { can } from "../app/permissions";
import { appendAudit } from "../data/audit";
import { fail, ok } from "../data/result";
import type { Result } from "../data/result";
import { keys } from "../data/keys";
import { readJson, runAtomic, writeJson } from "../data/storage";
import { makeFinanceId, readFinanceState, saveFinanceState } from "./financeData";
import type { FinanceAccount, JournalEntry } from "./financeData";
import type { PayrollLine, PayrollRun } from "./HumanResourcesPage";
import type { Role } from "../app/roles";

export type RecalcActor = { user: string; role: Role };

const total = (lines: PayrollLine[], pick: (line: PayrollLine) => number) => lines.reduce((sum, line) => sum + pick(line), 0);

// Asiento de reverso: mismas cuentas con debe y haber invertidos, enlazado a la misma liquidación (sourceId).
export function reverseEntry(entry: JournalEntry, description: string): JournalEntry {
  return {
    id: makeFinanceId("REV"),
    date: entry.date,
    description,
    sourceId: entry.sourceId,
    lines: entry.lines.map((line) => ({ ...line, debit: line.credit, credit: line.debit })),
  };
}

// Recalcula una liquidación "Pendiente de pago": reemplaza líneas, revierte el devengo vigente y contabiliza uno nuevo.
export function recalculatePayrollRun(
  runId: string,
  lines: PayrollLine[],
  actor: RecalcActor,
  makeEntry: (run: PayrollRun, accounts: FinanceAccount[]) => JournalEntry,
): Result<PayrollRun> {
  if (!can(actor.role, "payroll.recalculate")) return fail("Solo Contabilidad o Administrador puede recalcular liquidaciones.");
  const runs = readJson<PayrollRun[]>(keys.payrollRuns, []);
  const run = runs.find((item) => item.id === runId);
  if (!run) return fail("La liquidación no existe.");
  if (run.status !== "Pendiente de pago") return fail("Solo se puede recalcular una liquidación en estado Pendiente de pago.");
  const finance = readFinanceState();
  const previous = [...finance.entries].reverse().find((entry) => entry.sourceId === runId && entry.description.startsWith("Devengo"));
  if (!previous) return fail("No se encontró el asiento de devengo de la liquidación.");
  const updated: PayrollRun = {
    ...run,
    lines,
    gross: total(lines, (line) => line.gross),
    deductions: total(lines, (line) => line.deductions),
    net: total(lines, (line) => line.net),
  };
  let created: JournalEntry;
  try {
    created = makeEntry(updated, finance.accounts);
  } catch (error) {
    return fail(error instanceof Error ? error.message : "No se pudo generar el asiento nuevo.");
  }
  created = { ...created, date: previous.date, description: `Devengo de remuneraciones ${run.period} (recalculado)` };
  const reversal = reverseEntry(previous, `Reverso de devengo de remuneraciones ${run.period}`);
  const saved = runAtomic([keys.payrollRuns, keys.financeState, keys.auditLog], [
    () => writeJson(keys.payrollRuns, runs.map((item) => item.id === runId ? updated : item)),
    () => saveFinanceState({ ...finance, entries: [...finance.entries, reversal, created] }),
    () => appendAudit({
      user: actor.user, role: actor.role, entity: "payroll", entityId: runId, action: "recalculate",
      before: { gross: run.gross, deductions: run.deductions, net: run.net },
      after: { gross: updated.gross, deductions: updated.deductions, net: updated.net },
    }),
  ]);
  return saved ? ok(updated) : fail("No se pudo guardar el recálculo de la liquidación.");
}
