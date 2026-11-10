import { keys } from "../data/keys";
import { can } from "../app/permissions";
import type { Role } from "../app/roles";
import MaterialsMaster from "./materials/MaterialsMaster";
import StockTab from "./warehouse/StockTab";
import FutureCallsTab from "./supply/FutureCallsTab";
import MaterialForecastTab from "./supply/MaterialForecastTab";
import SupplyDashboard from "./supply/SupplyDashboard";
import { nextDocNumber } from "../data/docNumbering";
import { updateJson } from "../data/storage";
import { printDocument } from "../components/print/printDocument";
import { materialDemandDoc } from "../components/print/templates/materialDemandDoc";
import { useMemo, useState } from "react";
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Chip,
  Grid,
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
import { Add, Inventory2 } from "@mui/icons-material";
import {
  readPlannedCalls,
  routeStorageKey,
} from "./maintenanceData";
import type { RouteTemplate } from "./maintenanceData";
import {
  purchaseOrdersStorageKey,
  purchaseRequestsStorageKey,
  readStoredList,
  requestCostAssignment,
} from "./supplyData";
import type { PurchaseOrder, PurchaseRequest } from "./supplyData";

type StockBin = {
  code: string;
  name: string;
  unit: string;
  status: string;
  quantity: number;
  reserved?: number;
  location?: string;
  reference?: string;
};

type PlannedCall = {
  id: string;
  plan: { name: string; equipmentId: string; contract: string; wbs: string };
  routeId: string;
  dueDate: string;
};

type MaterialOption = { code: string; name: string; unit: string };
type DemandRow = {
  callId: string;
  callIds: string[];
  date: string;
  plan: string;
  equipment: string;
  contract: string;
  quantity: number;
  unit: string;
  before: number;
  receipts: number;
  balance: number;
  shortage: number;
};


const stockStorageKey = keys.warehouseBins;
const demoStock: StockBin[] = [
  { code: "MAT-114", name: "Cinta aislante 3M", unit: "rollo", status: "Libre utilización", quantity: 9 },
  { code: "MAT-114", name: "Cinta aislante 3M", unit: "rollo", status: "Bloqueado calidad", quantity: 5 },
  { code: "MAT-114", name: "Cinta aislante 3M", unit: "rollo", status: "En tránsito", quantity: 12 },
  { code: "MAT-422", name: "Rodamiento SKF 6205", unit: "unidad", status: "Libre utilización", quantity: 54 },
  { code: "MAT-301", name: "Motor eléctrico 7.5HP", unit: "unidad", status: "Libre utilización", quantity: 18 },
];

function readCalls(): PlannedCall[] {
  return readPlannedCalls();
}

function readStock(): StockBin[] {
  const rows = readStoredList<StockBin>(stockStorageKey);
  return rows.length ? rows : demoStock;
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat("es-CL").format(date) : value;
}

export default function SupplyPage({ user, role }: { user: string; role: Role }) {
  const [tab, setTab] = useState(0);
  const [calls] = useState(readCalls);
  const [stock] = useState(readStock);
  const [routes] = useState(() => readStoredList<RouteTemplate>(routeStorageKey));
  const [purchaseOrders] = useState<PurchaseOrder[]>(() =>
    readStoredList<PurchaseOrder>(purchaseOrdersStorageKey));
  const [purchaseRequests, setPurchaseRequests] = useState<PurchaseRequest[]>(() =>
    readStoredList<PurchaseRequest>(purchaseRequestsStorageKey));
  const [selectedMaterial, setSelectedMaterial] = useState<MaterialOption | null>(null);
  const [error, setError] = useState("");

  const routeById = useMemo(
    () => new Map<string, RouteTemplate>(routes.map((route): [string, RouteTemplate] => [route.id, route])),
    [routes],
  );

  const materials = useMemo(() => {
    const catalog = new Map<string, MaterialOption>();
    for (const bin of stock) {
      if (bin.code && bin.name) catalog.set(bin.code, { code: bin.code, name: bin.name, unit: bin.unit || "unidad" });
    }
    for (const route of routes) {
      for (const operation of route.operations) {
        for (const material of operation.materials) {
          if (!catalog.has(material.code)) catalog.set(material.code, { code: material.code, name: material.name, unit: material.unit });
        }
      }
    }
    return [...catalog.values()].sort((a, b) => a.code.localeCompare(b.code));
  }, [routes, stock]);

  const selectedStock = useMemo(() => {
    if (!selectedMaterial) return { available: 0, blocked: 0, transit: 0, transitWithoutLinkedOrder: 0 };
    return stock.reduce((totals, bin) => {
      if (bin.code !== selectedMaterial.code) return totals;
      const quantity = Math.max(0, bin.quantity);
      if (bin.status === "En tránsito") {
        totals.transit += quantity;
        if (!purchaseOrders.some((order) => order.id === bin.reference)) totals.transitWithoutLinkedOrder += quantity;
      }
      else if (bin.status === "Bloqueado calidad") totals.blocked += quantity;
      else if (bin.status === "Libre utilización" &&
        !["REC-UBICAR", "REC-CALIDAD", "TRANSITO"].includes((bin.location ?? "").toUpperCase())) {
        totals.available += Math.max(0, quantity - (bin.reserved ?? 0));
      }
      return totals;
    }, { available: 0, blocked: 0, transit: 0, transitWithoutLinkedOrder: 0 });
  }, [purchaseOrders, selectedMaterial, stock]);

  const demandRows = useMemo(() => {
    if (!selectedMaterial) return [];
    const rawDemands = calls.flatMap((call) => {
      const route = routeById.get(call.routeId);
      if (!route) return [];
      const quantity = route.operations.flatMap((operation) => operation.materials)
        .filter((material) => material.code === selectedMaterial.code)
        .reduce((sum, material) => sum + material.quantity, 0);
      return quantity > 0 ? [{
        callId: call.id,
        callIds: [call.id],
        date: call.dueDate,
        plan: call.plan.name,
        equipment: call.plan.equipmentId,
        contract: call.plan.contract,
        quantity,
        unit: selectedMaterial.unit,
      }] : [];
    });
    const byDate = new Map<string, (typeof rawDemands)[number]>();
    for (const demand of rawDemands) {
      const current = byDate.get(demand.date);
      if (current) {
        current.quantity += demand.quantity;
        current.callIds.push(demand.callId);
        current.callId = current.callIds.join(", ");
      } else {
        byDate.set(demand.date, { ...demand });
      }
    }
    const demands = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date) || a.callId.localeCompare(b.callId));
    const receipts = purchaseOrders
      .filter((order) => order.materialCode === selectedMaterial.code && order.status === "Aprobada")
      .sort((a, b) => a.expectedDate.localeCompare(b.expectedDate));
    let balance = selectedStock.available;
    let receiptIndex = 0;
    return demands.map((demand) => {
      let received = 0;
      while (receiptIndex < receipts.length && receipts[receiptIndex].expectedDate <= demand.date) {
        const remainingQuantity = Math.max(0, receipts[receiptIndex].quantity - (receipts[receiptIndex].receivedQuantity ?? 0));
        received += remainingQuantity;
        balance += remainingQuantity;
        receiptIndex += 1;
      }
      const before = balance;
      balance -= demand.quantity;
      return { ...demand, before, receipts: received, balance, shortage: Math.max(0, -balance) };
    });
  }, [calls, purchaseOrders, routeById, selectedMaterial, selectedStock.available]);

  const requestForDate = (row: DemandRow) => purchaseRequests.find((request) =>
    request.materialCode === selectedMaterial?.code &&
    request.needDate === row.date.slice(0, 10) &&
    request.status !== "Cerrada");

  const pendingRequestCoverage = (row: DemandRow) => purchaseRequests
    .filter((request) => request.materialCode === selectedMaterial?.code &&
      request.needDate <= row.date.slice(0, 10) &&
      request.status !== "Cerrada")
    .reduce((sum, request) => {
      const order = purchaseOrders.find((item) => item.id === request.purchaseOrderId);
      if (!order || order.status === "Rechazada") return sum + request.quantity;
      return sum + Math.max(0, request.quantity - (order.receivedQuantity ?? 0));
    }, selectedStock.transitWithoutLinkedOrder);

  const createRequest = (row: DemandRow) => {
    if (!can(role, "purchase.createRequest")) {
      setError("Tu rol no puede crear solicitudes de pedido.");
      return;
    }
    const quantity = Math.max(0, row.shortage - purchaseRequests
      .filter((request) => request.materialCode === selectedMaterial?.code &&
        request.needDate <= row.date.slice(0, 10) &&
        request.status !== "Cerrada")
      .reduce((sum, request) => {
        const order = purchaseOrders.find((item) => item.id === request.purchaseOrderId);
        if (!order || order.status === "Rechazada") return sum + request.quantity;
        return sum + Math.max(0, request.quantity - (order.receivedQuantity ?? 0));
      }, selectedStock.transitWithoutLinkedOrder));
    if (!selectedMaterial || quantity <= 0) return;
    let requestId: string;
    try {
      requestId = nextDocNumber("21", (candidate) => purchaseRequests.some((item) => item.id === candidate));
    } catch (numberError) {
      setError(numberError instanceof Error ? numberError.message : "No se pudo numerar la solicitud.");
      return;
    }
    const costAssignment = requestCostAssignment({ callIds: row.callIds }, calls);
    const request: PurchaseRequest = {
      id: requestId,
      materialCode: selectedMaterial.code,
      materialName: selectedMaterial.name,
      unit: selectedMaterial.unit,
      quantity,
      needDate: row.date.slice(0, 10),
      callIds: row.callIds,
      status: "Pendiente cotización",
      createdBy: user,
      ...(costAssignment ? { contract: costAssignment.contract, wbs: costAssignment.wbs } : {}),
    };
const next = updateJson<PurchaseRequest[]>(purchaseRequestsStorageKey, [], (current) => [...current, request]);    if (!next) {      setError("No se pudo guardar la solicitud en este navegador.");      return;    }    setPurchaseRequests(next);    setError("");
  };


const printDemand = () => {    if (!selectedMaterial) return;    printDocument({ ...materialDemandDoc(selectedMaterial, demandRows), user }).catch((printError: unknown) => {      setError(printError instanceof Error ? printError.message : "No se pudo preparar la impresión.");    });  };
  const callsCount = new Set(demandRows.flatMap((row) => row.callIds)).size;
  const totalDemand = demandRows.reduce((sum, row) => sum + row.quantity, 0);
  const stockout = demandRows.find((row) => row.shortage > 0);

  return (
    <Stack spacing={3}>
      <Box>
        <Typography variant="h4" sx={{ fontWeight: 700 }}>Supply · MRP de mantenimiento</Typography>
        <Typography color="text.secondary">
          Consulta un material, ordena las llamadas por fecha y simula el saldo disponible descontando cada necesidad planificada.
        </Typography>
      </Box>
      <Tabs value={tab} onChange={(_, value: number) => setTab(value)} variant="scrollable">
        <Tab label="Consulta" /><Tab label="Forecast de materiales" /><Tab label="Parámetros" /><Tab label="Llamadas futuras" /><Tab label="Dashboards" />
      </Tabs>
      {tab === 1 && <MaterialForecastTab />}
      {tab === 2 && <MaterialsMaster mode={can(role, "material.editParams") ? "params" : "readonly"} user={user} role={role} title="Parámetros de reposición" />}
      {tab === 3 && <FutureCallsTab />}
      {tab === 4 && <SupplyDashboard />}
      {tab === 0 && (<>
      {error && <Alert severity="error">{error}</Alert>}
      {calls.length === 0 && (
        <Alert severity="info">Aún no hay llamadas proyectadas. Configura y libera un plan en Planning para alimentar el MRP.</Alert>
      )}
      <Paper sx={{ p: 3 }}>
        <Autocomplete
          options={materials}
          value={selectedMaterial}
          onChange={(_, value) => setSelectedMaterial(value)}
          getOptionLabel={(item) => `${item.code} · ${item.name}`}
          isOptionEqualToValue={(option, value) => option.code === value.code}
          renderInput={(params) => <TextField {...params} label="Buscar código o descripción de material" placeholder="Ej.: MAT-422" />}
        />
      </Paper>
      {selectedMaterial && (
        <>
          <Grid container spacing={2}>
            {[
              { label: "Stock libre disponible", value: `${selectedStock.available} ${selectedMaterial.unit}` },
              { label: "Bloqueado por calidad", value: `${selectedStock.blocked} ${selectedMaterial.unit}` },
              { label: "En tránsito", value: `${selectedStock.transit} ${selectedMaterial.unit}` },
              { label: "Llamadas / demanda", value: `${callsCount} / ${totalDemand} ${selectedMaterial.unit}` },
            ].map((item) => (
              <Grid size={{ xs: 12, sm: 6, md: 3 }} key={item.label}>
                <Paper sx={{ p: 2 }}>
                  <Typography variant="body2" color="text.secondary">{item.label}</Typography>
                  <Typography variant="h6" sx={{ mt: 1, fontWeight: 700 }}>{item.value}</Typography>
                </Paper>
              </Grid>
            ))}
          </Grid>
          {stockout && (
            <Alert severity="warning" icon={<Inventory2 />}>
              El saldo proyectado queda bajo cero por primera vez el {formatDate(stockout.date)}. Revisa las solicitudes/órdenes de compra y genera la solicitud de pedido faltante.
            </Alert>
          )}
          <Paper sx={{ p: 3, maxHeight: 480, overflow: "auto" }}>
            <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "center", mb: 2 }}>
              <Typography variant="h6">{selectedMaterial.code} · llamadas y saldo proyectado</Typography>
              <Button size="small" variant="outlined" disabled={demandRows.length === 0} onClick={() => printDemand()}>Imprimir / Guardar PDF</Button>
            </Stack>
            {demandRows.length === 0 ? (
              <Typography color="text.secondary">No hay llamadas que requieran este material en el horizonte de planificación.</Typography>
            ) : (
              <Table size="small" stickyHeader>
                <TableHead>
                  <TableRow>
                    <TableCell>Fecha</TableCell><TableCell>Llamada / plan / equipo</TableCell>
                    <TableCell>Contrato</TableCell><TableCell align="right">Demanda</TableCell>
                    <TableCell align="right">Saldo previo</TableCell><TableCell align="right">OC recibida</TableCell>
                    <TableCell align="right">Saldo restante</TableCell><TableCell>Acción</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {demandRows.map((row) => {
                    const existingRequest = requestForDate(row);
                    return (
                      <TableRow key={`${row.callId}-${row.date}`}>
                        <TableCell>{formatDate(row.date)}</TableCell>
                        <TableCell>{row.callId}<Typography variant="caption" sx={{ display: "block" }}>{row.plan} · {row.equipment}</Typography></TableCell>
                        <TableCell>{row.contract || "—"}</TableCell>
                        <TableCell align="right">{row.quantity} {row.unit}</TableCell>
                        <TableCell align="right">{row.before} {row.unit}</TableCell>
                        <TableCell align="right">{row.receipts ? `${row.receipts} ${row.unit}` : "—"}</TableCell>
                        <TableCell align="right">
                          <Chip size="small" color={row.balance < 0 ? "error" : "success"} label={`${row.balance} ${row.unit}`} />
                        </TableCell>
                        <TableCell>
                          {row.shortage > 0 && (row.shortage <= pendingRequestCoverage(row)
                            ? <Chip size="small" label={existingRequest ? `${existingRequest.id} · ${existingRequest.status}` : "Solicitud en curso"} />
                            : <Button size="small" startIcon={<Add />} onClick={() => createRequest(row)}>Crear solicitud ({row.shortage - pendingRequestCoverage(row)})</Button>)}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </Paper>
        </>
      )}
      <Alert severity="info">
        El saldo proyectado descuenta stock libre y OC aprobadas según fecha de entrega. El tránsito sin fecha confirmada se muestra aparte, no reduce el saldo y evita duplicar solicitudes por la cantidad ya comprada; material bloqueado por Calidad no está disponible.
      </Alert>
      <StockTab />
      </>)}
    </Stack>
  );
}
