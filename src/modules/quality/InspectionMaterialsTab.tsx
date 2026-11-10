import { Alert, Checkbox, Paper, Table, TableBody, TableCell, TableHead, TableRow, Typography } from "@mui/material";
import { can } from "../../app/permissions";
import type { Role } from "../../app/roles";
import { keys } from "../../data/keys";
import { readMaterials, setRequiresInspection } from "../../data/materials";
import type { MaterialRecord } from "../../data/materials";
import { useStoredValue } from "../../hooks/useStore";
import type { Feedback } from "../../hooks/useOperations";

export default function InspectionMaterialsTab({ user, role, setMessage, setError }: { user: string; role: Role } & Feedback) {
  const materials = useStoredValue<MaterialRecord[]>(keys.materialMaster, readMaterials);
  const canMark = can(role, "quality.markInspection");
  const toggle = (code: string, value: boolean) => {
    const result = setRequiresInspection(code, value, { user, role });
    if (result.ok) {
      setMessage(`${code}: ${value ? "requiere" : "ya no requiere"} inspección al recibirse.`);
      setError("");
    } else {
      setError(result.error);
    }
  };
  return (
    <Paper sx={{ p: 3 }}>
      <Typography variant="h6" sx={{ mb: 1 }}>Materiales a inspeccionar</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>Los materiales marcados entran a "Bloqueado calidad" al recibirse; el resto queda libre.</Typography>
      {!canMark && <Alert severity="info" sx={{ mb: 2 }}>Vista de consulta: solo Calidad o Administrador puede cambiar la marca.</Alert>}
      <Table size="small">
        <TableHead><TableRow><TableCell>Código</TableCell><TableCell>Material</TableCell><TableCell>Categoría</TableCell><TableCell align="center">Requiere inspección</TableCell></TableRow></TableHead>
        <TableBody>{materials.map((item) => (
          <TableRow key={item.code}>
            <TableCell>{item.code}</TableCell><TableCell>{item.name}</TableCell><TableCell>{item.category}</TableCell>
            <TableCell align="center"><Checkbox checked={item.requiresInspection} disabled={!canMark} onChange={(event) => toggle(item.code, event.target.checked)} slotProps={{ input: { "aria-label": `Requiere inspección ${item.code}` } }} /></TableCell>
          </TableRow>
        ))}</TableBody>
      </Table>
    </Paper>
  );
}
