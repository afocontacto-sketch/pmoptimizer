import { useState } from "react";
import type { ChangeEvent } from "react";
import {
  Alert,
  Box,
  Button,
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
import { Add, Download } from "@mui/icons-material";
import { can } from "../../app/permissions";
import type { Role } from "../../app/roles";
import { KpiCard } from "../../components/KpiCard";
import { downloadCsv as downloadCsvRows, downloadTemplate } from "../../data/csv";
import { money } from "../../data/format";
import { printDocument } from "../../components/print/printDocument";
import { pickingDoc } from "../../components/print/templates/pickingDoc";
import { isPickableLocation, pickLine } from "../../data/stock";
import type { StockBin } from "../../data/stock";
import type { OrderLine } from "../../data/workOrders";
import { useOperations } from "../../hooks/useOperations";
import type { Feedback } from "../../hooks/useOperations";
import type { WorkOrder } from "../operationsData";

type PickRow = { line: OrderLine; pending: number; bin: StockBin | undefined; suggested: number };

type Props = {
  user: string;
  role: Role;
  importWarehouseCsv: (event: ChangeEvent<HTMLInputElement>) => void;
  importMessage: string;
  importError: string;
} & Feedback;

export default function PickingTab({ user, role, setMessage, setError, importWarehouseCsv, importMessage: warehouseImportMessage, importError: warehouseImportError }: Props) {
  const { orders, stock } = useOperations();
  const [selectedWarehouseOrderId, setSelectedWarehouseOrderId] = useState("");
  const [pickingTaken, setPickingTaken] = useState<Record<string, string>>({});
  const canChangePicking = can(role, "warehouse.pick");
  const availableOrders = orders.filter((order) => order.type !== "ESPERA" && order.status !== "Cerrada");
  const transitLines = stock.filter((bin) => bin.status === "En tránsito" && bin.quantity > 0);
  const physicalBins = stock.filter((bin) => bin.status !== "En tránsito");
  const pendingPutawayBins = stock.filter((bin) =>
    bin.status === "Libre utilización" && bin.location === "REC-UBICAR",
  );
  const availableMaterials = new Set(stock
    .filter((bin) => bin.status === "Libre utilización" && isPickableLocation(bin.location) && bin.quantity > bin.reserved)
    .map((bin) => bin.code)).size;
  const qualityLots = stock.filter((bin) => bin.status === "Bloqueado calidad" && bin.quantity > 0).length;
  const openPurchaseOrders = new Set(transitLines.map((bin) => bin.reference)).size;
  const physicalInventoryValue = physicalBins.reduce((sum, bin) => sum + bin.quantity * bin.unitCost, 0);

  const pendingOrders = availableOrders.filter((order) => order.materials.some((line) => line.required - line.picked > 0));
  const selectedWarehouseOrder = pendingOrders.find((order) => order.id === selectedWarehouseOrderId);
  // Una fila por línea pendiente y bin libre sugerido (ubicación ascendente); la cantidad sugerida cubre el pendiente.
  const pickRowsFor = (order: WorkOrder): PickRow[] => order.materials.flatMap((line): PickRow[] => {
    const pending = Math.max(0, line.required - line.picked);
    if (pending <= 0) return [];
    let needed = pending;
    const bins = stock
      .filter((bin) => bin.code === line.code && bin.status === "Libre utilización" && isPickableLocation(bin.location) && bin.quantity > 0)
      .sort((a, b) => a.location.localeCompare(b.location, undefined, { numeric: true }));
    if (!bins.length) return [{ line, pending, bin: undefined, suggested: 0 }];
    return bins.map((bin) => {
      const suggested = Math.min(needed, bin.quantity);
      needed -= suggested;
      return { line, pending, bin, suggested };
    });
  });
  const warehousePickRows = selectedWarehouseOrder ? pickRowsFor(selectedWarehouseOrder) : [];
  const exportPicking = (order: WorkOrder) => {
    downloadCsvRows(`picking_${order.id}.csv`,
      ["Orden", "Material", "Código", "Ubicación sugerida", "Pendiente", "Cantidad sugerida"],
      warehousePickRows.map((item) => [
        order.id,
        item.line.name ?? item.line.code,
        item.line.code,
        item.bin ? `${item.bin.warehouse}/${item.bin.location}` : "Sin stock libre",
        item.pending,
        item.suggested,
      ]));
  };

  const takeLine = (order: WorkOrder, code: string, binId: string, rawQty: string) => {
    const result = pickLine({ orderId: order.id, code, binId, qty: Number(rawQty) }, { user, role });
    if (!result.ok) {
      setMessage("");
      setError(result.error);
      return;
    }
    setPickingTaken((current) => Object.fromEntries(Object.entries(current).filter(([key]) => key !== `${order.id}:${binId}`)));
    const pendingLeft = result.value.materials.reduce((sum, line) => sum + Math.max(0, line.required - line.picked), 0);
    setMessage(`Picking registrado en ${order.id}: ${result.value.pickingStatus}${pendingLeft ? "" : "; la OT sale de la lista de picking"}.`);
    setError("");
  };

  const exportWarehouseTemplate = () => downloadTemplate("plantilla_almacen.csv",
    ["code", "name", "warehouse", "location", "status", "quantity", "unit", "unitCost", "reference"],
    ["MAT-114", "Cinta aislante 3M", "Bodega Central", "A-01-02", "Libre utilización", 10, "rollo", 3500, ""]);

  return (
    <Paper sx={{ p: 3 }}>
      <Stack direction={{ xs: "column", md: "row" }} sx={{ justifyContent: "space-between", alignItems: { xs: "flex-start", md: "center" }, gap: 2, mb: 2 }}>
        <Box>
          <Typography variant="h6">Picking por OT · secuencia de ubicación</Typography>
          <Typography variant="body2" color="text.secondary">Cada toma descuenta el stock libre y se carga de inmediato al costo de la OT/WBS; puedes pickear parcialmente.</Typography>
        </Box>
        <Stack direction="row" sx={{ flexWrap: "wrap", gap: 1 }}>
          <Button startIcon={<Download />} onClick={exportWarehouseTemplate}>Plantilla CSV</Button>
          {role === "Administrador" && <Button component="label" variant="outlined" startIcon={<Add />}>
            Importar saldos
            <input hidden type="file" accept=".csv,text/csv" onChange={importWarehouseCsv} />
          </Button>}
        </Stack>
      </Stack>
      {warehouseImportMessage && <Alert severity="success" sx={{ mb: 2 }}>{warehouseImportMessage}</Alert>}
      {warehouseImportError && <Alert severity="error" sx={{ mb: 2 }}>{warehouseImportError}</Alert>}
      <Grid container spacing={2} sx={{ mb: 2 }}>
        {[
          { label: "Materiales disponibles", value: `${availableMaterials} códigos` },
          { label: "Lotes en inspección QC", value: `${qualityLots} lotes` },
          { label: "Órdenes de compra en tránsito", value: `${openPurchaseOrders} OC` },
          { label: "Pendiente de ubicación", value: `${pendingPutawayBins.length} lotes` },
          { label: "Valorización física demo", value: money(physicalInventoryValue) },
        ].map((item) => (
          <Grid size={{ xs: 12, sm: 6, lg: 3 }} key={item.label}>
            <KpiCard outlined label={item.label} value={item.value} />
          </Grid>
        ))}
      </Grid>
      <Paper variant="outlined" sx={{ mb: 2 }}>
        <Table size="small">
          <TableHead><TableRow><TableCell>OT</TableCell><TableCell>Equipo / contrato</TableCell><TableCell>Componentes</TableCell><TableCell>Estado picking</TableCell><TableCell /></TableRow></TableHead>
          <TableBody>{pendingOrders.map((order) => (
            <TableRow key={order.id} selected={selectedWarehouseOrder?.id === order.id}>
              <TableCell>{order.id}</TableCell><TableCell>{order.equipment}<Typography variant="caption" sx={{ display: "block" }}>{order.contract} / {order.wbs}</Typography></TableCell>
              <TableCell>{order.materials.filter((line) => line.required - line.picked > 0).length} con pendiente</TableCell><TableCell>{order.pickingStatus}</TableCell>
              <TableCell><Button size="small" onClick={() => setSelectedWarehouseOrderId(order.id)}>Abrir picking</Button></TableCell>
            </TableRow>
          ))}</TableBody>
        </Table>
        {pendingOrders.length === 0 && <Alert severity="info">No hay OT con materiales pendientes de picking.</Alert>}
      </Paper>
      {selectedWarehouseOrder && (
        <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
          <Stack direction={{ xs: "column", sm: "row" }} sx={{ justifyContent: "space-between", alignItems: { sm: "center" }, gap: 1, mb: 1 }}>
            <Box><Typography variant="h6">Picking · {selectedWarehouseOrder.id}</Typography><Typography variant="caption" color="text.secondary">{selectedWarehouseOrder.equipment} · {selectedWarehouseOrder.contract} / {selectedWarehouseOrder.wbs}</Typography></Box>
            <Stack direction="row" spacing={1}>
              <Button onClick={() => exportPicking(selectedWarehouseOrder)}>Exportar CSV</Button>
              <Button onClick={() => { void printDocument({ ...pickingDoc(selectedWarehouseOrder, stock), user }); }}>Imprimir hoja</Button>
            </Stack>
          </Stack>
          <Table size="small">
            <TableHead><TableRow><TableCell>Ubicación</TableCell><TableCell>Material</TableCell><TableCell align="right">Pendiente</TableCell><TableCell align="right">Stock en ubicación</TableCell><TableCell>Cantidad a tomar</TableCell><TableCell /></TableRow></TableHead>
            <TableBody>{warehousePickRows.map((item) => {
              const rowKey = `${selectedWarehouseOrder.id}:${item.bin?.id ?? item.line.code}`;
              const qty = pickingTaken[rowKey] ?? String(item.suggested);
              return (
                <TableRow key={rowKey}>
                  <TableCell>{item.bin ? `${item.bin.warehouse}/${item.bin.location}` : "Sin stock libre"}</TableCell>
                  <TableCell>{item.line.code} · {item.line.name}</TableCell>
                  <TableCell align="right">{item.pending} {item.line.unit}</TableCell>
                  <TableCell align="right">{item.bin ? `${item.bin.quantity} ${item.bin.unit}` : "—"}</TableCell>
                  <TableCell><TextField size="small" type="number" value={qty} disabled={!item.bin || !canChangePicking} onChange={(event) => setPickingTaken((current) => ({ ...current, [rowKey]: event.target.value }))} slotProps={{ htmlInput: { min: 0, max: item.bin ? Math.min(item.pending, item.bin.quantity) : 0, step: "any" } }} sx={{ width: 130 }} /></TableCell>
                  <TableCell>{item.bin && role !== "Supervisor" && <Button size="small" variant="contained" disabled={!canChangePicking} onClick={() => takeLine(selectedWarehouseOrder, item.line.code, item.bin!.id, qty)}>Tomar</Button>}</TableCell>
                </TableRow>
              );
            })}</TableBody>
          </Table>
        </Paper>
      )}
      <Alert severity="info">La zona REC-UBICAR no se considera disponible para picking hasta que se asigne un pasillo/estante. El stock en inspección o tránsito tampoco se puede retirar.</Alert>
    </Paper>
  );
}
