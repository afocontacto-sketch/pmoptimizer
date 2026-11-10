import { beforeEach, describe, expect, test } from "vitest";
import { can } from "../src/app/permissions";
import { readClients, readContracts, readWbsChoices, updateClients } from "../src/data/contracts";
import type { ClientRecord } from "../src/data/contracts";
import { resetDemoData } from "../src/data/backup";
import { keys } from "../src/data/keys";
import { readContracts as productionContracts } from "../src/modules/operationsData";
import { requestCostAssignment } from "../src/modules/supplyData";
import { installStorage, store } from "./helpers/storageMock";

beforeEach(() => installStorage());

const newClient = (): ClientRecord => ({
  id: "CLI-1", code: "CLI-000001", name: "Cliente Nuevo", sector: "Minería", status: "Activo", createdAt: "2026-01-01",
  contractFileName: "contrato.pdf",
  contracts: [{
    id: "CTR-1", code: "CT9000", name: "Servicio mina", clientId: "CLI-1", startDate: "2026-01-01", endDate: "2026-12-31", budget: 1000,
    createdAt: "2026-01-01",
    wbs: [
      { id: "W1", code: "CT9000-CL-PRE", type: "PRE", description: "Preventivo" },
      { id: "W2", code: "CT9000-CL-IND", type: "IND", description: "Improductivo" },
    ],
  }],
});

describe("clientes unificados", () => {
  test("el seed usa solo keys.clients, con CT1234 y sin clients-v2", () => {
    expect(resetDemoData("Administrador").ok).toBe(true);
    expect([...store.keys()].some((key) => key.includes("clients-v2"))).toBe(false);
    expect(readClients().some((client) => client.contracts.some((contract) => contract.code === "CT1234"))).toBe(true);
    expect(readContracts().find((contract) => contract.code === "CT1234")?.wbs.length).toBe(6);
  });

  test("un contrato creado en Clientes aparece en readContracts y sus WBS llegan a Compras y Producción", () => {
    expect(updateClients((list) => [...list, newClient()])).toBe(true);
    expect(store.has(keys.clients)).toBe(true);
    const contract = readContracts().find((item) => item.code === "CT9000");
    expect(contract?.customer).toBe("Cliente Nuevo");
    expect(contract?.startDate).toBe("2026-01-01");
    expect(contract?.wbs.map((element) => element.type)).toEqual(["PRE", "ESPERA"]);
    expect(readWbsChoices()).toContainEqual({ contract: "CT9000", wbs: "CT9000-CL-PRE" });
    expect(productionContracts().some((item) => item.code === "CT9000")).toBe(true);
    expect(readClients()[0].contractFileName).toBe("contrato.pdf");
  });
});

describe("permisos y solicitudes", () => {
  test("Almacén no crea SP; Compras sí; WBS desde el plan de la llamada", () => {
    expect(can("Almacén", "purchase.createRequest")).toBe(false);
    expect(can("Compras", "purchase.createRequest")).toBe(true);
    expect(requestCostAssignment({ callIds: ["L1"] }, [{ id: "L1", plan: { contract: "CT1234", wbs: "CT1234-CL-B2N4-PRE" } }]))
      .toEqual({ contract: "CT1234", wbs: "CT1234-CL-B2N4-PRE" });
  });

  test("route.edit y plan.edit se validan por rol", () => {
    expect(can("Planificador", "plan.edit")).toBe(true);
    expect(can("Planificador", "route.edit")).toBe(false);
    expect(can("Supervisor", "plan.edit")).toBe(false);
  });
});
