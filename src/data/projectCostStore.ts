import { can } from "../app/permissions";
import type { Actor } from "./workOrders";
import { appendAudit } from "./audit";
import type { ApprovedBudget, EacSnapshot } from "./contracts";
import { keys } from "./keys";
import { mergeSnapshots, nextBudgetVersions, periodOf, snapshotsFromRows } from "./projectCost";
import type { BudgetLineInput, EacRow } from "./projectCost";
import { fail, ok } from "./result";
import type { Result } from "./result";
import { readJson, runAtomic, updateJson } from "./storage";

// Persistencia de PM-07 (separada de projectCost.ts, que es puro).
export const readApprovedBudgets = (): ApprovedBudget[] => readJson<ApprovedBudget[]>(keys.approvedBudget, []);
export const readEacSnapshots = (): EacSnapshot[] => readJson<EacSnapshot[]>(keys.eacSnapshots, []);

const saveFailed = "No se pudo guardar el cambio (almacenamiento lleno o no disponible).";

// Crea una versión nueva por cada categoría que cambió, con auditoría (before/after).
export function saveBudgetVersion(
  contract: string,
  lines: BudgetLineInput[],
  actor: Actor,
  now: Date = new Date(),
): Result<ApprovedBudget[]> {
  if (!can(actor.role, "budget.approve")) return fail("Solo PM Proyecto o Administrador puede aprobar presupuestos.");
  if (lines.some((line) => !Number.isFinite(line.amount) || line.amount < 0)) return fail("Los montos deben ser números no negativos.");
  const current = readApprovedBudgets();
  const created = nextBudgetVersions(current, contract, lines, actor.user, now.toISOString());
  if (created.length === 0) return fail("No hay cambios respecto de la última versión aprobada.");
  const saved = runAtomic([keys.approvedBudget, keys.auditLog], [
    () => updateJson<ApprovedBudget[]>(keys.approvedBudget, [], (list) => [...list, ...created]) !== null,
    () => appendAudit({
      user: actor.user, role: actor.role, entity: "budget", entityId: contract, action: "newVersion",
      before: current.filter((item) => item.contract === contract), after: created,
    }),
  ]);
  return saved ? ok(created) : fail(saveFailed);
}

// Snapshot provisional del mes en curso: solo si no existe. Devuelve true si guardó algo nuevo.
export function saveProvisionalSnapshots(rows: EacRow[], period: string, now: Date = new Date()): boolean {
  const fresh = snapshotsFromRows(rows, period, now.toISOString());
  const before = readEacSnapshots();
  const merged = mergeSnapshots(before, fresh, true);
  if (merged.length === before.length) return false;
  return updateJson<EacSnapshot[]>(keys.eacSnapshots, [], (list) => mergeSnapshots(list, fresh, true)) !== null;
}

// Cierra el período: guarda snapshots closed=true y deja de recalcularse. Audit del cierre.
export function closeMonth(rows: EacRow[], period: string, actor: Actor, now: Date = new Date()): Result<EacSnapshot[]> {
  if (!can(actor.role, "eac.closeMonth")) return fail("Solo PM Proyecto o Administrador puede cerrar el mes.");
  if (!/^[0-9]{4}-(0[1-9]|1[0-2])$/.test(period) || period > periodOf(now.getFullYear(), now.getMonth() + 1)) {
    return fail("Solo se puede cerrar el mes actual o meses anteriores.");
  }
  const fresh = snapshotsFromRows(rows, period, now.toISOString(), actor.user);
  if (fresh.length === 0) return fail("No hay contratos para cerrar.");
  const before = readEacSnapshots();
  const alreadyClosed = fresh.every((item) => before.some((old) => old.closed
    && old.contract === item.contract && old.period === item.period && old.category === item.category));
  if (alreadyClosed) return fail(`El período ${period} ya está cerrado.`);
  const saved = runAtomic([keys.eacSnapshots, keys.auditLog], [
    () => updateJson<EacSnapshot[]>(keys.eacSnapshots, [], (list) => {
      const keyOf = (item: EacSnapshot) => `${item.contract}|${item.period}|${item.category}`;
      const closedKeys = new Set(list.filter((item) => item.closed).map(keyOf));
      return [...list.filter((item) => !fresh.some((n) => keyOf(n) === keyOf(item)) || closedKeys.has(keyOf(item))),
        ...fresh.filter((item) => !closedKeys.has(keyOf(item)))];
    }) !== null,
    () => appendAudit({
      user: actor.user, role: actor.role, entity: "eac", entityId: period, action: "closeMonth",
      after: { period, contracts: [...new Set(fresh.map((item) => item.contract))] },
    }),
  ]);
  return saved ? ok(fresh) : fail(saveFailed);
}
