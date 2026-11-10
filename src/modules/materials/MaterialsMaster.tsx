import { useCallback, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import { Alert, Button, Chip, Grid, MenuItem, Paper, Stack, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography } from "@mui/material";
import { Add } from "@mui/icons-material";
import type { Role } from "../../app/roles";
import { can } from "../../app/permissions";
import { downloadTemplate, parseCsvRow } from "../../data/csv";
import { keys } from "../../data/keys";
import { MATERIAL_DOC_EXTENSIONS, addMaterialDocument, createMaterials, deleteMaterialDocument, materialDocTypes, readMaterialDocuments, updateMaterialParams, updateMaterialTechnical } from "../../data/materials";
import type { Incoterm, MaterialDocType, MaterialDocument, NewMaterialInput } from "../../data/materials";
import { useStoredValue } from "../../hooks/useStore";
import { getMaterialRows, isCritical } from "./materialRows";
import type { MaterialRow } from "./materialRows";

// master: alta de materiales (Ingeniería/Admin); params: edita solo reposición (Planificador/Compras); readonly: consulta.
export type MaterialsMode = "master" | "params" | "readonly";
type Props = { mode: MaterialsMode; user: string; role: Role; title?: string };
type DraftKey = "code" | "name" | "category" | "unit" | "reorderPoint" | "leadTimeDays" | "incoterm" | "minLot";

const incoterms: Incoterm[] = ["EXW", "FCA", "FOB", "CIF", "DAP", "DDP", "Otro"];
const emptyDraft: Record<DraftKey, string> = { code: "", name: "", category: "", unit: "", reorderPoint: "", leadTimeDays: "", incoterm: "", minLot: "" };
const csvHeaders = ["code", "name", "category", "unit", "reorderPoint", "leadTimeDays", "incoterm", "minLot"];
const num = (value: string) => (value.trim() === "" ? undefined : Number(value));

function toInput(get: (key: DraftKey) => string): NewMaterialInput {
  return {
    code: get("code"), name: get("name"), category: get("category"), unit: get("unit"),
    reorderPoint: Number(get("reorderPoint") || 0), leadTimeDays: num(get("leadTimeDays")),
    incoterm: (get("incoterm") || undefined) as Incoterm | undefined, minLot: num(get("minLot")),
  };
}

export default function MaterialsMaster({ mode, user, role, title = "Materiales y repuestos" }: Props) {
  const rows = useStoredValue<MaterialRow[]>(keys.materialMaster, useCallback(() => getMaterialRows(), []), [keys.warehouseBins]);
  const [draft, setDraft] = useState(emptyDraft);
  const [show, setShow] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [edit, setEdit] = useState<{ code: string; reorderPoint: string; leadTimeDays: string; incoterm: string; minLot: string } | null>(null);
  const canCreate = mode === "master" && can(role, "material.create");
  const canParams = mode === "params" && can(role, "material.editParams");
  const canTech = mode === "master" && can(role, "material.edit");
  const canDocs = mode === "master" && can(role, "material.documents");
  const [tech, setTech] = useState<{ code: string; name: string; unit: string; category: string; description: string; specification: string } | null>(null);
  const [docCode, setDocCode] = useState<string | null>(null);
  const [docType, setDocType] = useState<MaterialDocType>("Ficha técnica");
  const [docName, setDocName] = useState("");
  const [docDate, setDocDate] = useState(() => new Date().toISOString().slice(0, 10));
  const documents = useStoredValue<MaterialDocument[]>(keys.materialDocuments, useCallback(() => readMaterialDocuments(), []));
  const actor = { user, role };

  const save = (event: FormEvent) => {
    event.preventDefault();
    const result = createMaterials([toInput((key) => draft[key])], actor);
    if (!result.ok) { setError(result.error); setMessage(""); return; }
    setDraft(emptyDraft); setShow(false); setError(""); setMessage("Material creado.");
  };

  const importCsv = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    setError(""); setMessage("");
    if (!file) return;
    if (role !== "Administrador") { setError("Solo el Administrador puede realizar cargas masivas."); return; }
    try {
      const lines = (await file.text()).replace(/^﻿/, "").split(/\r?\n/).filter((line) => line.trim());
      if (lines.length < 2) throw new Error("El archivo CSV no contiene materiales para importar.");
      const headers = parseCsvRow(lines[0]).map((header) => header.trim());
      const missing = ["code", "name", "category", "unit", "reorderPoint"].filter((header) => !headers.includes(header));
      if (missing.length) throw new Error(`Faltan columnas requeridas: ${missing.join(", ")}.`);
      const inputs = lines.slice(1).map((line) => {
        const values = parseCsvRow(line);
        return toInput((key) => values[headers.indexOf(key)]?.trim() ?? "");
      });
      const result = createMaterials(inputs, actor);
      if (!result.ok) throw new Error(result.error);
      setMessage(`${result.value.length} material(es) importados.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo importar el archivo CSV.");
    }
  };

  const saveParams = () => {
    if (!edit) return;
    const result = updateMaterialParams(edit.code, {
      reorderPoint: Number(edit.reorderPoint), leadTimeDays: Number(edit.leadTimeDays),
      incoterm: (edit.incoterm || undefined) as Incoterm | undefined, minLot: num(edit.minLot),
    }, actor);
    if (!result.ok) { setError(result.error); return; }
    setError(""); setMessage(`Parámetros de ${edit.code} guardados.`); setEdit(null);
  };

  const saveTech = () => {
    if (!tech) return;
    const { code, ...patch } = tech;
    const result = updateMaterialTechnical(code, patch, actor);
    if (!result.ok) { setError(result.error); return; }
    setError(""); setMessage(`Datos técnicos de ${code} guardados.`); setTech(null);
  };

  const uploadDoc = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !docCode) return;
    setError(""); setMessage("");
    const reader = new FileReader();
    reader.onerror = () => setError("No se pudo leer el archivo.");
    reader.onload = () => {
      const result = addMaterialDocument({
        materialCode: docCode, type: docType, name: docName.trim() || file.name, date: docDate,
        fileName: file.name, size: file.size, dataUrl: String(reader.result),
      }, actor);
      if (!result.ok) { setError(result.error); return; }
      setDocName(""); setMessage("Documento cargado.");
    };
    reader.readAsDataURL(file);
  };

  const removeDoc = (id: string) => {
    const result = deleteMaterialDocument(id, actor);
    if (!result.ok) { setError(result.error); return; }
    setError(""); setMessage("Documento eliminado.");
  };

  const downloadDoc = (doc: MaterialDocument) => {
    const link = document.createElement("a");
    link.href = doc.dataUrl; link.download = doc.fileName; link.click();
  };

  const field = (label: string, key: DraftKey, xs = 2, type = "text", required = false) => (
    <Grid size={{ xs: 12, sm: xs }}>
      <TextField label={label} type={type} value={draft[key]} required={required} fullWidth
        onChange={(event) => setDraft((current) => ({ ...current, [key]: event.target.value }))}
        slotProps={type === "number" ? { htmlInput: { min: 0, step: "any" } } : undefined} />
    </Grid>
  );

  return (
    <Stack spacing={3}>
      <Stack direction={{ xs: "column", sm: "row" }} sx={{ justifyContent: "space-between", alignItems: { xs: "flex-start", sm: "center" } }} spacing={2}>
        <Typography variant="h5" sx={{ fontWeight: 700 }}>{title}</Typography>
        {canCreate && <Button variant="contained" startIcon={<Add />} onClick={() => setShow((visible) => !visible)} sx={{ borderRadius: 2, textTransform: "none" }}>Nuevo material</Button>}
      </Stack>
      {mode === "readonly" && <Alert severity="info">Consulta de solo lectura.</Alert>}
      {error && <Alert severity="error">{error}</Alert>}
      {message && <Alert severity="success">{message}</Alert>}
      {canCreate && role === "Administrador" && (
        <Paper sx={{ p: 2 }}>
          <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
            <Button variant="outlined" onClick={() => downloadTemplate("plantilla_maestro_materiales.csv", csvHeaders, ["MAT-001", "Repuesto de ejemplo", "Mecánica", "unidad", 5, 7, "DAP", 1])}>Descargar plantilla CSV</Button>
            <Button component="label" variant="outlined">Carga masiva de materiales · solo Administrador
              <input hidden type="file" accept=".csv,text/csv" onChange={importCsv} />
            </Button>
          </Stack>
        </Paper>
      )}
      {show && canCreate && (
        <Paper component="form" onSubmit={save} sx={{ p: 3 }}>
          <Typography variant="h6" sx={{ mb: 2 }}>Nuevo material en el maestro</Typography>
          <Grid container spacing={2}>
            {field("Código", "code", 2, "text", true)}{field("Descripción", "name", 4, "text", true)}
            {field("Categoría", "category", 3, "text", true)}{field("Unidad", "unit", 3, "text", true)}
            {field("Punto de reposición", "reorderPoint", 3, "number", true)}{field("Lead time (días)", "leadTimeDays", 3, "number")}
            <Grid size={{ xs: 12, sm: 3 }}>
              <TextField select label="Incoterm" value={draft.incoterm} fullWidth onChange={(event) => setDraft((current) => ({ ...current, incoterm: event.target.value }))}>
                <MenuItem value="">Sin definir</MenuItem>
                {incoterms.map((item) => <MenuItem key={item} value={item}>{item}</MenuItem>)}
              </TextField>
            </Grid>
            {field("Lote mínimo", "minLot", 3, "number")}
            <Grid size={{ xs: 12 }}><Button type="submit" variant="contained">Guardar material</Button></Grid>
          </Grid>
        </Paper>
      )}
      <Paper sx={{ p: 2, overflowX: "auto" }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Código</TableCell><TableCell>Material</TableCell><TableCell>Categoría</TableCell><TableCell>Unidad</TableCell>
              <TableCell align="right">Disponible</TableCell><TableCell align="right">Bloqueado QC</TableCell><TableCell align="right">En tránsito</TableCell>
              <TableCell align="right">Reposición</TableCell><TableCell align="right">Lead time</TableCell><TableCell>Incoterm</TableCell><TableCell align="right">Lote mín.</TableCell>
              <TableCell>Estado</TableCell>{(canParams || canTech) && <TableCell />}<TableCell>Documentos</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((item) => {
              const editing = canParams && edit?.code === item.code;
              const techEditing = canTech && tech?.code === item.code;
              const cell = (key: "reorderPoint" | "leadTimeDays" | "minLot", value: number | undefined) => editing && edit
                ? <TextField size="small" type="number" value={edit[key]} onChange={(event) => setEdit({ ...edit, [key]: event.target.value })} sx={{ width: 90 }} />
                : (value ?? "-");
              return (
                <TableRow key={item.code}>
                  <TableCell>{item.code}</TableCell>
                  <TableCell>{techEditing && tech ? (
                    <Stack spacing={1}>
                      <TextField size="small" label="Nombre" value={tech.name} onChange={(event) => setTech({ ...tech, name: event.target.value })} />
                      <TextField size="small" label="Descripción" value={tech.description} onChange={(event) => setTech({ ...tech, description: event.target.value })} />
                      <TextField size="small" label="Especificación" value={tech.specification} onChange={(event) => setTech({ ...tech, specification: event.target.value })} />
                    </Stack>
                  ) : (<>{item.name}{item.description && <Typography variant="caption" sx={{ display: "block" }}>{item.description}</Typography>}{item.specification && <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>{item.specification}</Typography>}</>)}</TableCell>
                  <TableCell>{techEditing && tech ? <TextField size="small" value={tech.category} onChange={(event) => setTech({ ...tech, category: event.target.value })} sx={{ width: 120 }} /> : item.category}</TableCell>
                  <TableCell>{techEditing && tech ? <TextField size="small" value={tech.unit} onChange={(event) => setTech({ ...tech, unit: event.target.value })} sx={{ width: 90 }} /> : item.unit}</TableCell>
                  <TableCell align="right">{item.available}</TableCell><TableCell align="right">{item.quality}</TableCell><TableCell align="right">{item.inTransit}</TableCell>
                  <TableCell align="right">{cell("reorderPoint", item.reorderPoint)}</TableCell>
                  <TableCell align="right">{cell("leadTimeDays", item.leadTimeDays)}</TableCell>
                  <TableCell>{editing && edit
                    ? <TextField select size="small" value={edit.incoterm} onChange={(event) => setEdit({ ...edit, incoterm: event.target.value })} sx={{ minWidth: 90 }}>
                      <MenuItem value="">-</MenuItem>{incoterms.map((name) => <MenuItem key={name} value={name}>{name}</MenuItem>)}
                    </TextField>
                    : (item.incoterm ?? "-")}</TableCell>
                  <TableCell align="right">{cell("minLot", item.minLot)}</TableCell>
                  <TableCell>
                    <Chip size="small" label={item.reorderPoint <= 0 ? "Sin mínimo" : isCritical(item) ? "Crítico" : "OK"}
                      color={item.reorderPoint <= 0 ? "default" : isCritical(item) ? "error" : "success"} />
                  </TableCell>
                  {canTech && (
                    <TableCell>
                      {techEditing
                        ? <Stack direction="row" spacing={1}><Button size="small" variant="contained" onClick={saveTech}>Guardar</Button><Button size="small" onClick={() => setTech(null)}>Cancelar</Button></Stack>
                        : <Button size="small" disabled={item.category === "Sin categoría"} onClick={() => setTech({ code: item.code, name: item.name, unit: item.unit, category: item.category, description: item.description ?? "", specification: item.specification ?? "" })}>Editar</Button>}
                    </TableCell>
                  )}
                  <TableCell><Button size="small" onClick={() => setDocCode(docCode === item.code ? null : item.code)}>{documents.filter((doc) => doc.materialCode === item.code).length} doc.</Button></TableCell>
                  {canParams && (
                    <TableCell>
                      {editing
                        ? <Stack direction="row" spacing={1}><Button size="small" variant="contained" onClick={saveParams}>Guardar</Button><Button size="small" onClick={() => setEdit(null)}>Cancelar</Button></Stack>
                        : <Button size="small" disabled={item.category === "Sin categoría"} onClick={() => setEdit({ code: item.code, reorderPoint: String(item.reorderPoint), leadTimeDays: String(item.leadTimeDays), incoterm: item.incoterm ?? "", minLot: item.minLot === undefined ? "" : String(item.minLot) })}>Editar</Button>}
                    </TableCell>
                  )}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Paper>
      {docCode && (
        <Paper sx={{ p: 2 }}>
          <Typography variant="h6" sx={{ mb: 1 }}>Documentos de {docCode}</Typography>
          {canDocs && (
            <Stack direction={{ xs: "column", sm: "row" }} spacing={1} sx={{ mb: 2 }}>
              <TextField select size="small" label="Tipo" value={docType} onChange={(event) => setDocType(event.target.value as MaterialDocType)} sx={{ minWidth: 160 }}>
                {materialDocTypes.map((type) => <MenuItem key={type} value={type}>{type}</MenuItem>)}
              </TextField>
              <TextField size="small" label="Nombre" value={docName} onChange={(event) => setDocName(event.target.value)} />
              <TextField size="small" label="Fecha" type="date" value={docDate} onChange={(event) => setDocDate(event.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
              <Button component="label" variant="outlined">Subir archivo (máx. 2 MB)
                <input hidden type="file" accept={MATERIAL_DOC_EXTENSIONS.map((ext) => `.${ext}`).join(",")} onChange={uploadDoc} />
              </Button>
            </Stack>
          )}
          <Table size="small">
            <TableHead><TableRow><TableCell>Tipo</TableCell><TableCell>Nombre</TableCell><TableCell>Fecha</TableCell><TableCell>Archivo</TableCell><TableCell /></TableRow></TableHead>
            <TableBody>
              {documents.filter((doc) => doc.materialCode === docCode).map((doc) => (
                <TableRow key={doc.id}>
                  <TableCell>{doc.type}</TableCell><TableCell>{doc.name}</TableCell><TableCell>{doc.date}</TableCell><TableCell>{doc.fileName}</TableCell>
                  <TableCell>
                    <Stack direction="row" spacing={1}>
                      <Button size="small" component="a" href={doc.dataUrl} target="_blank" rel="noreferrer">Ver</Button>
                      <Button size="small" onClick={() => downloadDoc(doc)}>Descargar</Button>
                      {canDocs && <Button size="small" color="error" onClick={() => removeDoc(doc.id)}>Eliminar</Button>}
                    </Stack>
                  </TableCell>
                </TableRow>
              ))}
              {documents.every((doc) => doc.materialCode !== docCode) && <TableRow><TableCell colSpan={5}>Sin documentos.</TableCell></TableRow>}
            </TableBody>
          </Table>
        </Paper>
      )}
    </Stack>
  );
}
