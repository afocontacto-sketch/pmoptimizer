import { useState } from "react";
import type { ChangeEvent } from "react";
import { Alert, Box, Paper, Stack, Tab, Tabs, Typography } from "@mui/material";
import { can } from "../../app/permissions";
import type { Role } from "../../app/roles";
import { parseCsvRow } from "../../data/csv";
import type { StockBin, StockStatus } from "../../data/stock";
import { useFeedback, useOperations } from "../../hooks/useOperations";
import { makeMovement } from "../operationsData";
import KardexTab from "./KardexTab";
import PickingTab from "./PickingTab";
import ReceivingTab from "./ReceivingTab";
import DispatchBoardTab from "./DispatchBoardTab";
import StockTab from "./StockTab";
import TransfersTab from "./TransfersTab";
import WarehouseDashboardTab from "./WarehouseDashboardTab";

export default function WarehousePage({ user, role }: { user: string; role: Role }) {
  const { stock, setStock, recordMovement } = useOperations();
  const { message, error, setMessage, setError } = useFeedback();
  const isSupervisor = role === "Supervisor";
  const canOperate = can(role, "warehouse.pick") || can(role, "warehouse.receivePO") || can(role, "warehouse.putaway");
  const tabs = [
    { id: "dashboard", label: "Panel" },
    ...(canOperate ? [{ id: "picking", label: "Picking y recepción" }] : []),
    { id: "stock", label: "Consulta de stock" },
    { id: "transfers", label: "Traspasos" },
    { id: "board", label: "Pantalla 3 días" },
    ...(!isSupervisor ? [{ id: "kardex", label: "Kardex y conteos" }] : []),
  ];
  const [selectedTab, setTab] = useState("dashboard");
  const tab = tabs.some((item) => item.id === selectedTab) ? selectedTab : tabs[0].id;
  const [warehouseImportMessage, setWarehouseImportMessage] = useState("");
  const [warehouseImportError, setWarehouseImportError] = useState("");
  const feedback = { user, role, setMessage, setError };

  const importWarehouseCsv = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    setWarehouseImportError("");
    setWarehouseImportMessage("");
    if (!file) return;
    if (role !== "Administrador") {
      setWarehouseImportError("Solo el Administrador puede realizar cargas masivas de saldos iniciales.");
      return;
    }
    try {
      const lines = (await file.text()).replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => line.trim());
      if (lines.length < 2) throw new Error("El archivo CSV no contiene saldos para importar.");
      const headers = parseCsvRow(lines[0]).map((value) => value.trim());
      const requiredHeaders = ["code", "name", "warehouse", "location", "status", "quantity", "unit", "unitCost"];
      const indexes = new Map(headers.map((header, index) => [header, index]));
      const missing = requiredHeaders.filter((header) => !indexes.has(header));
      if (missing.length) throw new Error(`Faltan columnas requeridas: ${missing.join(", ")}.`);
      const imported = lines.slice(1).map((line, index): StockBin => {
        const values = parseCsvRow(line);
        const get = (key: string) => values[indexes.get(key) ?? -1]?.trim() ?? "";
        const status = get("status") as StockStatus;
        const quantity = Number(get("quantity"));
        const unitCost = Number(get("unitCost"));
        if (!get("code") || !get("name") || !get("warehouse") || !get("location") || !get("unit")) {
          throw new Error(`Fila ${index + 2}: falta completar material, almacén, ubicación o unidad.`);
        }
        if (!["Libre utilización", "Bloqueado calidad", "En tránsito"].includes(status)) {
          throw new Error(`Fila ${index + 2}: estado no válido "${get("status")}".`);
        }
        if (!Number.isInteger(quantity) || quantity < 0 || !Number.isFinite(unitCost) || unitCost < 0) {
          throw new Error(`Fila ${index + 2}: cantidad o costo unitario no válido.`);
        }
        if (!get("quantity") || !get("unitCost")) {
          throw new Error(`Fila ${index + 2}: cantidad y costo unitario son obligatorios.`);
        }
        if (status === "En tránsito" && !get("reference")) {
          throw new Error(`Fila ${index + 2}: el stock en tránsito debe indicar el número de OC en la columna reference.`);
        }
        if (get("location").toUpperCase() === "TRANSITO" && status !== "En tránsito") {
          throw new Error(`Fila ${index + 2}: TRANSITO solo es válido para stock En tránsito.`);
        }
        if (get("location").toUpperCase() === "REC-CALIDAD" && status !== "Bloqueado calidad") {
          throw new Error(`Fila ${index + 2}: REC-CALIDAD requiere estado Bloqueado calidad.`);
        }
        return {
          id: `BIN-IMP-${Date.now()}-${index}`,
          code: get("code"),
          name: get("name"),
          warehouse: get("warehouse"),
          location: get("location"),
          status,
          quantity,
          reserved: 0,
          unit: get("unit"),
          unitCost,
          reference: get("reference") || undefined,
        };
      });
      const locationKeys = new Set(stock.map((bin) => `${bin.code}|${bin.warehouse}|${bin.location}|${bin.status}`));
      for (const [index, bin] of imported.entries()) {
        const key = `${bin.code}|${bin.warehouse}|${bin.location}|${bin.status}`;
        if (locationKeys.has(key)) {
          throw new Error(`Fila ${index + 2}: ya existe saldo para ${bin.code} en ${bin.warehouse}/${bin.location} (${bin.status}). Usa recepción, traslado o conteo para actualizarlo.`);
        }
        locationKeys.add(key);
      }
      setStock((current) => [...current, ...imported]);
      imported.forEach((bin) => recordMovement(makeMovement(
        "Ajuste inventario",
        bin.code,
        bin.quantity,
        "Importación",
        `${bin.warehouse}/${bin.location}`,
        file.name,
        user,
      )));
      setWarehouseImportMessage(`${imported.length} ubicaciones importadas. Se registraron como saldos iniciales en el kardex.`);
    } catch (cause) {
      setWarehouseImportError(cause instanceof Error ? cause.message : "No se pudo importar el archivo CSV.");
    }
  };

  return (
    <Stack spacing={3}>
      <Box>
        <Typography variant="h4" sx={{ fontWeight: 700 }}>Almacén y logística</Typography>
        <Typography color="text.secondary">Demostración con datos ficticios del contrato CT1234.</Typography>
      </Box>
      <Alert severity="warning">
        Prototipo local: estos datos de prueba se guardan en este navegador. Costos, roles, permisos e inventario requieren validación de backend antes de producción.
      </Alert>
      {message && <Alert severity="success">{message}</Alert>}
      {error && <Alert severity="error">{error}</Alert>}

      <Paper sx={{ px: 2 }}>
        <Tabs value={tab} onChange={(_, value: string) => setTab(value)} variant="scrollable" allowScrollButtonsMobile>
          {tabs.map((item) => <Tab key={item.id} value={item.id} label={item.label} />)}
        </Tabs>
      </Paper>

      {tab === "dashboard" && <WarehouseDashboardTab />}
      {tab === "stock" && <StockTab />}
      {tab === "transfers" && <TransfersTab {...feedback} />}
      {tab === "board" && <DispatchBoardTab />}
      {tab === "picking" && (
        <Stack spacing={3}>
          <PickingTab {...feedback} importWarehouseCsv={importWarehouseCsv} importMessage={warehouseImportMessage} importError={warehouseImportError} />
          <ReceivingTab {...feedback} />
        </Stack>
      )}
      {tab === "kardex" && <KardexTab {...feedback} importWarehouseCsv={importWarehouseCsv} />}
    </Stack>
  );
}
