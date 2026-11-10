import { can } from "../app/permissions";
import type { OrderType } from "./docNumbering";
import { keys } from "./keys";
import { fail, ok } from "./result";
import type { Result } from "./result";
import { readJson, updateJson } from "./storage";
import type { Actor } from "./workOrders";

export type WbsElement = {
  code: string;
  type: OrderType;
  description: string;
  budget: number;
};

export type Contract = {
  code: string;
  customer: string;
  description: string;
  startDate?: string;
  endDate?: string;
  wbs: WbsElement[];
};

export type ApprovedBudget = {
  contract: string;
  category: string;
  amount: number;
  version: number;
  approvedBy: string;
  approvedAt: string;
};

export type EacSnapshot = {
  contract: string;
  period: string;
  category: string;
  real: number;
  etc: number;
  eac: number;
  savedAt: string;
  closed: boolean;
  closedBy?: string;
};

export const demoContract: Contract = {
  code: "CT1234",
  customer: "Fiat Chile",
  description: "Contrato ficticio de mantenimiento de flota",
  startDate: "2026-01-01",
  endDate: "2027-12-31",
  wbs: [
    { code: "CT1234-CL-B2N4-PRE", type: "PRE", description: "Mantenimiento preventivo", budget: 2500000 },
    { code: "CT1234-CL-B2N4-OVH", type: "OVH", description: "Overhaul", budget: 8000000 },
    { code: "CT1234-CL-B2N4-COR", type: "COR", description: "Correctivo", budget: 3500000 },
    { code: "CT1234-CL-B2N4-GAR", type: "GAR", description: "Garantías", budget: 1000000 },
    { code: "CT1234-CL-B2N4-REP", type: "REP", description: "Reparaciones", budget: 2000000 },
    { code: "CT1234-CL-B2N4-IND", type: "ESPERA", description: "Tiempo improductivo", budget: 0 },
  ],
};

// Presupuesto aprobado v1: una línea por elemento WBS con presupuesto, categorizada por su tipo.
export function approvedBudgetFromContract(contract: Contract, isoDate: string): ApprovedBudget[] {
  return contract.wbs
    .filter((element) => element.budget > 0)
    .map((element) => ({
      contract: contract.code,
      category: element.type,
      amount: element.budget,
      version: 1,
      approvedBy: "Administrador",
      approvedAt: isoDate,
    }));
}

// Sufijos WBS configurables por contrato (IND = tiempo improductivo).
export const wbsSuffixes = ["PRE", "OVH", "COR", "GAR", "REP", "IND"] as const;

// Contratos nuevos exigen vigencia completa y coherente (fin no anterior al inicio). Devuelve el error o null.
export function validateContractDates(startDate?: string, endDate?: string): string | null {
  const iso = /^\d{4}-\d{2}-\d{2}$/;
  if (!startDate || !endDate) return "Indica fecha de inicio y de fin del contrato.";
  if (!iso.test(startDate) || !iso.test(endDate)) return "Las fechas del contrato no son válidas.";
  if (endDate < startDate) return "La fecha de fin no puede ser anterior a la de inicio.";
  return null;
}

// ---- Clientes y contratos: única fuente keys.clients (solo este archivo la lee y escribe) ----
export type ClientWbs = { id: string; code: string; type: OrderType | "IND"; description: string };

export type ClientContract = {
  id: string;
  code: string;
  name: string;
  clientId: string;
  startDate: string;
  endDate: string;
  budget: number;
  wbs: ClientWbs[];
  createdAt: string;
};

export type ClientRecord = {
  id: string;
  code: string;
  name: string;
  sector: string;
  status: "Activo" | "Inactivo";
  rut?: string;
  contact?: { name: string; phone: string; email: string };
  contracts: ClientContract[];
  contractFileId?: string;
  contractFileName?: string;
  contractFileDate?: string;
  createdAt: string;
};

export type ContractFile = { id: string; clientId: string; fileName: string; fileData: string; uploadDate: string };

export function readClients(): ClientRecord[] {
  const list = readJson<unknown>(keys.clients, []);
  if (!Array.isArray(list)) return [];
  return list
    .filter((item): item is ClientRecord => typeof item === "object" && item !== null && typeof (item as ClientRecord).name === "string")
    .map((client) => ({ ...client, contracts: Array.isArray(client.contracts) ? client.contracts : [] }));
}

// Lee fresco, aplica fn y escribe; false si no se pudo guardar.
export function updateClients(fn: (clients: ClientRecord[]) => ClientRecord[]): boolean {
  return updateJson<ClientRecord[]>(keys.clients, [], (current) => fn(Array.isArray(current) ? current : [])) !== null;
}

const norm = (code: string): string => code.trim().toUpperCase();

// WBS sin código toman el valor por defecto `${contrato}-${tipo}` (único por contrato y apto para -GAR).
export function resolveWbs(contractCode: string, wbs: ClientWbs[]): ClientWbs[] {
  return wbs.map((element) => ({ ...element, code: element.code.trim() || `${contractCode.trim()}-${element.type}` }));
}

// Código de contrato y WBS únicos globales (incluye el contrato demo). Al editar se ignora el contrato con el mismo id.
export function validateContractUnique(clients: ClientRecord[], contract: ClientContract): string | null {
  const code = norm(contract.code);
  if (!code) return "El código de contrato es obligatorio.";
  const others: { code: string; wbs: string[] }[] = [
    { code: demoContract.code, wbs: demoContract.wbs.map((element) => element.code) },
    ...clients.flatMap((client) => client.contracts).filter((item) => item.id !== contract.id)
      .map((item) => ({ code: item.code, wbs: item.wbs.map((element) => element.code) })),
  ];
  if (others.some((item) => norm(item.code) === code)) return `El código de contrato ${contract.code} ya existe.`;
  const taken = new Set(others.flatMap((item) => item.wbs.map(norm)));
  const own = new Set<string>();
  for (const element of contract.wbs) {
    const wbs = norm(element.code);
    if (!wbs) return "Todos los WBS deben tener código.";
    if (own.has(wbs)) return `El WBS ${element.code} está repetido en el contrato.`;
    if (taken.has(wbs)) return `El WBS ${element.code} ya pertenece a otro contrato.`;
    if (element.type === "GAR" && !wbs.endsWith("-GAR")) return `El WBS de garantía ${element.code} debe terminar en -GAR.`;
    own.add(wbs);
  }
  return null;
}

// Crea o edita (mismo id) un contrato validando unicidad sobre datos frescos.
export function saveContract(clientId: string, input: ClientContract, actor: Actor): Result<ClientContract> {
  if (!can(actor.role, "client.edit")) return fail("Tu rol no tiene permiso para editar clientes.");
  const clients = readClients();
  if (!clients.some((client) => client.id === clientId)) return fail("El cliente ya no existe.");
  const contract = { ...input, clientId, wbs: resolveWbs(input.code, input.wbs) };
  const error = validateContractUnique(clients, contract);
  if (error) return fail(error);
  const saved = updateClients((list) => list.map((client) => client.id !== clientId ? client : {
    ...client,
    contracts: client.contracts.some((item) => item.id === contract.id)
      ? client.contracts.map((item) => item.id === contract.id ? contract : item)
      : [...client.contracts, contract],
  }));
  return saved ? ok(contract) : fail("No se pudo guardar el contrato (almacenamiento lleno o no disponible).");
}

type Tagged = { contract?: string; wbs?: string };

// Documentos que referencian contratos o WBS (OT, OC, solicitudes, facturas, planes de mantenimiento).
export function contractReferences(contracts: ClientContract[]): string[] {
  const codes = new Set(contracts.map((item) => norm(item.code)));
  const wbsCodes = new Set(contracts.flatMap((item) => item.wbs.map((element) => norm(element.code))));
  const finance = readJson<{ invoices?: Tagged[] } | null>(keys.financeState, null);
  const count = (list: unknown): number => (Array.isArray(list) ? (list as Tagged[]) : [])
    .filter((item) => (item.contract && codes.has(norm(item.contract))) || (item.wbs && wbsCodes.has(norm(item.wbs)))).length;
  const found: [string, number][] = [
    ["órdenes de trabajo", count(readJson<unknown>(keys.workOrders, []))],
    ["órdenes de compra", count(readJson<unknown>(keys.purchaseOrders, []))],
    ["solicitudes de compra", count(readJson<unknown>(keys.purchaseRequests, []))],
    ["facturas", count(finance?.invoices)],
    ["planes de mantenimiento", count(readJson<unknown>(keys.maintenancePlans, []))],
  ];
  return found.filter(([, amount]) => amount > 0).map(([label, amount]) => `${amount} ${label}`);
}

function blockedMessage(what: string, references: string[]): string {
  return `No se puede eliminar ${what}: tiene ${references.join(", ")} asociadas. Márcalo como Inactivo.`;
}

export function deleteContract(clientId: string, contractId: string, actor: Actor): Result {
  if (!can(actor.role, "client.edit")) return fail("Tu rol no tiene permiso para editar clientes.");
  const contract = readClients().find((client) => client.id === clientId)?.contracts.find((item) => item.id === contractId);
  if (!contract) return fail("El contrato ya no existe.");
  const references = contractReferences([contract]);
  if (references.length) return fail(blockedMessage(`el contrato ${contract.code}`, references));
  const saved = updateClients((list) => list.map((client) => client.id !== clientId ? client
    : { ...client, contracts: client.contracts.filter((item) => item.id !== contractId) }));
  return saved ? ok(undefined) : fail("No se pudo guardar el cambio (almacenamiento lleno o no disponible).");
}

export function deleteClient(clientId: string, actor: Actor): Result {
  if (!can(actor.role, "client.edit")) return fail("Tu rol no tiene permiso para editar clientes.");
  const client = readClients().find((item) => item.id === clientId);
  if (!client) return fail("El cliente ya no existe.");
  const references = contractReferences(client.contracts);
  if (references.length) return fail(blockedMessage(`el cliente ${client.name}`, references));
  const saved = updateClients((list) => list.filter((item) => item.id !== clientId));
  return saved ? ok(undefined) : fail("No se pudo guardar el cambio (almacenamiento lleno o no disponible).");
}

const toOrderType = (type: ClientWbs["type"]): OrderType => (type === "IND" ? "ESPERA" : type);

// Contratos en el modelo de data/ (WBS por código), con el contrato demo siempre presente.
export function readContracts(): Contract[] {
  const configured: Contract[] = readClients().flatMap((client) =>
    client.contracts.map((contract) => ({
      code: contract.code,
      customer: client.name,
      description: contract.name || `Contrato de servicio de ${client.name}`,
      startDate: contract.startDate || undefined,
      endDate: contract.endDate || undefined,
      wbs: contract.wbs.map((element) => ({
        code: element.code,
        type: toOrderType(element.type),
        description: element.description || `${contract.code} · ${element.type}`,
        budget: 0,
      })),
    })));
  return [...new Map<string, Contract>(
    [demoContract, ...configured.filter((contract) => contract.code !== demoContract.code)].map((contract): [string, Contract] => [contract.code, contract]),
  ).values()];
}

// Pares contrato/WBS para selectores de Compras, Contabilidad y Planificación.
export function readWbsChoices(): { contract: string; wbs: string }[] {
  return readContracts().flatMap((contract) => contract.wbs.map((element) => ({ contract: contract.code, wbs: element.code })));
}

export function readContractFiles(): Map<string, ContractFile> {
  const list = readJson<unknown>(keys.contractFiles, []);
  return new Map((Array.isArray(list) ? (list as ContractFile[]) : []).map((file) => [file.id, file]));
}

export function saveContractFile(file: ContractFile): boolean {
  return updateJson<ContractFile[]>(keys.contractFiles, [], (current) => [...current.filter((item) => item.id !== file.id), file]) !== null;
}
