import {
  Alert,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import AssignmentTab from "./AssignmentTab";
import type { ProductionCtx } from "./useProductionCtx";

export default function TeamTab({ ctx }: { ctx: ProductionCtx }) {
  const { supervisorEmployee, supervisorTeam } = ctx;
  return (
    <Stack spacing={3}>
      <Paper sx={{ p: 3 }}>
        <Typography variant="h6" sx={{ mb: 2 }}>Personal a cargo</Typography>
        {!supervisorEmployee ? (
          <Alert severity="warning">Esta cuenta no está vinculada a un supervisor. Solicita al Administrador que configure el usuario en Recursos Humanos.</Alert>
        ) : supervisorTeam.length === 0 ? (
          <Alert severity="info">No hay trabajadores asignados a {supervisorEmployee.name}.</Alert>
        ) : (
          <Table size="small">
            <TableHead><TableRow><TableCell>Trabajador</TableCell><TableCell>Cargo / especialidad</TableCell><TableCell>Contratos asignados</TableCell></TableRow></TableHead>
            <TableBody>{supervisorTeam.map((employee) => (
              <TableRow key={employee.id}>
                <TableCell>{employee.name}</TableCell>
                <TableCell>{employee.position}</TableCell>
                <TableCell>{(employee.contractCodes?.length ? employee.contractCodes : employee.contractCode ? [employee.contractCode] : []).join(", ") || "—"}</TableCell>
              </TableRow>
            ))}</TableBody>
          </Table>
        )}
      </Paper>
      <AssignmentTab ctx={ctx} />
    </Stack>
  );
}
