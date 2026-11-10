import { keys } from "./keys";
import { readJson, updateJson } from "./storage";

export type AuditEntity = "material" | "order" | "payroll" | "budget" | "eac";

export type AuditRecord = {
  id: string;
  date: string;
  user: string;
  role: string;
  entity: AuditEntity;
  entityId: string;
  action: string;
  before?: unknown;
  after?: unknown;
  reason?: string;
};

export function readAudit(): AuditRecord[] {
  return readJson<AuditRecord[]>(keys.auditLog, []);
}

export function appendAudit(record: Omit<AuditRecord, "id" | "date">): boolean {
  const entry: AuditRecord = {
    ...record,
    id: `AUD-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
    date: new Date().toISOString(),
  };
  return updateJson<AuditRecord[]>(keys.auditLog, [], (current) => [...current, entry]) !== null;
}
