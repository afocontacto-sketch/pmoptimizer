import { useState } from "react";
import type { FormEvent } from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  MenuItem,
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
import { can } from "../../app/permissions";
import type { Role } from "../../app/roles";
import { money } from "../../data/format";
import { isTransferRef, receivingTarget } from "../../data/stock";
import type { StockBin } from "../../data/stock";
import { useOperations } from "../../hooks/useOperations";
import type { Feedback } from "../../hooks/useOperations";
import { aggregateStockBins, isPickableLocation, makeMovement, receivePurchaseLine, releaseQualityLot } from "../operationsData";
import type { StockBinGroup } from "../operationsData";

export default function ReceivingTab({ user, role, setMessage, setError }: { user: string; role: Role } & Feedback) {
  const { stock, setStock, recordMovement } = useOperations();
  const [receipt, setReceipt] = useState({ code: "MAT-114", purchaseOrder: "", quantity: "1" });
  const [stockFilter, setStockFilter] = useState("");
  const [putawayLocations, setPutawayLocations] = useState<Record<string, string>>({});
  const canReceive = can(role, "warehouse.receivePO");
  const canPutaway = can(role, "warehouse.putaway");
  const canRelease = can(role, "quality.releaseStock");
  const transitLines = stock.filter((bin) => bin.status === "En tránsito" && bin.quantity > 0 && !isTransferRef(bin.reference));
  const selectedTransitLine = transitLines.find((bin) =>
    bin.reference === receipt.purchaseOrder && bin.code === receipt.code,
  ) ?? transitLines[0];
  const stockSearch = stockFilter.trim().toLowerCase();
  const visibleStock = aggregateStockBins(stock).filter((bin) =>
    !stockSearch ||
    `${bin.code} ${bin.name} ${bin.warehouse} ${bin.location} ${bin.status}`.toLowerCase().includes(stockSearch) ||
    bin.sourceBins.some((sourceBin) => (sourceBin.reference ?? "").toLowerCase().includes(stockSearch)),
  );

  const receivePurchase = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canReceive) {
      setError("Solo Almacén, Compras o Administrador puede registrar recepciones desde OC.");
      return;
    }
    const quantity = Number(receipt.quantity);
    if (!Number.isInteger(quantity) || quantity <= 0) {
      setError("La recepción debe tener una cantidad entera mayor a cero.");
      return;
    }
    const source = selectedTransitLine;
    if (!source) {
      setError("No hay una línea en tránsito para ese material y número de OC.");
      return;
    }
    if (quantity > source.quantity) {
      setError(`La recepción supera lo pendiente en ${receipt.purchaseOrder} (${source.quantity} ${source.unit}).`);
      return;
    }
    const target = receivingTarget(source.code);
    const newBin: StockBin = {
      ...source,
      id: `BIN-REC-${Date.now()}`,
      warehouse: "Bodega Central",
      ...target,
      quantity,
      reserved: 0,
    };
    const saved = receivePurchaseLine(source, quantity, newBin, makeMovement(
      "Recepción OC",
      source.code,
      quantity,
      `${source.warehouse}/${source.location}`,
      `${newBin.warehouse}/${newBin.location}`,
      source.reference ?? receipt.purchaseOrder,
      user,
    ));
    if (!saved) {
      setMessage("");
      setError("No se pudo guardar la recepción (almacenamiento lleno); no se aplicó ningún cambio.");
      return;
    }
    setError("");
    setMessage(`Recepción de ${source.reference ?? receipt.purchaseOrder} registrada: ${quantity} ${source.unit} de ${source.name}. Pendiente: ${source.quantity - quantity}. ${target.status === "Bloqueado calidad" ? "Quedó bloqueada para inspección de Calidad." : "Quedó en zona de recepción hasta asignar ubicación."}`);
  };

  const releaseQualityStock = (binId: string) => {
    const result = releaseQualityLot(binId, role, user);
    if (!result) return;
    if (result.ok) {
      setMessage(result.message);
      setError("");
    } else {
      setError(result.error);
    }
  };

  const putawayStock = (binId: string, requestedLocation?: string) => {
    if (!canPutaway) {
      setError("Tu rol no tiene permiso para ubicar materiales.");
      return;
    }
    const bin = stock.find((item) => item.id === binId);
    const location = (requestedLocation ?? putawayLocations[binId] ?? "").trim().toUpperCase();
    if (!bin || bin.status !== "Libre utilización" || bin.location !== "REC-UBICAR") {
      setError("Solo se pueden ubicar materiales liberados que estén en zona de recepción.");
      return;
    }
    if (!location || location === "REC-UBICAR" || location === "REC-CALIDAD" || location === "TRANSITO") {
      setError("Ingresa una ubicación definitiva válida, por ejemplo A-01-02.");
      return;
    }
    const destinationWarehouse = bin.warehouse === "Recepciones" ? "Bodega Central" : bin.warehouse;
    setStock((current) => current.map((item) => item.id === binId
      ? { ...item, warehouse: destinationWarehouse, location }
      : item));
    recordMovement(makeMovement(
      "Ubicación",
      bin.code,
      bin.quantity,
      `${bin.warehouse}/${bin.location}`,
      `${destinationWarehouse}/${location}`,
      bin.reference ?? bin.id,
      user,
    ));
    setPutawayLocations((current) => ({ ...current, [binId]: "" }));
    setMessage(`${bin.code} ubicado en ${destinationWarehouse}/${location}.`);
    setError("");
  };

  const putawayStockGroup = (group: StockBinGroup) => {
    const location = (putawayLocations[group.id] ?? "").trim().toUpperCase();
    if (!location || location === "REC-UBICAR" || location === "REC-CALIDAD" || location === "TRANSITO") {
      setError("Ingresa una ubicación definitiva válida, por ejemplo A-01-02.");
      return;
    }
    group.sourceBins.forEach((bin) => putawayStock(bin.id, location));
  };

  return (
    <Paper sx={{ p: 3 }}>
      <Stack spacing={2}>
        <Box>
          <Typography variant="h6">Recepción de OC y consulta de inventario</Typography>
          <Typography variant="body2" color="text.secondary">La recepción reduce el saldo en tránsito y lo mueve a Calidad o zona de ubicación, conservando el número de OC.</Typography>
        </Box>
        <Stack component="form" direction={{ xs: "column", lg: "row" }} spacing={1} onSubmit={receivePurchase}>
          <TextField select label="Orden de compra / tránsito" value={selectedTransitLine?.reference ?? ""} onChange={(event) => {
            const line = transitLines.find((bin) => bin.reference === event.target.value);
            setReceipt((current) => ({ ...current, purchaseOrder: event.target.value, code: line?.code ?? current.code }));
          }} disabled={!canReceive || transitLines.length === 0} sx={{ minWidth: 230 }}>
            {transitLines.map((bin) => <MenuItem key={`${bin.reference}-${bin.id}`} value={bin.reference}>{bin.reference} · {bin.code} · quedan {bin.quantity} {bin.unit}</MenuItem>)}
          </TextField>
          <TextField label="Material" value={selectedTransitLine?.name ?? receipt.code} slotProps={{ input: { readOnly: true } }} />
          <TextField label="Cantidad recibida" type="number" value={receipt.quantity} onChange={(event) => setReceipt((current) => ({ ...current, quantity: event.target.value }))} slotProps={{ htmlInput: { min: 1, max: selectedTransitLine?.quantity ?? 1, step: 1 } }} />
          <TextField label="Destino" value={selectedTransitLine && receivingTarget(selectedTransitLine.code).status === "Bloqueado calidad" ? "Bloqueado calidad (requiere inspección)" : "Libre utilización"} slotProps={{ input: { readOnly: true } }} />
          <Button type="submit" variant="contained" disabled={!canReceive || !selectedTransitLine}>Registrar recepción</Button>
        </Stack>
        {!canReceive && <Alert severity="info">La recepción desde OC está habilitada para Almacén, Compras y Administrador.</Alert>}
        <TextField label="Buscar por material, almacén, ubicación, estado u OC" value={stockFilter} onChange={(event) => setStockFilter(event.target.value)} />
        <Table size="small">
          <TableHead><TableRow><TableCell>Material / lote</TableCell><TableCell>Almacén / ubicación</TableCell><TableCell>Estado</TableCell><TableCell align="right">Físico</TableCell><TableCell align="right">Reservado</TableCell><TableCell align="right">Disponible</TableCell><TableCell align="right">Costo unit.</TableCell><TableCell>Acción</TableCell></TableRow></TableHead>
          <TableBody>{visibleStock.map((bin) => (
            <TableRow key={bin.id}>
              <TableCell>{bin.code} · {bin.name}<Typography variant="caption" sx={{ display: "block" }}>{bin.sourceBins.length > 1 ? `${bin.sourceBins.length} registros acumulados` : bin.reference ?? bin.id}</Typography></TableCell>
              <TableCell>{bin.warehouse} · {bin.location}</TableCell>
              <TableCell><Chip size="small" label={bin.status} color={bin.status === "Libre utilización" ? "success" : bin.status === "Bloqueado calidad" ? "warning" : "info"} /></TableCell>
              <TableCell align="right">{bin.quantity} {bin.unit}</TableCell>
              <TableCell align="right">{bin.reserved} {bin.unit}</TableCell>
              <TableCell align="right">{bin.status === "Libre utilización" && isPickableLocation(bin.location) ? bin.quantity - bin.reserved : 0} {bin.unit}</TableCell>
              <TableCell align="right">{money(bin.unitCost)}</TableCell>
              <TableCell>
                {bin.status === "Bloqueado calidad" && canRelease
                  ? <Button size="small" onClick={() => bin.sourceBins.forEach((sourceBin) => releaseQualityStock(sourceBin.id))}>Liberar QC</Button>
                  : bin.status === "Libre utilización" && bin.location === "REC-UBICAR" && canPutaway
                    ? <Stack direction="row" spacing={1}><TextField size="small" label="Ubicación" value={putawayLocations[bin.id] ?? ""} onChange={(event) => setPutawayLocations((current) => ({ ...current, [bin.id]: event.target.value }))} /><Button size="small" onClick={() => putawayStockGroup(bin)}>Ubicar</Button></Stack>
                    : "—"}
              </TableCell>
            </TableRow>
          ))}</TableBody>
        </Table>
        {visibleStock.length === 0 && <Alert severity="info">No hay ubicaciones que coincidan con la búsqueda.</Alert>}
      </Stack>
    </Paper>
  );
}
