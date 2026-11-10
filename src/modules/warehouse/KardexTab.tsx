import { useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import {
  Alert,
  Box,
  Button,
  Divider,
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
import { manualTransfer } from "../../data/stock";
import { useOperations } from "../../hooks/useOperations";
import type { Feedback } from "../../hooks/useOperations";
import { isPickableLocation, makeMovement } from "../operationsData";

export default function KardexTab({ user, role, setMessage, setError, importWarehouseCsv }: {
  user: string;
  role: Role;
  importWarehouseCsv: (event: ChangeEvent<HTMLInputElement>) => void;
} & Feedback) {
  const { stock, movements, setStock, recordMovement } = useOperations();
  const [cycleCount, setCycleCount] = useState({ binId: "", countedQuantity: "" });
  const [transfer, setTransfer] = useState({ binId: "", quantity: "1", warehouse: "Bodega Taller", location: "A-01-01", toQuality: false });
  const canTransfer = can(role, "warehouse.transfer");
  const canImportStock = can(role, "warehouse.import");
  const canCount = can(role, "warehouse.count");
  const countableBins = stock.filter((bin) => bin.status !== "En tránsito");
  const transferableBins = stock.filter((bin) =>
    bin.status === "Libre utilización" && isPickableLocation(bin.location) && bin.quantity > bin.reserved,
  );

  const performCycleCount = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canCount) {
      setError("Tu rol no tiene permiso para registrar conteos de inventario.");
      return;
    }
    const bin = stock.find((item) => item.id === (cycleCount.binId || countableBins[0]?.id));
    const counted = Number(cycleCount.countedQuantity);
    if (!bin || bin.status === "En tránsito" || !Number.isInteger(counted) || counted < 0) {
      setError("Selecciona una ubicación física e ingresa una cantidad contada válida (entero igual o mayor que cero).");
      return;
    }
    const delta = counted - bin.quantity;
    if (delta === 0) {
      setMessage(`Conteo sin diferencia para ${bin.code} en ${bin.warehouse}/${bin.location}.`);
      setError("");
      return;
    }
    if (counted < bin.reserved) {
      setError(`El conteo no puede quedar bajo las ${bin.reserved} unidades reservadas.`);
      return;
    }
    setStock((current) => current.map((item) => item.id === bin.id ? { ...item, quantity: counted } : item));
    recordMovement(makeMovement(
      "Ajuste inventario",
      bin.code,
      Math.abs(delta),
      delta < 0 ? `${bin.warehouse}/${bin.location}` : "Conteo físico",
      delta > 0 ? `${bin.warehouse}/${bin.location}` : "Diferencia de inventario",
      `Conteo ${new Date().toLocaleDateString("es-CL")}`,
      user,
    ));
    setCycleCount((current) => ({ ...current, countedQuantity: "" }));
    setMessage(`Conteo ajustado para ${bin.code}: ${delta > 0 ? "+" : ""}${delta} ${bin.unit}.`);
    setError("");
  };

  const performTransfer = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canTransfer) {
      setError("Tu rol no tiene permiso para trasladar stock.");
      return;
    }
    const source = stock.find((item) => item.id === (transfer.binId || transferableBins[0]?.id));
    const quantity = Number(transfer.quantity);
    const location = transfer.toQuality ? "QC-INSPECCION" : transfer.location.trim().toUpperCase();
    if (!source || source.status !== "Libre utilización" || source.location === "REC-UBICAR") {
      setError("Selecciona una ubicación de stock libre para trasladar.");
      return;
    }
    if (!Number.isInteger(quantity) || quantity <= 0 || quantity > source.quantity - source.reserved) {
      setError(`Cantidad inválida: hay ${source.quantity - source.reserved} ${source.unit} libres para traslado.`);
      return;
    }
    if (
      (!transfer.toQuality && !transfer.warehouse.trim()) ||
      !location ||
      (!transfer.toQuality && (transfer.warehouse.trim() === "Recepciones" ||
      !isPickableLocation(location) ||
      (transfer.warehouse === source.warehouse && location === source.location)))
    ) {
      setError("Indica un almacén y ubicación destino distintos al origen.");
      return;
    }
    const result = manualTransfer(source.id, quantity, {
      ...source,
      warehouse: transfer.toQuality ? "Almacén Calidad" : transfer.warehouse.trim(),
      location,
      status: transfer.toQuality ? "Bloqueado calidad" : "Libre utilización",
      reference: `Traslado desde ${source.warehouse}/${source.location}`,
    }, { user, role });
    if (!result.ok) {
      setError(result.error);
      return;
    }
    const destination = result.value;
    setMessage(`${quantity} ${source.unit} de ${source.code} trasladados a ${destination.warehouse}/${destination.location}${transfer.toQuality ? " para inspección" : ""}.`);
    setError("");
  };

  return (
    <Stack spacing={3}>
      <Paper sx={{ p: 3 }}>
        <Stack spacing={2}>
          <Box>
            <Typography variant="h6">Conteo cíclico y ajustes</Typography>
            <Typography variant="body2" color="text.secondary">Registra la cantidad física contada por ubicación. Las reservas existentes quedan protegidas.</Typography>
          </Box>
          <Stack component="form" direction={{ xs: "column", md: "row" }} spacing={1} onSubmit={performCycleCount}>
            <TextField select label="Material / ubicación" value={cycleCount.binId || countableBins[0]?.id || ""} onChange={(event) => setCycleCount((current) => ({ ...current, binId: event.target.value }))} disabled={!canCount || countableBins.length === 0} sx={{ minWidth: 300 }}>
              {countableBins.map((bin) => <MenuItem key={bin.id} value={bin.id}>{bin.code} · {bin.warehouse}/{bin.location} · sistema {bin.quantity}</MenuItem>)}
            </TextField>
            <TextField label="Cantidad contada" type="number" value={cycleCount.countedQuantity} onChange={(event) => setCycleCount((current) => ({ ...current, countedQuantity: event.target.value }))} slotProps={{ htmlInput: { min: 0, step: 1 } }} />
            <Button type="submit" variant="contained" disabled={!canCount}>Aplicar conteo</Button>
            {canImportStock && <Button component="label" variant="outlined">
              Importar saldos CSV
              <input hidden type="file" accept=".csv,text/csv" onChange={importWarehouseCsv} />
            </Button>}
          </Stack>
          <Divider />
          <Typography variant="h6">Traslado entre almacenes</Typography>
          <Stack component="form" direction={{ xs: "column", md: "row" }} spacing={1} onSubmit={performTransfer}>
            <TextField select label="Stock origen" value={transfer.binId || transferableBins[0]?.id || ""} onChange={(event) => setTransfer((current) => ({ ...current, binId: event.target.value }))} disabled={!canTransfer || transferableBins.length === 0} sx={{ minWidth: 300 }}>
              {transferableBins.map((bin) => <MenuItem key={bin.id} value={bin.id}>{bin.code} · {bin.warehouse}/{bin.location} · libre {bin.quantity - bin.reserved}</MenuItem>)}
            </TextField>
            <TextField label="Cantidad" type="number" value={transfer.quantity} onChange={(event) => setTransfer((current) => ({ ...current, quantity: event.target.value }))} slotProps={{ htmlInput: { min: 1, step: 1 } }} />
            <TextField select label="Destino" value={transfer.toQuality ? "quality" : "warehouse"} onChange={(event) => setTransfer((current) => ({ ...current, toQuality: event.target.value === "quality" }))}>
              <MenuItem value="warehouse">Almacén / ubicación</MenuItem><MenuItem value="quality">Almacén Calidad · inspección</MenuItem>
            </TextField>
            {!transfer.toQuality && <>
              <TextField label="Almacén destino" value={transfer.warehouse} onChange={(event) => setTransfer((current) => ({ ...current, warehouse: event.target.value }))} />
              <TextField label="Ubicación destino" value={transfer.location} onChange={(event) => setTransfer((current) => ({ ...current, location: event.target.value }))} />
            </>}
            <Button type="submit" variant="contained" disabled={!canTransfer}>Trasladar</Button>
          </Stack>
        </Stack>
      </Paper>

      <Paper sx={{ p: 3 }}>
        <Typography variant="h6" sx={{ mb: 2 }}>Kardex · últimos movimientos</Typography>
        <Table size="small">
          <TableHead><TableRow><TableCell>Fecha</TableCell><TableCell>Movimiento</TableCell><TableCell>Material</TableCell><TableCell align="right">Cantidad</TableCell><TableCell>Origen → destino</TableCell><TableCell>Referencia</TableCell><TableCell>Usuario</TableCell></TableRow></TableHead>
          <TableBody>{movements.slice(0, 100).map((movement) => (
            <TableRow key={movement.id}>
              <TableCell>{new Intl.DateTimeFormat("es-CL", { dateStyle: "short", timeStyle: "short" }).format(new Date(movement.date))}</TableCell>
              <TableCell>{movement.type}</TableCell>
              <TableCell>{movement.code}</TableCell>
              <TableCell align="right">{movement.quantity}</TableCell>
              <TableCell>{movement.from} → {movement.to}</TableCell>
              <TableCell>{movement.reference}</TableCell>
              <TableCell>{movement.user}</TableCell>
            </TableRow>
          ))}</TableBody>
        </Table>
        {movements.length === 0 && <Alert severity="info" sx={{ mt: 2 }}>Los movimientos que registres aparecerán aquí. Los saldos demo iniciales no tienen historia anterior.</Alert>}
      </Paper>
    </Stack>
  );
}
