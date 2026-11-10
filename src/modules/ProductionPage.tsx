import { keys } from "../data/keys";
import { useEffect, useState } from "react";
import {
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  MenuItem,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import {
  Add as AddIcon,
  PlayArrow as PlayArrowIcon,
  Stop as StopIcon,
} from "@mui/icons-material";

export type ProductionOrder = {
  id: string;
  orderNumber: string;
  type: "PRE" | "COR" | "OVH" | "GAR";
  description: string;
  status: "Asignada" | "En ejecución" | "Cierre provisorio" | "Cerrada";
  assignedTo: string[]; // Múltiples técnicos
  createdBy: string;
  createdAt: string;
  closedAt?: string;
  closedBy?: string;
  reopenHistory?: Array<{
    date: string;
    reason: string;
    reopenedBy: string;
  }>;
};

export type WorkAssignment = {
  orderId: string;
  technicianId: string;
  technicianName: string;
  status: "Pendiente" | "En progreso" | "Completado";
  assignedAt: string;
  completedAt?: string;
  timeSpent?: number; // minutos
};

const productionOrdersKey = keys.productionOrders;
// const workAssignmentsKey = "work-assignments"; // Reservado para futuro

function generateOrderNumber(type: "PRE" | "COR" | "OVH" | "GAR"): string {
  const prefixes: Record<typeof type, string> = {
    PRE: "51",
    COR: "61",
    OVH: "71",
    GAR: "81",
  };
  const prefix = prefixes[type];
  const timestamp = Date.now().toString().slice(-6);
  return `${prefix}${timestamp}`;
}

function readOrders(): ProductionOrder[] {
  try {
    const raw = localStorage.getItem(productionOrdersKey);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveOrders(orders: ProductionOrder[]): void {
  localStorage.setItem(productionOrdersKey, JSON.stringify(orders));
}

export default function ProductionPage({ user, role }: { user: string; role: string }) {
  const [orders, setOrders] = useState<ProductionOrder[]>([]);
  const [openDialog, setOpenDialog] = useState(false);
  const [editingOrder, setEditingOrder] = useState<ProductionOrder | null>(null);
  const [formData, setFormData] = useState<Partial<ProductionOrder>>({
    type: "COR",
    status: "Asignada",
  });
  const [assignedTechs, setAssignedTechs] = useState<string[]>([]);
  const [reopenReason, setReopenReason] = useState("");
  const [openReopenDialog, setOpenReopenDialog] = useState(false);
  const [selectedOrderToReopen, setSelectedOrderToReopen] = useState<string>("");

  const demoTechnicians = [
    { id: "TEC-001", name: "Juan Pérez" },
    { id: "TEC-002", name: "María López" },
    { id: "TEC-003", name: "Carlos Mendez" },
    { id: "TEC-004", name: "Rosa García" },
  ];

  useEffect(() => {
    setOrders(readOrders());
  }, []);

  const canCreateCorrective = role === "Supervisor" || role === "Administrador";
  const canReopen = role === "Supervisor" || role === "Administrador";

  const handleNewOrder = () => {
    if (!canCreateCorrective) {
      alert("Solo Supervisor/Admin pueden crear órdenes correctivas");
      return;
    }
    setEditingOrder(null);
    setFormData({ type: "COR", status: "Asignada" });
    setAssignedTechs([]);
    setOpenDialog(true);
  };

  const handleSaveOrder = () => {
    if (!formData.description || assignedTechs.length === 0) {
      alert("Completa descripción y asigna al menos un técnico");
      return;
    }

    let updated: ProductionOrder[];
    if (editingOrder) {
      updated = orders.map((o) =>
        o.id === editingOrder.id
          ? {
              ...o,
              ...formData,
              assignedTo: assignedTechs,
            }
          : o
      );
    } else {
      const newOrder: ProductionOrder = {
        id: `ORD-${Date.now()}`,
        orderNumber: generateOrderNumber(formData.type as any),
        type: formData.type as any,
        description: formData.description || "",
        status: "Asignada",
        assignedTo: assignedTechs,
        createdBy: user,
        createdAt: new Date().toISOString(),
      };
      updated = [...orders, newOrder];
    }

    setOrders(updated);
    saveOrders(updated);
    setOpenDialog(false);
  };

  const handleStartOrder = (orderId: string) => {
    const updated = orders.map((o) =>
      o.id === orderId ? { ...o, status: "En ejecución" as const } : o
    );
    setOrders(updated);
    saveOrders(updated);
  };

  const handleCompleteOrder = (orderId: string) => {
    const updated = orders.map((o) =>
      o.id === orderId
        ? {
            ...o,
            status: "Cerrada" as const,
            closedAt: new Date().toISOString(),
            closedBy: user,
          }
        : o
    );
    setOrders(updated);
    saveOrders(updated);
  };

  const handleReopenClick = (orderId: string) => {
    if (!canReopen) {
      alert("Solo Supervisor/Admin pueden reabrir órdenes");
      return;
    }
    setSelectedOrderToReopen(orderId);
    setReopenReason("");
    setOpenReopenDialog(true);
  };

  const handleConfirmReopen = () => {
    if (!reopenReason.trim()) {
      alert("Indica el motivo de reapertura");
      return;
    }

    const updated = orders.map((o) =>
      o.id === selectedOrderToReopen
        ? {
            ...o,
            status: "Asignada" as const,
            closedAt: undefined,
            closedBy: undefined,
            reopenHistory: [
              ...(o.reopenHistory || []),
              {
                date: new Date().toISOString(),
                reason: reopenReason,
                reopenedBy: user,
              },
            ],
          }
        : o
    );

    setOrders(updated);
    saveOrders(updated);
    setOpenReopenDialog(false);
  };

  const activeOrders = orders.filter((o) => o.status !== "Cerrada");
  const closedOrders = orders.filter((o) => o.status === "Cerrada");

  return (
    <Box sx={{ p: 3 }}>
      <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "center", mb: 3 }}>
        <Typography variant="h4">🏭 Producción - Órdenes de Trabajo</Typography>
        {canCreateCorrective && (
          <Button variant="contained" startIcon={<AddIcon />} onClick={handleNewOrder}>
            Nueva Orden Correctiva
          </Button>
        )}
      </Stack>

      {/* Órdenes Activas */}
      <Typography variant="h6" sx={{ mb: 2 }}>
        Órdenes Activas ({activeOrders.length})
      </Typography>
      <Box sx={{ mb: 4, overflowX: "auto", border: "1px solid #e0e0e0", borderRadius: 1 }}>
        <Table>
          <TableHead>
            <TableRow sx={{ backgroundColor: "#f5f5f5" }}>
              <TableCell>N° Orden</TableCell>
              <TableCell>Tipo</TableCell>
              <TableCell>Descripción</TableCell>
              <TableCell>Estado</TableCell>
              <TableCell>Asignados a</TableCell>
              <TableCell>Creada</TableCell>
              <TableCell>Acciones</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {activeOrders.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} align="center" sx={{ py: 3 }}>
                  <Typography color="textSecondary">Sin órdenes activas</Typography>
                </TableCell>
              </TableRow>
            ) : (
              activeOrders.map((order) => (
                <TableRow key={order.id}>
                  <TableCell>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                      {order.orderNumber}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Chip label={order.type} size="small" />
                  </TableCell>
                  <TableCell>{order.description}</TableCell>
                  <TableCell>
                    <Chip
                      label={order.status}
                      size="small"
                      color={order.status === "En ejecución" ? "info" : "default"}
                    />
                  </TableCell>
                  <TableCell>
                    <Stack spacing={0.5}>
                      {order.assignedTo.map((tech) => (
                        <Chip key={tech} label={tech} size="small" variant="outlined" />
                      ))}
                    </Stack>
                  </TableCell>
                  <TableCell>{new Date(order.createdAt).toLocaleDateString()}</TableCell>
                  <TableCell>
                    {order.status === "Asignada" && (
                      <IconButton
                        size="small"
                        color="primary"
                        title="Iniciar"
                        onClick={() => handleStartOrder(order.id)}
                      >
                        <PlayArrowIcon />
                      </IconButton>
                    )}
                    {order.status === "En ejecución" && (
                      <IconButton
                        size="small"
                        color="success"
                        title="Completar"
                        onClick={() => handleCompleteOrder(order.id)}
                      >
                        <StopIcon />
                      </IconButton>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Box>

      {/* Órdenes Cerradas */}
      {role === "Supervisor" || role === "Administrador" ? (
        <>
          <Typography variant="h6" sx={{ mb: 2 }}>
            Órdenes Cerradas ({closedOrders.length})
          </Typography>
          <Box sx={{ overflowX: "auto", border: "1px solid #e0e0e0", borderRadius: 1 }}>
            <Table>
              <TableHead>
                <TableRow sx={{ backgroundColor: "#f5f5f5" }}>
                  <TableCell>N° Orden</TableCell>
                  <TableCell>Tipo</TableCell>
                  <TableCell>Descripción</TableCell>
                  <TableCell>Cerrada por</TableCell>
                  <TableCell>Fecha Cierre</TableCell>
                  <TableCell>Acciones</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {closedOrders.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} align="center" sx={{ py: 3 }}>
                      <Typography color="textSecondary">Sin órdenes cerradas</Typography>
                    </TableCell>
                  </TableRow>
                ) : (
                  closedOrders.map((order) => (
                    <TableRow key={order.id} sx={{ opacity: 0.7 }}>
                      <TableCell>
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>
                          {order.orderNumber}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Chip label={order.type} size="small" />
                      </TableCell>
                      <TableCell>{order.description}</TableCell>
                      <TableCell>{order.closedBy || "-"}</TableCell>
                      <TableCell>{new Date(order.closedAt || "").toLocaleDateString()}</TableCell>
                      <TableCell>
                        <Button
                          size="small"
                          onClick={() => handleReopenClick(order.id)}
                          disabled={!canReopen}
                        >
                          Reabrir
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </Box>
        </>
      ) : null}

      {/* Diálogo Nueva Orden */}
      <Dialog open={openDialog} onClose={() => setOpenDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{editingOrder ? "Editar Orden" : "Nueva Orden Correctiva"}</DialogTitle>
        <DialogContent sx={{ pt: 2 }}>
          <Stack spacing={2}>
            <TextField
              select
              label="Tipo de Orden"
              value={formData.type || "COR"}
              onChange={(e) => setFormData({ ...formData, type: e.target.value as any })}
              fullWidth
              disabled={!!editingOrder}
            >
              <MenuItem value="COR">Correctiva (61xxxxx)</MenuItem>
              <MenuItem value="PRE" disabled>
                Preventiva (51xxxxx) - Solo Planificador
              </MenuItem>
              <MenuItem value="OVH" disabled>
                OVH (71xxxxx) - Solo Planificador
              </MenuItem>
              <MenuItem value="GAR" disabled>
                Garantía (81xxxxx) - Solo Admin
              </MenuItem>
            </TextField>

            <TextField
              label="Descripción"
              value={formData.description || ""}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              fullWidth
              multiline
              rows={3}
            />

            <Box>
              <Typography variant="subtitle2" sx={{ mb: 1 }}>
                Asignar a Técnicos (uno o más)
              </Typography>
              {demoTechnicians.map((tech) => (
                <Button
                  key={tech.id}
                  variant={assignedTechs.includes(tech.id) ? "contained" : "outlined"}
                  size="small"
                  sx={{ mr: 1, mb: 1 }}
                  onClick={() => {
                    setAssignedTechs((prev) =>
                      prev.includes(tech.id) ? prev.filter((t) => t !== tech.id) : [...prev, tech.id]
                    );
                  }}
                >
                  {tech.name}
                </Button>
              ))}
            </Box>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenDialog(false)}>Cancelar</Button>
          <Button onClick={handleSaveOrder} variant="contained">
            Guardar
          </Button>
        </DialogActions>
      </Dialog>

      {/* Diálogo Reabrir Orden */}
      <Dialog open={openReopenDialog} onClose={() => setOpenReopenDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Reabrir Orden</DialogTitle>
        <DialogContent sx={{ pt: 2 }}>
          <TextField
            label="Motivo de Reapertura"
            value={reopenReason}
            onChange={(e) => setReopenReason(e.target.value)}
            fullWidth
            multiline
            rows={3}
            placeholder="Describe por qué se reabre esta orden..."
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenReopenDialog(false)}>Cancelar</Button>
          <Button onClick={handleConfirmReopen} variant="contained">
            Reabrir
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
