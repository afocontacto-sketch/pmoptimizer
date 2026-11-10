import {
  Alert,
  Divider,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import { money } from "../../data/format";
import { wbsTotals } from "../operationsData";
import type { ProductionCtx } from "./useProductionCtx";

export default function WbsCostTab({ ctx }: { ctx: ProductionCtx }) {
  const { contracts, visibleOrders, stock } = ctx;
  const totalsByWbs = wbsTotals(contracts[0], visibleOrders, stock);
  return (
    <Stack spacing={3}>
      <Paper sx={{ p: 3 }}>
        <Typography variant="h6">{contracts[0].code} · {contracts[0].customer}</Typography>
        <Typography color="text.secondary">{contracts[0].description}</Typography>
        <Divider sx={{ my: 2 }} />
        <Table size="small">
          <TableHead><TableRow><TableCell>Elemento WBS</TableCell><TableCell>Alcance</TableCell><TableCell align="right">Presupuesto</TableCell><TableCell align="right">Real</TableCell><TableCell align="right">Comprometido</TableCell><TableCell align="right">Proyección a término</TableCell><TableCell align="right">Saldo proyectado</TableCell></TableRow></TableHead>
          <TableBody>{totalsByWbs.map(({ element, actual, committed, projected, linked }) => (
            <TableRow key={element.code}>
              <TableCell><Typography sx={{ fontWeight: 700 }}>{element.code}</Typography></TableCell>
              <TableCell>{element.description}<Typography sx={{ display: "block" }} variant="caption" color="text.secondary">{linked} OT vinculadas</Typography></TableCell>
              <TableCell align="right">{money(element.budget)}</TableCell>
              <TableCell align="right">{money(actual)}</TableCell>
              <TableCell align="right">{money(committed)}</TableCell>
              <TableCell align="right">{money(projected)}</TableCell>
              <TableCell align="right" sx={{ color: projected > element.budget ? "error.main" : "success.main" }}>{money(element.budget - projected)}</TableCell>
            </TableRow>
          ))}</TableBody>
        </Table>
      </Paper>
      <Alert severity="info">
        Real = horas ya registradas + materiales consumidos. Comprometido = materiales pendientes de consumir en OT abiertas. Proyección = horas planificadas + todos los materiales de las OT. Son cifras demo, no asientos contables.
      </Alert>
    </Stack>
  );
}
