import { useMemo, useState } from "react";
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
import { printDocument } from "../../components/print/printDocument";
import { transferDoc } from "../../components/print/templates/transferDoc";
import { keys } from "../../data/keys";
import { closeTransferDifference, emitTransfer, readTransfers, receiveTransfer, stockByMaterial, transferPending } from "../../data/stock";
import type { TransferOrder } from "../../data/stock";
import { useOperations } from "../../hooks/useOperations";
import type { Feedback } from "../../hooks/useOperations";
import { useStoredValue } from "../../hooks/useStore";

type Props = { user: string; role: Role } & Feedback;

export default function TransfersTab({ user, role, setMessage, setError }: Props) {
  const { stock } = useOperations();
  const transfers = useStoredValue<TransferOrder[]>(keys.transferOrders, readTransfers);
  const canEmit = can(role, "warehouse.transfer");
  const canReceive = can(role, "warehouse.receiveTransfer");
  const warehouses = useMemo(
    () => [...new Set(stock.map((bin) => bin.warehouse))].filter((name) => name !== "Recepciones").sort(),
    [stock],
  );
  const [form, setForm] = useState({ from: "", to: "", code: "", qty: "" });
  const [lines, setLines] = useState<{ code: string; qty: number }[]>([]);
  const [receipt, setReceipt] = useState<Record<string, string>>({});
  const [locations, setLocations] = useState<Record<string, string>>({});
  const available = stockByMaterial(stock, form.from || undefined).filter((row) => row.free > 0);
  const withDifference = transfers.filter((transfer) => transfer.status === "Recibido con diferencia" && transferPending(transfer) > 0);

  const addLine = () => {
    const qty = Number(form.qty);
    if (!form.code || !Number.isFinite(qty) || qty <= 0) {
      setError("Elige un material y una cantidad mayor a cero.");
      return;
    }
    setLines((current) => [...current.filter((line) => line.code !== form.code), { code: form.code, qty }]);
    setForm((current) => ({ ...current, code: "", qty: "" }));
    setError("");
  };

  const emit = () => {
    const result = emitTransfer({ fromWarehouse: form.from, toWarehouse: form.to, lines }, { user, role });
    if (!result.ok) {
      setMessage("");
      setError(result.error);
      return;
    }
    setLines([]);
    setError("");
    setMessage(`Traspaso ${result.value.id} emitido: el stock salió de ${form.from} y está en tránsito hacia ${form.to}.`);
  };

  const receive = (transfer: TransferOrder) => {
    const received = Object.fromEntries(transfer.lines.map((line) => [line.code, Number(receipt[`${transfer.id}:${line.code}`] ?? 0)]));
    const result = receiveTransfer(transfer.id, received, { user, role }, { location: locations[transfer.id] });
    if (!result.ok) {
      setMessage("");
      setError(result.error);
      return;
    }
    setReceipt((current) => Object.fromEntries(Object.entries(current).filter(([key]) => !key.startsWith(`${transfer.id}:`))));
    setError("");
    setMessage(`Traspaso ${transfer.id}: ${result.value.status}.`);
  };

  const giveBack = (transfer: TransferOrder) => {
    if (!window.confirm(`¿Devolver ${transferPending(transfer)} unidades pendientes del traspaso ${transfer.id} a ${transfer.fromWarehouse}? Se cierra el traspaso.`)) return;
    const result = closeTransferDifference(transfer.id, { user, role });
    if (!result.ok) {
      setMessage("");
      setError(result.error);
      return;
    }
    setError("");
    setMessage(`Traspaso ${transfer.id}: saldo devuelto a ${transfer.fromWarehouse}.`);
  };

  return (
    <Stack spacing={2}>
      {withDifference.map((transfer) => (
        <Alert severity="warning" key={transfer.id}>
          Traspaso {transfer.id} recibido con diferencia: quedan {transferPending(transfer)} unidades en tránsito hacia {transfer.toWarehouse}.
        </Alert>
      ))}
      {canEmit && (
        <Paper sx={{ p: 3 }}>
          <Typography variant="h6" sx={{ mb: 1 }}>Emitir traspaso</Typography>
          <Stack direction={{ xs: "column", lg: "row" }} spacing={1} sx={{ mb: 1 }}>
            <TextField select label="Origen" value={form.from} onChange={(event) => { setForm((current) => ({ ...current, from: event.target.value, code: "" })); setLines([]); }} sx={{ minWidth: 180 }}>
              {warehouses.map((name) => <MenuItem key={name} value={name}>{name}</MenuItem>)}
            </TextField>
            <TextField select label="Destino" value={form.to} onChange={(event) => setForm((current) => ({ ...current, to: event.target.value }))} sx={{ minWidth: 180 }}>
              {warehouses.filter((name) => name !== form.from).map((name) => <MenuItem key={name} value={name}>{name}</MenuItem>)}
            </TextField>
            <TextField select label="Material" value={form.code} onChange={(event) => setForm((current) => ({ ...current, code: event.target.value }))} sx={{ minWidth: 240 }} disabled={!form.from}>
              {available.map((row) => <MenuItem key={row.code} value={row.code}>{row.code} · {row.name} (libre {row.free})</MenuItem>)}
            </TextField>
            <TextField label="Cantidad" type="number" value={form.qty} onChange={(event) => setForm((current) => ({ ...current, qty: event.target.value }))} slotProps={{ htmlInput: { min: 1, step: "any" } }} />
            <Button onClick={addLine}>Agregar línea</Button>
          </Stack>
          {lines.length > 0 && (
            <Box sx={{ mb: 1 }}>
              {lines.map((line) => <Chip key={line.code} label={`${line.code} x ${line.qty}`} onDelete={() => setLines((current) => current.filter((item) => item.code !== line.code))} sx={{ mr: 1 }} />)}
            </Box>
          )}
          <Button variant="contained" disabled={!form.from || !form.to || lines.length === 0} onClick={emit}>Emitir traspaso</Button>
        </Paper>
      )}
      <Paper sx={{ p: 3 }}>
        <Typography variant="h6" sx={{ mb: 1 }}>Traspasos</Typography>
        {transfers.length === 0 ? <Alert severity="info">No hay traspasos registrados.</Alert> : (
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Traspaso</TableCell><TableCell>Ruta</TableCell><TableCell>Estado</TableCell>
                <TableCell>Líneas (enviado / recibido)</TableCell><TableCell>Recepción</TableCell><TableCell />
              </TableRow>
            </TableHead>
            <TableBody>
              {[...transfers].reverse().map((transfer) => (
                <TableRow key={transfer.id}>
                  <TableCell>{transfer.id}<Typography variant="caption" sx={{ display: "block" }}>{transfer.createdBy}</Typography></TableCell>
                  <TableCell>{transfer.fromWarehouse} → {transfer.toWarehouse}</TableCell>
                  <TableCell><Chip size="small" label={transfer.status} color={transfer.status === "Recibido" || transfer.status === "Cerrado con devolución" ? "success" : transfer.status === "En tránsito" ? "info" : "warning"} /></TableCell>
                  <TableCell>{transfer.lines.map((line) => <Typography variant="body2" key={line.code}>{line.code}: {line.sent} / {line.received ?? 0}</Typography>)}</TableCell>
                  <TableCell>
                    {canReceive && transfer.status !== "Recibido" && transfer.status !== "Cerrado con devolución" && (
                      <Stack spacing={1}>
                        {transfer.lines.filter((line) => line.sent - (line.received ?? 0) > 0).map((line) => (
                          <TextField key={line.code} size="small" type="number" label={`${line.code} recibido`} value={receipt[`${transfer.id}:${line.code}`] ?? ""} onChange={(event) => setReceipt((current) => ({ ...current, [`${transfer.id}:${line.code}`]: event.target.value }))} slotProps={{ htmlInput: { min: 0, max: line.sent - (line.received ?? 0), step: "any" } }} />
                        ))}
                        <TextField size="small" label="Ubicación (opcional)" value={locations[transfer.id] ?? ""} onChange={(event) => setLocations((current) => ({ ...current, [transfer.id]: event.target.value }))} />
                        <Button size="small" variant="contained" onClick={() => receive(transfer)}>Recibir</Button>
                        {transfer.status === "Recibido con diferencia" && <Button size="small" color="warning" variant="outlined" onClick={() => giveBack(transfer)}>Devolver saldo a origen</Button>}
                      </Stack>
                    )}
                  </TableCell>
                  <TableCell><Button size="small" onClick={() => { void printDocument({ ...transferDoc(transfer), user }); }}>Imprimir</Button></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Paper>
    </Stack>
  );
}
