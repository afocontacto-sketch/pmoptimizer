import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import type { ProductionCtx } from "./useProductionCtx";

export default function ReopenDialog({ ctx }: { ctx: ProductionCtx }) {
  const { reopenModalOpen, setReopenModalOpen, reopenOrderId, setReopenOrderId, reopenReason, setReopenReason, reopenOrder } = ctx;
  return (
  <Dialog open={reopenModalOpen} onClose={() => {
    setReopenModalOpen(false);
    setReopenOrderId("");
    setReopenReason("");
  }} maxWidth="sm" fullWidth>
    <DialogTitle>Reapertura de Orden de Trabajo</DialogTitle>
    <DialogContent sx={{ pt: 2 }}>
      <Stack spacing={2}>
        <Box>
          <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
            Orden: {reopenOrderId}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Especifica el motivo de la reapertura para auditoría
          </Typography>
        </Box>
        <TextField
          fullWidth
          multiline
          minRows={3}
          label="Motivo de reapertura"
          placeholder="Ej: Se encontró defecto en prueba de calidad, se requiere reproceso"
          value={reopenReason}
          onChange={(event) => setReopenReason(event.target.value)}
        />
      </Stack>
    </DialogContent>
    <DialogActions>
      <Button onClick={() => {
        setReopenModalOpen(false);
        setReopenOrderId("");
        setReopenReason("");
      }}>Cancelar</Button>
      <Button
        variant="contained"
        onClick={() => {
          reopenOrder(reopenOrderId, reopenReason);
          setReopenModalOpen(false);
          setReopenOrderId("");
          setReopenReason("");
        }}
        disabled={!reopenReason.trim()}
      >
        Reabrir OT
      </Button>
    </DialogActions>
  </Dialog>
  );
}
