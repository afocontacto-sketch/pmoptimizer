import { useMemo, useState } from "react";
import {
  Alert,
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
import { money } from "../../data/format";
import { stockByMaterial } from "../../data/stock";
import { useOperations } from "../../hooks/useOperations";

// Consulta de stock por material (solo lectura): libre, por ubicar, calidad, tránsito, total y valor.
export default function StockTab() {
  const { stock } = useOperations();
  const [warehouse, setWarehouse] = useState("");
  const [filter, setFilter] = useState("");
  const warehouses = useMemo(() => [...new Set(stock.map((bin) => bin.warehouse))].sort(), [stock]);
  const search = filter.trim().toLowerCase();
  const rows = stockByMaterial(stock, warehouse || undefined)
    .filter((row) => !search || `${row.code} ${row.name}`.toLowerCase().includes(search));
  const totalValue = rows.reduce((sum, row) => sum + row.value, 0);

  return (
    <Paper sx={{ p: 3 }}>
      <Typography variant="h6" sx={{ mb: 1 }}>Consulta de stock por material</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Libre = utilización en ubicación definitiva; Por ubicar = libre aún en zona de recepción. Total = libre + por ubicar + calidad + tránsito.
      </Typography>
      <Stack direction={{ xs: "column", md: "row" }} spacing={2} sx={{ mb: 2 }}>
        <TextField select label="Almacén" value={warehouse} onChange={(event) => setWarehouse(event.target.value)} sx={{ minWidth: 220 }}>
          <MenuItem value="">Todos</MenuItem>
          {warehouses.map((name) => <MenuItem key={name} value={name}>{name}</MenuItem>)}
        </TextField>
        <TextField label="Buscar material" value={filter} onChange={(event) => setFilter(event.target.value)} fullWidth />
      </Stack>
      {rows.length === 0 ? (
        <Alert severity="info">No hay stock que coincida con el filtro.</Alert>
      ) : (
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Material</TableCell>
              <TableCell align="right">Libre</TableCell>
              <TableCell align="right">Por ubicar</TableCell>
              <TableCell align="right">Calidad</TableCell>
              <TableCell align="right">Tránsito</TableCell>
              <TableCell align="right">Total</TableCell>
              <TableCell align="right">Valor</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.code}>
                <TableCell>{row.code} · {row.name}</TableCell>
                <TableCell align="right">{row.free} {row.unit}</TableCell>
                <TableCell align="right">{row.unlocated}</TableCell>
                <TableCell align="right">{row.quality}</TableCell>
                <TableCell align="right">{row.transit}</TableCell>
                <TableCell align="right">{row.total} {row.unit}</TableCell>
                <TableCell align="right">{money(row.value)}</TableCell>
              </TableRow>
            ))}
            <TableRow>
              <TableCell colSpan={6} sx={{ fontWeight: 700 }}>Valor total</TableCell>
              <TableCell align="right" sx={{ fontWeight: 700 }}>{money(totalValue)}</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      )}
    </Paper>
  );
}
