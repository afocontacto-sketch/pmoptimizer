import { useMemo, useState } from "react";
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Checkbox,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  Grid,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import { Add, Inventory2, Download, Print } from "@mui/icons-material";
import {
  maintenanceCallsStorageKey,
  routeStorageKey,
} from "./maintenanceData";
import type { RouteTemplate, RouteOperation } from "./maintenanceData";
import {
  makeSupplyId,
  purchaseOrdersStorageKey,
  purchaseRequestsStorageKey,
  readStoredList,
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

type PickingItem = {
  code: string;
  name: string;
  quantity: number;
  unit: string;
  location: string;
  available: number;
  pickedQuantity?: number;
  toQuality?: boolean;
};

type PickingSession = {
  id: string;
  orderId: string;
  orderName: string;
  materials: PickingItem[];
  status: "En picking" | "Completado";
  createdAt: string;
  completedAt?: string;
};

type StockMovement = {
  id: string;
  date: string;
  type: "Reserva picking" | "Liberación picking" | "Liberación de calidad" | "Consumo OT" | "Bloqueado calidad";
  code: string;
  quantity: number;
  from: string;
  to: string;
  reference: string;
  user: string;
};

const stockStorageKey = "pmoptimizer-warehouse-bins";
const demoStock: StockBin[] = [
  { code: "MAT-114", name: "Cinta aislante 3M", unit: "rollo", status: "Libre utilización", quantity: 9 },
  { code: "MAT-114", name: "Cinta aislante 3M", unit: "rollo", status: "Bloqueado calidad", quantity: 5 },
  { code: "MAT-114", name: "Cinta aislante 3M", unit: "rollo", status: "En tránsito", quantity: 12 },
  { code: "MAT-422", name: "Rodamiento SKF 6205", unit: "unidad", status: "Libre utilización", quantity: 54 },
  { code: "MAT-301", name: "Motor eléctrico 7.5HP", unit: "unidad", status: "Libre utilización", quantity: 18 },
];

function readCalls(): PlannedCall[] {
  return readStoredList<PlannedCall>(maintenanceCallsStorageKey);
}

function readStock(): StockBin[] {
  const rows = readStoredList<StockBin>(stockStorageKey);
  return rows.length ? rows : demoStock;
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat("es-CL").format(date) : value;
}

export default function SupplyPage() {
  const [calls] = useState(readCalls);
  const [stock] = useState(readStock);
  const [routes] = useState(() => readStoredList<RouteTemplate>(routeStorageKey));
  const [purchaseOrders] = useState<PurchaseOrder[]>(() =>
    readStoredList<PurchaseOrder>(purchaseOrdersStorageKey));
  const [purchaseRequests, setPurchaseRequests] = useState<PurchaseRequest[]>(() =>
    readStoredList<PurchaseRequest>(purchaseRequestsStorageKey));
  const [selectedMaterial, setSelectedMaterial] = useState<MaterialOption | null>(null);
  const [error, setError] = useState("");
  const [pickingSessions, setPickingSessions] = useState<PickingSession[]>(() =>
    readStoredList<PickingSession>("pmoptimizer-warehouse-picking"));
  const [openPickingDialog, setOpenPickingDialog] = useState(false);
  const [currentPickingOrder, setCurrentPickingOrder] = useState<string | null>(null);
  const [currentPickingMaterials, setCurrentPickingMaterials] = useState<PickingItem[]>([]);
  const [stockMovements, setStockMovements] = useState<StockMovement[]>(() =>
    readStoredList<StockMovement>("pmoptimizer-stock-movements"));

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
    const request: PurchaseRequest = {
      id: makeSupplyId("SC"),
      materialCode: selectedMaterial.code,
      materialName: selectedMaterial.name,
      unit: selectedMaterial.unit,
      quantity,
      needDate: row.date.slice(0, 10),
      callIds: row.callIds,
      status: "Pendiente cotización",
    };
    const next = [...purchaseRequests, request];
    try {
      localStorage.setItem(purchaseRequestsStorageKey, JSON.stringify(next));
      setPurchaseRequests(next);
      setError("");
    } catch (writeError) {
      console.error("No se pudo guardar la solicitud de compra.", writeError);
      setError("No se pudo guardar la solicitud en este navegador.");
    }
  };

  const getAvailableStock = (materialCode: string): number => {
    return stock.reduce((total, bin) => {
      if (bin.code !== materialCode || bin.status !== "Libre utilización") return total;
      return total + Math.max(0, (bin.quantity || 0) - (bin.reserved ?? 0));
    }, 0);
  };

  const getMaterialLocation = (materialCode: string): string => {
    const bin = stock.find((b) => b.code === materialCode && b.status === "Libre utilización");
    return bin?.location || "Almacén general";
  };

  const openPickingForOrder = (orderId: string, materials: PickingItem[]) => {
    setCurrentPickingOrder(orderId);
    setCurrentPickingMaterials(materials);
    setOpenPickingDialog(true);
  };

  const savePicking = () => {
    if (!currentPickingOrder) return;
    
    const updatedMaterials = currentPickingMaterials.map((material) => ({
      ...material,
      pickedQuantity: material.pickedQuantity || 0,
    }));

    const session: PickingSession = {
      id: makeSupplyId("PK"),
      orderId: currentPickingOrder,
      orderName: currentPickingMaterials.length > 0 ? currentPickingMaterials[0].name : "OT",
      materials: updatedMaterials,
      status: "En picking",
      createdAt: new Date().toISOString(),
    };

    const newMovements = updatedMaterials.flatMap((material) => {
      const movements: StockMovement[] = [];
      if (material.pickedQuantity && material.pickedQuantity > 0) {
        movements.push({
          id: makeSupplyId("MOV"),
          date: new Date().toISOString(),
          type: "Reserva picking",
          code: material.code,
          quantity: material.pickedQuantity,
          from: "Libre utilización",
          to: "Reserva picking",
          reference: currentPickingOrder,
          user: "Sistema",
        });
      }
      if (material.toQuality && material.pickedQuantity && material.pickedQuantity > 0) {
        movements.push({
          id: makeSupplyId("MOV"),
          date: new Date().toISOString(),
          type: "Bloqueado calidad",
          code: material.code,
          quantity: material.pickedQuantity,
          from: "Reserva picking",
          to: "Bloqueado calidad",
          reference: currentPickingOrder,
          user: "Sistema",
        });
      }
      return movements;
    });

    const newPickingSessions = [...pickingSessions, session];
    const newStockMovements = [...stockMovements, ...newMovements];

    try {
      localStorage.setItem("pmoptimizer-warehouse-picking", JSON.stringify(newPickingSessions));
      localStorage.setItem("pmoptimizer-stock-movements", JSON.stringify(newStockMovements));
      setPickingSessions(newPickingSessions);
      setStockMovements(newStockMovements);
      setOpenPickingDialog(false);
      setCurrentPickingOrder(null);
      setCurrentPickingMaterials([]);
      setError("");
    } catch (writeError) {
      console.error("No se pudo guardar el picking.", writeError);
      setError("No se pudo guardar el picking en este navegador.");
    }
  };

  const exportPickingToCSV = (materials: PickingItem[]) => {
    const csv = ["Código,Descripción,Cantidad requerida,Unidad,Ubicación,Stock disponible"].concat(
      materials.map((m) => `${m.code},${m.name},${m.quantity},${m.unit},${m.location},${m.available}`),
    ).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `picking-${new Date().getTime()}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const printPicking = (materials: PickingItem[]) => {
    const printWindow = window.open("", "", "width=800,height=600");
    if (!printWindow) return;
    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Picking List</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 20px; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; }
            th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
            th { background-color: #f2f2f2; font-weight: bold; }
            h1 { color: #333; }
          </style>
        </head>
        <body>
          <h1>Picking List</h1>
          <table>
            <tr><th>Código</th><th>Descripción</th><th>Cantidad</th><th>Unidad</th><th>Ubicación</th><th>Stock</th></tr>
            ${materials.map((m) => `<tr><td>${m.code}</td><td>${m.name}</td><td>${m.quantity}</td><td>${m.unit}</td><td>${m.location}</td><td>${m.available}</td></tr>`).join("")}
          </table>
        </body>
      </html>
    `;
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.print();
  };

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
            <Typography variant="h6" sx={{ mb: 2 }}>{selectedMaterial.code} · llamadas y saldo proyectado</Typography>
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
      <Paper sx={{ p: 3 }}>
        <Typography variant="h6" sx={{ mb: 2 }}>Órdenes de Trabajo · Picking</Typography>
        {calls.length === 0 ? (
          <Typography color="text.secondary">No hay órdenes de trabajo disponibles.</Typography>
        ) : (
          <Stack spacing={2}>
            {calls.map((call) => {
              const route = routeById.get(call.routeId);
              if (!route) return null;
              const pickingMaterials: PickingItem[] = route.operations.flatMap((op: RouteOperation) =>
                op.materials.map((mat) => ({
                  code: mat.code,
                  name: mat.name,
                  quantity: mat.quantity,
                  unit: mat.unit,
                  location: getMaterialLocation(mat.code),
                  available: getAvailableStock(mat.code),
                })),
              );
              return (
                <Paper key={call.id} sx={{ p: 2, bgcolor: "background.default" }}>
                  <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <Box>
                      <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                        {call.id} · {route.name}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {call.plan.equipmentId} · {formatDate(call.dueDate)}
                      </Typography>
                    </Box>
                    <Stack direction="row" spacing={1}>
                      <Button size="small" variant="outlined" startIcon={<Print />} onClick={() => printPicking(pickingMaterials)}>
                        Imprimir
                      </Button>
                      <Button size="small" variant="outlined" startIcon={<Download />} onClick={() => exportPickingToCSV(pickingMaterials)}>
                        Exportar CSV
                      </Button>
                      <Button size="small" variant="contained" onClick={() => openPickingForOrder(call.id, pickingMaterials)}>
                        Trabajar en PC
                      </Button>
                    </Stack>
                  </Box>
                </Paper>
              );
            })}
          </Stack>
        )}
      </Paper>
      <Dialog open={openPickingDialog} onClose={() => setOpenPickingDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Formulario de Picking</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            {currentPickingMaterials.map((material, idx) => (
              <Paper key={idx} sx={{ p: 2, bgcolor: "background.default" }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                  {material.code} · {material.name}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Ubicación: {material.location} | Stock: {material.available} {material.unit}
                </Typography>
                <TextField
                  fullWidth
                  size="small"
                  label="Cantidad tomada"
                  type="number"
                  value={material.pickedQuantity || ""}
                  onChange={(e) => {
                    const updated = [...currentPickingMaterials];
                    updated[idx].pickedQuantity = parseInt(e.target.value) || 0;
                    setCurrentPickingMaterials(updated);
                  }}
                  sx={{ mt: 1 }}
                  slotProps={{ htmlInput: { min: 0, max: material.available } }}
                />
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={material.toQuality || false}
                      onChange={(e) => {
                        const updated = [...currentPickingMaterials];
                        updated[idx].toQuality = e.target.checked;
                        setCurrentPickingMaterials(updated);
                      }}
                    />
                  }
                  label="Traspasar a calidad"
                  sx={{ mt: 1 }}
                />
              </Paper>
            ))}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenPickingDialog(false)}>Cancelar</Button>
          <Button onClick={savePicking} variant="contained">
            Guardar Picking
          </Button>
        </DialogActions>
      </Dialog>
      <Alert severity="info">
        El saldo proyectado descuenta stock libre y OC aprobadas según fecha de entrega. El tránsito sin fecha confirmada se muestra aparte, no reduce el saldo y evita duplicar solicitudes por la cantidad ya comprada; material bloqueado por Calidad no está disponible.
      </Alert>
    </Stack>
  );
}
