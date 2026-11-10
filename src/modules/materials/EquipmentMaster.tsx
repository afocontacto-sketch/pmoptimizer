import { useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import { Alert, Button, MenuItem, Paper, Stack, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography } from "@mui/material";
import { can } from "../../app/permissions";
import type { Role } from "../../app/roles";
import { downloadTemplate, parseCsvRow } from "../../data/csv";
import { keys } from "../../data/keys";
import { readJson } from "../../data/storage";
import { addEquipment, readEquipmentMaster } from "../masterData";
import type { EquipmentMaster as Equipment } from "../masterData";

type ContractOption = { code: string; client: string };

function readContracts(): ContractOption[] {
  const contracts = new Map<string, ContractOption>([["CT1234", { code: "CT1234", client: "Fiat Chile" }]]);
  const list = readJson<unknown>(keys.clients, []);
  if (!Array.isArray(list)) return [...contracts.values()];
  for (const item of list) {
    if (typeof item !== "object" || item === null || !("contractCode" in item) || typeof item.contractCode !== "string" || !item.contractCode.trim()) continue;
    contracts.set(item.contractCode, { code: item.contractCode, client: "name" in item && typeof item.name === "string" ? item.name : "Cliente" });
  }
  return [...contracts.values()];
}

const emptyDraft = { code: "", serialNumber: "", name: "", contractCode: "" };

// Maestro de equipos y activos; solo edita quien tiene equipment.edit (la carga masiva, solo Administrador).
export default function EquipmentMaster({ user, role }: { user: string; role: Role }) {
  const [equipment, setEquipment] = useState(readEquipmentMaster);
  const [draft, setDraft] = useState(emptyDraft);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const contracts = readContracts();
  const contractCodes = contracts.map((contract) => contract.code);
  const canEdit = can(role, "equipment.edit");

  const finish = (result: ReturnType<typeof addEquipment>) => {
    if (!result.ok) { setError(result.error); setMessage(""); return false; }
    setEquipment(readEquipmentMaster()); setError(""); setMessage(`${result.value} equipo(s) agregados al maestro.`);
    return true;
  };

  const save = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const item: Equipment = { code: draft.code.trim(), serialNumber: draft.serialNumber.trim(), name: draft.name.trim(), contractCode: draft.contractCode };
    if (finish(addEquipment([item], contractCodes, { user, role }))) setDraft(emptyDraft);
  };

  const importCsv = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    setError(""); setMessage("");
    if (!file) return;
    if (role !== "Administrador") { setError("Solo el Administrador puede realizar cargas masivas."); return; }
    try {
      const lines = (await file.text()).replace(/^﻿/, "").split(/\r?\n/).filter((line) => line.trim());
      if (lines.length < 2) throw new Error("El archivo CSV no contiene equipos para importar.");
      const headers = parseCsvRow(lines[0]).map((header) => header.trim());
      const missing = ["code", "serialNumber", "name", "contractCode"].filter((header) => !headers.includes(header));
      if (missing.length) throw new Error(`Faltan columnas requeridas: ${missing.join(", ")}.`);
      const items = lines.slice(1).map((line): Equipment => {
        const values = parseCsvRow(line);
        const get = (header: string) => values[headers.indexOf(header)]?.trim() ?? "";
        return { code: get("code"), serialNumber: get("serialNumber"), name: get("name"), contractCode: get("contractCode") };
      });
      finish(addEquipment(items, contractCodes, { user, role }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo importar el archivo CSV.");
    }
  };

  const bind = (key: keyof typeof emptyDraft) => ({ value: draft[key], onChange: (event: ChangeEvent<HTMLInputElement>) => setDraft((current) => ({ ...current, [key]: event.target.value })) });

  return (
    <Paper sx={{ p: 3 }}>
      <Typography variant="h6" sx={{ mb: 2 }}>Maestro de equipos y activos</Typography>
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {message && <Alert severity="success" sx={{ mb: 2 }}>{message}</Alert>}
      {!canEdit && <Alert severity="info" sx={{ mb: 2 }}>Consulta de solo lectura.</Alert>}
      {canEdit && (
        <>
          {role === "Administrador" && (
            <Stack direction={{ xs: "column", sm: "row" }} spacing={1} sx={{ mb: 2 }}>
              <Button variant="outlined" onClick={() => downloadTemplate("plantilla_maestro_equipos.csv", ["code", "serialNumber", "name", "contractCode"], ["VEH-004", "SERIE-001", "Equipo de ejemplo", "CT1234"])}>Descargar plantilla CSV</Button>
              <Button component="label" variant="outlined">Carga masiva de equipos · solo Administrador
                <input hidden type="file" accept=".csv,text/csv" onChange={importCsv} />
              </Button>
            </Stack>
          )}
          <Stack component="form" direction={{ xs: "column", md: "row" }} spacing={1} sx={{ mb: 2 }} onSubmit={save}>
            <TextField size="small" label="Código de equipo" required {...bind("code")} />
            <TextField size="small" label="Número de serie" required {...bind("serialNumber")} />
            <TextField size="small" label="Descripción del activo" required fullWidth {...bind("name")} />
            <TextField select size="small" label="Contrato asociado" sx={{ minWidth: 220 }} {...bind("contractCode")}>
              <MenuItem value="">Sin contrato</MenuItem>
              {contracts.map((contract) => <MenuItem key={contract.code} value={contract.code}>{contract.code} · {contract.client}</MenuItem>)}
            </TextField>
            <Button type="submit" variant="outlined">Agregar al maestro</Button>
          </Stack>
        </>
      )}
      <Table size="small">
        <TableHead><TableRow><TableCell>Código</TableCell><TableCell>Número de serie</TableCell><TableCell>Descripción del activo</TableCell><TableCell>Contrato asociado</TableCell></TableRow></TableHead>
        <TableBody>{equipment.map((item) => (
          <TableRow key={item.code}>
            <TableCell>{item.code}</TableCell><TableCell>{item.serialNumber || "-"}</TableCell>
            <TableCell>{item.name}</TableCell><TableCell>{item.contractCode || "Sin contrato"}</TableCell>
          </TableRow>
        ))}</TableBody>
      </Table>
    </Paper>
  );
}
