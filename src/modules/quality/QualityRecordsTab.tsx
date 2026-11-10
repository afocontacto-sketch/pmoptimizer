import { keys } from "../../data/keys";
import { useEffect, useState } from "react";
import {
  Box,
  Chip,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
  LinearProgress,
} from "@mui/material";
import { CheckCircle, Pending } from "@mui/icons-material";

export type QualityChecklist = {
  id: string;
  orderId: string;
  orderNumber: string;
  items: Array<{
    id: string;
    description: string;
    checked: boolean;
    observations: string;
  }>;
  status: "Pendiente" | "En revisión" | "Aprobado" | "Rechazado";
  inspector: string;
  inspectionDate?: string;
  createdAt: string;
};

export type QualityMaterial = {
  id: string;
  materialCode: string;
  materialName: string;
  quantity: number;
  status: "Por inspeccionar" | "Inspeccionado" | "Rechazado";
  inspectionDate?: string;
  inspector?: string;
  observations: string;
};

const qualityChecklistsKey = keys.qualityChecklists;
const qualityMaterialsKey = keys.qualityMaterials;

function readQualityChecklists(): QualityChecklist[] {
  try {
    const raw = localStorage.getItem(qualityChecklistsKey);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function readQualityMaterials(): QualityMaterial[] {
  try {
    const raw = localStorage.getItem(qualityMaterialsKey);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export default function QualityRecordsTab() {
  const [checklists, setChecklists] = useState<QualityChecklist[]>([]);
  const [materials, setMaterials] = useState<QualityMaterial[]>([]);

  useEffect(() => {
    setChecklists(readQualityChecklists());
    setMaterials(readQualityMaterials());
  }, []);

  // Calcular estadísticas de checklists
  const checklistStats = {
    pendientes: checklists.filter((c) => c.status === "Pendiente").length,
    enRevision: checklists.filter((c) => c.status === "En revisión").length,
    aprobados: checklists.filter((c) => c.status === "Aprobado").length,
    rechazados: checklists.filter((c) => c.status === "Rechazado").length,
    total: checklists.length,
  };

  // Calcular estadísticas de materiales
  const materialStats = {
    porInspeccionar: materials.filter((m) => m.status === "Por inspeccionar").length,
    inspeccionados: materials.filter((m) => m.status === "Inspeccionado").length,
    rechazados: materials.filter((m) => m.status === "Rechazado").length,
    total: materials.length,
  };

  const aprobadosPercentage = checklistStats.total > 0 ? (checklistStats.aprobados / checklistStats.total) * 100 : 0;
  const inspeccionadosPercentage = materialStats.total > 0 ? (materialStats.inspeccionados / materialStats.total) * 100 : 0;

  return (
    <Box>

      {/* Dashboards */}
      <Stack direction={{ xs: "column", md: "row" }} spacing={3} sx={{ mb: 4 }}>
        {/* Dashboard 1: Órdenes Pendientes vs Inspeccionadas */}
        <Box sx={{ flex: 1, p: 2, border: "1px solid #e0e0e0", borderRadius: 1 }}>
          <Typography variant="h6" sx={{ mb: 2 }}>
            📋 Órdenes Inspección - Este Mes
          </Typography>

          <Stack direction="row" spacing={2} sx={{ mb: 3 }}>
            <Box sx={{ flex: 1, p: 2, textAlign: "center", bgcolor: "#fff3cd", borderRadius: 1 }}>
              <Typography variant="h4" sx={{ color: "#f59e0b" }}>
                {checklistStats.pendientes + checklistStats.enRevision}
              </Typography>
              <Typography variant="body2" color="textSecondary">
                Pendientes
              </Typography>
            </Box>
            <Box sx={{ flex: 1, p: 2, textAlign: "center", bgcolor: "#d1fae5", borderRadius: 1 }}>
              <Typography variant="h4" sx={{ color: "#10b981" }}>
                {checklistStats.aprobados}
              </Typography>
              <Typography variant="body2" color="textSecondary">
                Inspeccionadas
              </Typography>
            </Box>
          </Stack>

          <Typography variant="body2" sx={{ mb: 1 }}>
            Progreso de Inspección
          </Typography>
          <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
            <LinearProgress
              variant="determinate"
              value={aprobadosPercentage}
              sx={{ flex: 1, height: 8 }}
            />
            <Typography variant="body2" sx={{ minWidth: "40px" }}>
              {Math.round(aprobadosPercentage)}%
            </Typography>
          </Stack>

          <Stack sx={{ mt: 2 }} spacing={1}>
            <Stack direction="row" sx={{ justifyContent: "space-between" }}>
              <Typography variant="body2">Pendientes:</Typography>
              <Chip label={checklistStats.pendientes} size="small" variant="outlined" />
            </Stack>
            <Stack direction="row" sx={{ justifyContent: "space-between" }}>
              <Typography variant="body2">En revisión:</Typography>
              <Chip label={checklistStats.enRevision} size="small" variant="outlined" />
            </Stack>
            <Stack direction="row" sx={{ justifyContent: "space-between" }}>
              <Typography variant="body2">Aprobados:</Typography>
              <Chip label={checklistStats.aprobados} size="small" color="success" />
            </Stack>
            <Stack direction="row" sx={{ justifyContent: "space-between" }}>
              <Typography variant="body2">Rechazados:</Typography>
              <Chip label={checklistStats.rechazados} size="small" color="error" />
            </Stack>
          </Stack>
        </Box>

        {/* Dashboard 2: Materiales Inspeccionados vs Pendientes */}
        <Box sx={{ flex: 1, p: 2, border: "1px solid #e0e0e0", borderRadius: 1 }}>
          <Typography variant="h6" sx={{ mb: 2 }}>
            📦 Materiales Inspección - Resumen
          </Typography>

          <Stack direction="row" spacing={2} sx={{ mb: 3 }}>
            <Box sx={{ flex: 1, p: 2, textAlign: "center", bgcolor: "#ffe5e5", borderRadius: 1 }}>
              <Typography variant="h4" sx={{ color: "#ef4444" }}>
                {materialStats.porInspeccionar}
              </Typography>
              <Typography variant="body2" color="textSecondary">
                Por Inspeccionar
              </Typography>
            </Box>
            <Box sx={{ flex: 1, p: 2, textAlign: "center", bgcolor: "#d1fae5", borderRadius: 1 }}>
              <Typography variant="h4" sx={{ color: "#10b981" }}>
                {materialStats.inspeccionados}
              </Typography>
              <Typography variant="body2" color="textSecondary">
                Inspeccionados
              </Typography>
            </Box>
          </Stack>

          <Typography variant="body2" sx={{ mb: 1 }}>
            Progreso de Inspección de Materiales
          </Typography>
          <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
            <LinearProgress
              variant="determinate"
                  value={inspeccionadosPercentage}
                  sx={{ flex: 1, height: 8 }}
                />
                <Typography variant="body2" sx={{ minWidth: "40px" }}>
                  {Math.round(inspeccionadosPercentage)}%
                </Typography>
              </Stack>

              <Stack sx={{ mt: 2 }} spacing={1}>
                <Stack direction="row" sx={{ justifyContent: "space-between" }}>
                  <Typography variant="body2">Por Inspeccionar:</Typography>
                  <Chip label={materialStats.porInspeccionar} size="small" color="error" />
                </Stack>
                <Stack direction="row" sx={{ justifyContent: "space-between" }}>
                  <Typography variant="body2">Inspeccionados:</Typography>
                  <Chip label={materialStats.inspeccionados} size="small" color="success" />
                </Stack>
                <Stack direction="row" sx={{ justifyContent: "space-between" }}>
                  <Typography variant="body2">Rechazados:</Typography>
                  <Chip label={materialStats.rechazados} size="small" color="default" />
                </Stack>
              </Stack>
        </Box>
      </Stack>

      {/* Tabla de Checklists */}
      <Box sx={{ mb: 3, border: "1px solid #e5e7eb", borderRadius: 1 }}>
        <Box sx={{ p: 2, borderBottom: "1px solid #e5e7eb" }}>
          <Typography variant="h6">Checklists de Inspección</Typography>
        </Box>
        <Table size="small">
          <TableHead>
            <TableRow sx={{ backgroundColor: "#f5f5f5" }}>
              <TableCell>Orden</TableCell>
              <TableCell>Estado</TableCell>
              <TableCell>Inspector</TableCell>
              <TableCell align="right">Items</TableCell>
              <TableCell>Fecha</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {checklists.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} align="center" sx={{ py: 3 }}>
                  <Typography color="textSecondary">Sin checklists registrados</Typography>
                </TableCell>
              </TableRow>
            ) : (
              checklists.map((checklist) => (
                <TableRow key={checklist.id}>
                  <TableCell>{checklist.orderNumber}</TableCell>
                  <TableCell>
                    <Chip
                      label={checklist.status}
                      size="small"
                      color={
                        checklist.status === "Aprobado"
                          ? "success"
                          : checklist.status === "Rechazado"
                            ? "error"
                            : "warning"
                      }
                    />
                  </TableCell>
                  <TableCell>{checklist.inspector || "-"}</TableCell>
                  <TableCell align="right">
                    {checklist.items.filter((i) => i.checked).length}/{checklist.items.length}
                  </TableCell>
                  <TableCell>{checklist.inspectionDate || "Pendiente"}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Box>

      {/* Tabla de Materiales */}
      <Box sx={{ border: "1px solid #e5e7eb", borderRadius: 1 }}>
        <Box sx={{ p: 2, borderBottom: "1px solid #e5e7eb" }}>
          <Typography variant="h6">Materiales en Inspección</Typography>
        </Box>
        <Table size="small">
          <TableHead>
            <TableRow sx={{ backgroundColor: "#f5f5f5" }}>
              <TableCell>Código Material</TableCell>
              <TableCell>Nombre</TableCell>
              <TableCell align="right">Cantidad</TableCell>
              <TableCell>Estado</TableCell>
              <TableCell>Inspector</TableCell>
              <TableCell>Observaciones</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {materials.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} align="center" sx={{ py: 3 }}>
                  <Typography color="textSecondary">Sin materiales en inspección</Typography>
                </TableCell>
              </TableRow>
            ) : (
              materials.map((material) => (
                <TableRow key={material.id}>
                  <TableCell>{material.materialCode}</TableCell>
                  <TableCell>{material.materialName}</TableCell>
                  <TableCell align="right">{material.quantity}</TableCell>
                  <TableCell>
                    <Chip
                      label={material.status}
                      size="small"
                      icon={
                        material.status === "Inspeccionado" ? (
                          <CheckCircle />
                        ) : (
                          <Pending />
                        )
                      }
                      color={material.status === "Inspeccionado" ? "success" : "default"}
                    />
                  </TableCell>
                  <TableCell>{material.inspector || "-"}</TableCell>
                  <TableCell>{material.observations || "-"}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Box>
    </Box>
  );
}
