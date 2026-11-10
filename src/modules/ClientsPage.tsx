import { keys } from "../data/keys";
import { can } from "../app/permissions";
import type { Role } from "../app/roles";
import { validateContractDates, wbsSuffixes } from "../data/contracts";
import { useEffect, useState } from "react";
import type { ChangeEvent } from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
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
  Add,
  Delete as DeleteIcon,
  Download as DownloadIcon,
  Edit as EditIcon,
  Upload as UploadIcon,
} from "@mui/icons-material";

export const clientsStorageKey = keys.clientsV2;
export const contractFilesStorageKey = keys.contractFiles;

export type WbsElement = {
  id: string;
  code: string;
  type: "PRE" | "OVH" | "COR" | "GAR" | "REP" | "IND" | "ESPERA";
  description: string;
};

export type Contract = {
  id: string;
  code: string;
  name: string;
  clientId: string;
  startDate: string;
  endDate: string;
  budget: number;
  wbs: WbsElement[];
  createdAt: string;
};

export type Client = {
  id: string;
  code: string;
  name: string;
  sector: string;
  status: "Activo" | "Inactivo";
  rut?: string;
  contact?: {
    name: string;
    phone: string;
    email: string;
  };
  contracts: Contract[];
  contractFileId?: string;
  contractFileName?: string;
  contractFileDate?: string;
  createdAt: string;
};

type ContractFile = {
  id: string;
  clientId: string;
  fileName: string;
  fileData: string;
  uploadDate: string;
};

const sectors = ["Retail", "Minería", "Manufactura", "Servicios", "Transporte", "Construcción", "Tecnología"];
const wbsTypes: readonly string[] = wbsSuffixes;

function generateId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function readClients(): Client[] {
  try {
    const raw = localStorage.getItem(clientsStorageKey);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveClients(clients: Client[]): void {
  localStorage.setItem(clientsStorageKey, JSON.stringify(clients));
}

function readContractFiles(): Map<string, ContractFile> {
  try {
    const raw = localStorage.getItem(contractFilesStorageKey);
    const files = raw ? JSON.parse(raw) : [];
    return new Map(files.map((f: ContractFile) => [f.id, f]));
  } catch {
    return new Map();
  }
}

function saveContractFiles(files: Map<string, ContractFile>): void {
  localStorage.setItem(contractFilesStorageKey, JSON.stringify(Array.from(files.values())));
}

export default function ClientsPage({ role }: { role: Role }) {
  const canEdit = can(role, "client.edit");
  const [contractError, setContractError] = useState("");
  const [clients, setClients] = useState<Client[]>([]);
  const [openDialog, setOpenDialog] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [formData, setFormData] = useState<Partial<Client>>({});
  const [contractFiles] = useState(readContractFiles());
  const [selectedClientForContract, setSelectedClientForContract] = useState<string>("");
  const [openContractDialog, setOpenContractDialog] = useState(false);
  const [newContract, setNewContract] = useState<Partial<Contract>>({
    wbs: [
      { id: generateId("WBS"), code: "PRE-001", type: "PRE", description: "Mantenimiento Preventivo" },
      { id: generateId("WBS"), code: "COR-001", type: "COR", description: "Mantenimiento Correctivo" },
    ],
  });

  useEffect(() => {
    setClients(readClients());
  }, []);

  const handleNewClient = () => {
    setEditingClient(null);
    setFormData({
      status: "Activo",
      contracts: [],
    });
    setOpenDialog(true);
  };

  const handleEditClient = (client: Client) => {
    setEditingClient(client);
    setFormData(client);
    setOpenDialog(true);
  };

  const handleSaveClient = () => {
    if (!formData.name || !formData.sector) {
      alert("Por favor completa nombre y sector");
      return;
    }

    let updated: Client[];
    if (editingClient) {
      updated = clients.map((c) =>
        c.id === editingClient.id
          ? {
              ...c,
              ...formData,
              contracts: editingClient.contracts,
            }
          : c
      );
    } else {
      const newClient: Client = {
        id: generateId("CLI"),
        code: `CLI-${Date.now().toString().slice(-6)}`,
        name: formData.name || "",
        sector: formData.sector || "",
        status: formData.status || "Activo",
        rut: formData.rut,
        contact: formData.contact,
        contracts: [],
        createdAt: new Date().toISOString(),
      };
      updated = [...clients, newClient];
    }

    setClients(updated);
    saveClients(updated);
    setOpenDialog(false);
  };

  const handleDeleteClient = (clientId: string) => {
    if (confirm("¿Eliminar cliente? (solo si no tiene órdenes activas)")) {
      const updated = clients.filter((c) => c.id !== clientId);
      setClients(updated);
      saveClients(updated);
    }
  };

  const handleAddContract = (clientId: string) => {
    setSelectedClientForContract(clientId);
    setContractError("");
    setNewContract({
      wbs: [
        { id: generateId("WBS"), code: "PRE-001", type: "PRE", description: "Mantenimiento Preventivo" },
        { id: generateId("WBS"), code: "COR-001", type: "COR", description: "Mantenimiento Correctivo" },
      ],
    });
    setOpenContractDialog(true);
  };

  const handleSaveContract = () => {
    if (!newContract.name || !newContract.code || !newContract.budget) {
      alert("Por favor completa nombre, código y presupuesto");
      return;
    }
    if (!canEdit) return;
    const dateError = validateContractDates(newContract.startDate, newContract.endDate);
    if (dateError) {
      setContractError(dateError);
      return;
    }
    setContractError("");

    const contract: Contract = {
      id: generateId("CTR"),
      code: newContract.code || "",
      name: newContract.name || "",
      clientId: selectedClientForContract,
      startDate: newContract.startDate ?? "",
      endDate: newContract.endDate ?? "",
      budget: newContract.budget || 0,
      wbs: newContract.wbs || [],
      createdAt: new Date().toISOString(),
    };

    const updated = clients.map((c) =>
      c.id === selectedClientForContract
        ? {
            ...c,
            contracts: [...(c.contracts || []), contract],
          }
        : c
    );

    setClients(updated);
    saveClients(updated);
    setOpenContractDialog(false);
  };

  const handleFileUpload = (clientId: string, event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const fileData = e.target?.result as string;
      const contractFile: ContractFile = {
        id: generateId("FILE"),
        clientId,
        fileName: file.name,
        fileData,
        uploadDate: new Date().toISOString(),
      };

      const updated = clients.map((c) =>
        c.id === clientId
          ? {
              ...c,
              contractFileId: contractFile.id,
              contractFileName: file.name,
              contractFileDate: new Date().toISOString(),
            }
          : c
      );

      setClients(updated);
      saveClients(updated);

      const files = readContractFiles();
      files.set(contractFile.id, contractFile);
      saveContractFiles(files);
    };
    reader.readAsDataURL(file);
  };

  const handleDownloadFile = (fileId: string | undefined) => {
    if (!fileId) return;
    const file = contractFiles.get(fileId);
    if (!file) return;

    const link = document.createElement("a");
    link.href = file.fileData;
    link.download = file.fileName;
    link.click();
  };

  return (
    <Box sx={{ p: 3 }}>
      <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "center", mb: 3 }}>
        <Typography variant="h4">Gestión de Clientes</Typography>
        {canEdit && (
          <Button variant="contained" startIcon={<Add />} onClick={handleNewClient}>
            Nuevo Cliente
          </Button>
        )}
      </Stack>

      <Stack direction="column" spacing={2}>
        {clients.map((client) => (
          <Box
            key={client.id}
            sx={{
              p: 2,
              border: "1px solid #e0e0e0",
              borderRadius: 1,
              backgroundColor: "#fafafa",
            }}
          >
            <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "flex-start", mb: 2 }}>
              <Box>
                <Typography variant="h6">{client.name}</Typography>
                <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
                  <Chip label={`Código: ${client.code}`} size="small" />
                  <Chip label={`Sector: ${client.sector}`} size="small" />
                  <Chip
                    label={client.status}
                    size="small"
                    color={client.status === "Activo" ? "success" : "default"}
                  />
                </Stack>
              </Box>
              {canEdit && (
                <Stack direction="row" spacing={1}>
                  <IconButton size="small" onClick={() => handleEditClient(client)}>
                    <EditIcon />
                  </IconButton>
                  <IconButton size="small" color="error" onClick={() => handleDeleteClient(client.id)}>
                    <DeleteIcon />
                  </IconButton>
                </Stack>
              )}
            </Stack>

            {client.contact && (
              <Box sx={{ mb: 2 }}>
                <Typography variant="body2" color="textSecondary">
                  Contacto: {client.contact.name} | {client.contact.phone} | {client.contact.email}
                </Typography>
              </Box>
            )}

            <Divider sx={{ my: 2 }} />

            <Typography variant="subtitle2" sx={{ mb: 1 }}>
              Contratos ({client.contracts.length})
            </Typography>
            {client.contracts.length > 0 ? (
              <Table size="small" sx={{ mb: 2 }}>
                <TableHead>
                  <TableRow sx={{ backgroundColor: "#f5f5f5" }}>
                    <TableCell>Código</TableCell>
                    <TableCell>Nombre</TableCell>
                    <TableCell>Vigencia</TableCell>
                    <TableCell align="right">Presupuesto</TableCell>
                    <TableCell>WBS</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {client.contracts.map((contract) => (
                    <TableRow key={contract.id}>
                      <TableCell>{contract.code}</TableCell>
                      <TableCell>{contract.name}</TableCell>
                      <TableCell>
                        {contract.startDate} a {contract.endDate}
                      </TableCell>
                      <TableCell align="right">${contract.budget.toLocaleString()}</TableCell>
                      <TableCell>
                        {contract.wbs.length} elementos ({contract.wbs.map((w) => w.type).join(", ")})
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
                  <Typography variant="body2" color="textSecondary" sx={{ mb: 2 }}>
                    Sin contratos
                  </Typography>
                )}

                {canEdit && (
                  <Button
                    size="small"
                    variant="outlined"
                    startIcon={<Add />}
                    onClick={() => handleAddContract(client.id)}
                    sx={{ mr: 1 }}
                  >
                    Agregar Contrato
                  </Button>
                )}

                <Divider sx={{ my: 2 }} />

                <Typography variant="subtitle2" sx={{ mb: 1 }}>
                  Archivo de Contrato
                </Typography>
                {client.contractFileName ? (
                  <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                    <Typography variant="body2">
                      📄 {client.contractFileName} ({new Date(client.contractFileDate || "").toLocaleDateString()})
                    </Typography>
                    <Button
                      size="small"
                      startIcon={<DownloadIcon />}
                      onClick={() => handleDownloadFile(client.contractFileId)}
                    >
                      Descargar
                    </Button>
                    <Button component="label" size="small" startIcon={<UploadIcon />}>
                      Reemplazar
                      <input
                        hidden
                        type="file"
                        accept=".pdf,.doc,.docx,.xls,.xlsx"
                        onChange={(e) => handleFileUpload(client.id, e)}
                      />
                    </Button>
                  </Stack>
                ) : (
                  <Button component="label" size="small" variant="outlined" startIcon={<UploadIcon />}>
                    Cargar Contrato
                    <input
                      hidden
                      type="file"
                      accept=".pdf,.doc,.docx,.xls,.xlsx"
                      onChange={(e) => handleFileUpload(client.id, e)}
                    />
                  </Button>
                )}
            </Box>
          ))}
        </Stack>

      {/* Diálogo Editar/Crear Cliente */}
      <Dialog open={openDialog} onClose={() => setOpenDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{editingClient ? "Editar Cliente" : "Nuevo Cliente"}</DialogTitle>
        <DialogContent sx={{ pt: 2 }}>
          <Stack spacing={2}>
            <TextField
              label="Nombre del Cliente"
              value={formData.name || ""}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              fullWidth
            />
            <TextField
              label="RUT/Identificación"
              value={formData.rut || ""}
              onChange={(e) => setFormData({ ...formData, rut: e.target.value })}
              fullWidth
            />
            <TextField
              select
              label="Sector"
              value={formData.sector || ""}
              onChange={(e) => setFormData({ ...formData, sector: e.target.value })}
              fullWidth
            >
              {sectors.map((s) => (
                <MenuItem key={s} value={s}>
                  {s}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              select
              label="Estado"
              value={formData.status || "Activo"}
              onChange={(e) => setFormData({ ...formData, status: e.target.value as "Activo" | "Inactivo" })}
              fullWidth
            >
              <MenuItem value="Activo">Activo</MenuItem>
              <MenuItem value="Inactivo">Inactivo</MenuItem>
            </TextField>

            <Box sx={{ pt: 2 }}>
              <Typography variant="subtitle2" sx={{ mb: 1 }}>
                Contacto Principal
              </Typography>
              <TextField
                label="Nombre de Contacto"
                value={formData.contact?.name || ""}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    contact: { name: e.target.value, phone: formData.contact?.phone || "", email: formData.contact?.email || "" },
                  })
                }
                fullWidth
                size="small"
                sx={{ mb: 1 }}
              />
              <TextField
                label="Teléfono"
                value={formData.contact?.phone || ""}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    contact: { name: formData.contact?.name || "", phone: e.target.value, email: formData.contact?.email || "" },
                  })
                }
                fullWidth
                size="small"
                sx={{ mb: 1 }}
              />
              <TextField
                label="Email"
                type="email"
                value={formData.contact?.email || ""}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    contact: { name: formData.contact?.name || "", phone: formData.contact?.phone || "", email: e.target.value },
                  })
                }
                fullWidth
                size="small"
              />
            </Box>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenDialog(false)}>Cancelar</Button>
          <Button onClick={handleSaveClient} variant="contained">
            Guardar
          </Button>
        </DialogActions>
      </Dialog>

      {/* Diálogo Nuevo Contrato */}
      <Dialog open={openContractDialog} onClose={() => setOpenContractDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Nuevo Contrato</DialogTitle>
        <DialogContent sx={{ pt: 2 }}>
          <Stack spacing={2}>
            {contractError && <Alert severity="error">{contractError}</Alert>}
            <TextField
              label="Código de Contrato"
              value={newContract.code || ""}
              onChange={(e) => setNewContract({ ...newContract, code: e.target.value })}
              fullWidth
              placeholder="CTR-001"
            />
            <TextField
              label="Nombre/Descripción"
              value={newContract.name || ""}
              onChange={(e) => setNewContract({ ...newContract, name: e.target.value })}
              fullWidth
            />
            <TextField
              label="Fecha Inicio"
              required
              value={newContract.startDate || ""}
              onChange={(e) => setNewContract({ ...newContract, startDate: e.target.value })}
              fullWidth
              slotProps={{ htmlInput: { type: "date" }, inputLabel: { shrink: true } }}
            />
            <TextField
              label="Fecha Fin"
              required
              value={newContract.endDate || ""}
              onChange={(e) => setNewContract({ ...newContract, endDate: e.target.value })}
              fullWidth
              slotProps={{ htmlInput: { type: "date" }, inputLabel: { shrink: true } }}
            />
            <TextField
              label="Presupuesto Total"
              type="number"
              value={newContract.budget || ""}
              onChange={(e) => setNewContract({ ...newContract, budget: parseInt(e.target.value) || 0 })}
              fullWidth
            />

            <Box sx={{ pt: 2 }}>
              <Typography variant="subtitle2" sx={{ mb: 1 }}>
                Configuración WBS
              </Typography>
              {newContract.wbs?.map((wbs, idx) => (
                <Stack key={wbs.id} direction="row" spacing={1} sx={{ mb: 1 }}>
                  <TextField
                    label="Código"
                    value={wbs.code}
                    onChange={(e) => {
                      const updated = [...(newContract.wbs || [])];
                      updated[idx].code = e.target.value;
                      setNewContract({ ...newContract, wbs: updated });
                    }}
                    size="small"
                    sx={{ flex: 0.4 }}
                  />
                  <TextField
                    select
                    label="Tipo"
                    value={wbs.type}
                    onChange={(e) => {
                      const updated = [...(newContract.wbs || [])];
                      updated[idx].type = e.target.value as any;
                      setNewContract({ ...newContract, wbs: updated });
                    }}
                    size="small"
                    sx={{ flex: 0.3 }}
                  >
                    {wbsTypes.map((t) => (
                      <MenuItem key={t} value={t}>
                        {t}
                      </MenuItem>
                    ))}
                  </TextField>
                  <TextField
                    label="Descripción"
                    value={wbs.description}
                    onChange={(e) => {
                      const updated = [...(newContract.wbs || [])];
                      updated[idx].description = e.target.value;
                      setNewContract({ ...newContract, wbs: updated });
                    }}
                    size="small"
                    sx={{ flex: 0.9 }}
                  />
                </Stack>
              ))}
              <Button
                size="small"
                onClick={() =>
                  setNewContract({
                    ...newContract,
                    wbs: [
                      ...(newContract.wbs || []),
                      {
                        id: generateId("WBS"),
                        code: "",
                        type: "PRE",
                        description: "",
                      },
                    ],
                  })
                }
              >
                + Agregar WBS
              </Button>
            </Box>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenContractDialog(false)}>Cancelar</Button>
          <Button onClick={handleSaveContract} variant="contained">
            Guardar Contrato
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
