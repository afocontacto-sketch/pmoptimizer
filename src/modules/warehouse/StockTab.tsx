import { useState } from "react";
import {
  Alert,
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
import { useOperations } from "../../hooks/useOperations";
import { aggregateStockBins, isPickableLocation } from "../operationsData";

// Vista de consulta del Supervisor: stock libre para uso.
export default function StockTab() {
  const { stock } = useOperations();
  const [stockFilter, setStockFilter] = useState("");
  const stockSearch = stockFilter.trim().toLowerCase();
  const supervisorAvailableStock = aggregateStockBins(stock.filter((bin) => {
    const availableQuantity = bin.quantity - bin.reserved;
    return bin.status === "Libre utilización" &&
      isPickableLocation(bin.location) &&
      availableQuantity > 0;
  })).filter((bin) =>
    !stockSearch || `${bin.code} ${bin.name} ${bin.warehouse} ${bin.location}`.toLowerCase().includes(stockSearch),
  );

  return (
    <Stack spacing={2}>
      <Paper sx={{ p: 3 }}>
        <Typography variant="h6" sx={{ mb: 1 }}>Stock disponible para uso</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Solo se muestran materiales en estado Libre utilización, descontando las cantidades reservadas.
        </Typography>
        <TextField
          label="Buscar material, almacén o ubicación"
          value={stockFilter}
          onChange={(event) => setStockFilter(event.target.value)}
          fullWidth
          sx={{ mb: 2 }}
        />
        {supervisorAvailableStock.length === 0 ? (
          <Alert severity="info">No hay stock disponible para uso que coincida con la búsqueda.</Alert>
        ) : (
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Material</TableCell>
                <TableCell>Almacén</TableCell>
                <TableCell>Ubicación</TableCell>
                <TableCell align="right">Disponible</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {supervisorAvailableStock.map((bin) => (
                <TableRow key={bin.id}>
                  <TableCell>{bin.code} · {bin.name}{bin.sourceBins.length > 1 && <Typography variant="caption" sx={{ display: "block" }}>{bin.sourceBins.length} registros acumulados</Typography>}</TableCell>
                  <TableCell>{bin.warehouse}</TableCell>
                  <TableCell>{bin.location}</TableCell>
                  <TableCell align="right">{bin.quantity - bin.reserved} {bin.unit}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Paper>
    </Stack>
  );
}
