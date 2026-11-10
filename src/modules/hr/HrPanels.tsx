import { useEffect, useState } from "react";
import type { ChangeEvent, Dispatch, SetStateAction } from "react";
import { Alert, Button, Checkbox, FormControlLabel, Grid, IconButton, MenuItem, Paper, Stack, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography } from "@mui/material";
import { Delete as DeleteIcon, Download as DownloadIcon, Visibility as ViewIcon } from "@mui/icons-material";
import { can } from "../../app/permissions";
import type { Role } from "../../app/roles";
import { getPayrollParams, paramsTemplateFor, percent, readPayrollParamsList, savePayrollParams } from "../../data/payroll";
import type { PayrollParams, Payslip, PayslipLine } from "../../data/payroll";
import { STORE_EVENT } from "../../data/storage";
import { addEmployeeDocument, deleteEmployeeDocument, EMPLOYEE_DOC_MAX_BYTES, employeeDocTypes, readEmployeeDocuments } from "./employeeDocuments";
import type { EmployeeDocType, EmployeeDocument } from "./employeeDocuments";
import type { EmployeeDraft, EmployeeDraftTextKey } from "./employeeDraft";
import { defaultHrCompany, readHrCompany, saveHrCompany } from "./hrCompany";
import type { HrCompany } from "./hrCompany";

type Actor = { user: string; role: Role };
const shrink = { inputLabel: { shrink: true } } as const;

export function downloadDataUrl(dataUrl: string, fileName: string): void {
  const link = document.createElement("a");
  link.href = dataUrl;
  link.download = fileName;
  link.click();
}

async function openDataUrl(dataUrl: string): Promise<void> {
  const blob = await (await fetch(dataUrl)).blob();
  window.open(URL.createObjectURL(blob), "_blank", "noopener");
}

// Campos previsionales, de liquidación y de contrato del formulario de trabajador.
export function EmployeeLegalFields({ draft, setDraft, afpOptions }: { draft: EmployeeDraft; setDraft: Dispatch<SetStateAction<EmployeeDraft>>; afpOptions: string[] }) {
  const text = (key: EmployeeDraftTextKey, label: string, size = 3, extra: { type?: string; select?: boolean; required?: boolean; helper?: string; children?: React.ReactNode } = {}) => (
    <Grid size={{ xs: 12, md: size }}>
      <TextField label={label} type={extra.type} select={extra.select} value={draft[key]} helperText={extra.helper} fullWidth required={extra.required}
        onChange={(event) => setDraft((current) => ({ ...current, [key]: event.target.value }))} slotProps={extra.type === "date" ? shrink : undefined}>{extra.children}</TextField>
    </Grid>
  );
  const isapre = draft.healthSystem === "ISAPRE";
  return (
    <>
      <Grid size={{ xs: 12 }}><Typography variant="subtitle2">Previsión y liquidación</Typography></Grid>
      {text("rut", "RUT", 2, { helper: "12.345.678-5" })}
      {text("afp", "AFP", 2, { select: true, children: afpOptions.map((name) => <MenuItem key={name} value={name}>{name}</MenuItem>) })}
      {text("healthSystem", "Salud", 2, { select: true, children: [<MenuItem key="F" value="FONASA">FONASA</MenuItem>, <MenuItem key="I" value="ISAPRE">ISAPRE</MenuItem>] })}
      {isapre && text("isapreName", "ISAPRE", 2)}
      {isapre && text("isaprePlanUF", "Plan ISAPRE (UF)", 2, { type: "number", required: true })}
      {text("weeklyHours", "Horas semanales", 2, { type: "number", required: true })}
      {text("gratificationMode", "Gratificación", 2, { select: true, children: [<MenuItem key="a" value="Art50">Art. 50</MenuItem>, <MenuItem key="b" value="Art47">Art. 47</MenuItem>, <MenuItem key="c" value="Pactada">Pactada</MenuItem>, <MenuItem key="d" value="Ninguna">Ninguna</MenuItem>] })}
      {draft.gratificationMode === "Pactada" && text("gratificationAmount", "Gratificación pactada CLP", 2, { type: "number" })}
      {text("overtimeHours", "Horas extra/mes", 2, { type: "number" })}
      {text("familyCharges", "Cargas familiares", 2, { type: "number" })}
      {text("bono", "Bono fijo imponible", 2, { type: "number" })}
      {text("colacion", "Colación (no imponible)", 2, { type: "number" })}
      {text("movilizacion", "Movilización (no imponible)", 2, { type: "number" })}
      {text("sindical", "Cuota sindical", 2, { type: "number" })}
      {text("anticipo", "Anticipo mensual", 2, { type: "number" })}
      {text("prestamo", "Cuota préstamo", 2, { type: "number" })}
      {text("apv", "APV (régimen B)", 2, { type: "number" })}
      <Grid size={{ xs: 12 }}><Typography variant="subtitle2">Datos para el contrato de trabajo (borrador .docx al crear)</Typography></Grid>
      {text("fechaNacimiento", "Fecha de nacimiento", 2, { type: "date" })}
      {text("nacionalidad", "Nacionalidad", 2)}
      {text("estadoCivil", "Estado civil", 2, { select: true, children: ["soltero(a)", "casado(a)", "conviviente civil", "divorciado(a)", "viudo(a)", "separado(a)"].map((v) => <MenuItem key={v} value={v}>{v}</MenuItem>) })}
      {text("domicilio", "Domicilio del trabajador", 3)}
      {text("correo", "Correo del trabajador", 3)}
      {text("lugarTrabajoComuna", "Comuna del lugar de trabajo", 3)}
      {text("lugarTrabajoCiudad", "Ciudad del lugar de trabajo", 3)}
      {text("jornada", "Jornada", 2, { select: true, children: [<MenuItem key="o" value="ordinaria">Ordinaria</MenuItem>, <MenuItem key="p" value="parcial">Parcial</MenuItem>, <MenuItem key="e" value="excluida">Excluida (art. 22)</MenuItem>] })}
      {text("diasPorSemana", "Días por semana", 2, { type: "number" })}
      {text("distribucionJornada", "Distribución de la jornada", 4)}
      {text("funciones", "Funciones (mín. 50 caracteres)", 12)}
      {draft.contractType === "Obra o faena" && text("obraDescripcion", "Obra o faena (mín. 30 caracteres)", 12)}
      {draft.contractType === "Plazo fijo" && <Grid size={{ xs: 12, md: 3 }}><FormControlLabel control={<Checkbox checked={draft.esProfesionalOGerente} onChange={(event) => setDraft((current) => ({ ...current, esProfesionalOGerente: event.target.checked }))} />} label="Profesional o gerente (hasta 2 años)" /></Grid>}
      {draft.nacionalidad.trim().toLowerCase() !== "chilena" && text("tipoPermisoMigratorio", "Permiso migratorio", 3)}
      {draft.nacionalidad.trim().toLowerCase() !== "chilena" && text("vencimientoPermiso", "Vence el", 2, { type: "date" })}
      {text("banco", "Banco (transferencia)", 3)}
      {text("cuentaNumero", "N.º de cuenta", 3)}
    </>
  );
}

const useStoreVersion = () => {
  const [version, setVersion] = useState(0);
  useEffect(() => {
    const refresh = () => setVersion((current) => current + 1);
    window.addEventListener(STORE_EVENT, refresh);
    return () => window.removeEventListener(STORE_EVENT, refresh);
  }, []);
  return version;
};

type EmployeeRef = { id: string; name: string };

// Carpeta de documentos por trabajador: subir, ver o descargar y eliminar.
export function EmployeeDocumentsPanel({ employees, user, role, onGenerateDraft }: { employees: EmployeeRef[]; user: string; role: Role; onGenerateDraft: (employeeId: string) => void }) {
  const version = useStoreVersion();
  const [employeeId, setEmployeeId] = useState("");
  const [type, setType] = useState<EmployeeDocType>("Contrato");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const selected = employeeId || employees[0]?.id || "";
  const docs: EmployeeDocument[] = version >= 0 ? readEmployeeDocuments(selected) : [];
  const editable = can(role, "hr.edit");

  const upload = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (file.size > EMPLOYEE_DOC_MAX_BYTES) { setError("El archivo supera el límite de 2 MB."); return; }
    const reader = new FileReader();
    reader.onload = () => {
      const result = addEmployeeDocument({ employeeId: selected, type, name: name.trim() || file.name, date: new Date().toISOString().slice(0, 10), fileName: file.name, size: file.size, dataUrl: String(reader.result) }, { user, role });
      setError(result.ok ? "" : result.error);
      if (result.ok) setName("");
    };
    reader.onerror = () => setError("No se pudo leer el archivo.");
    reader.readAsDataURL(file);
  };

  return (
    <Paper sx={{ p: 3 }}>
      <Typography variant="h6" sx={{ mb: 2 }}>Carpeta de documentos del trabajador</Typography>
      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError("")}>{error}</Alert>}
      <Stack direction={{ xs: "column", md: "row" }} spacing={2} sx={{ mb: 2 }}>
        <TextField select label="Trabajador" value={selected} onChange={(event) => setEmployeeId(event.target.value)} sx={{ minWidth: 220 }}>
          {employees.map((item) => <MenuItem key={item.id} value={item.id}>{item.name}</MenuItem>)}
        </TextField>
        <TextField select label="Tipo" value={type} onChange={(event) => setType(event.target.value as EmployeeDocType)} sx={{ minWidth: 200 }}>
          {employeeDocTypes.map((item) => <MenuItem key={item} value={item}>{item}</MenuItem>)}
        </TextField>
        <TextField label="Nombre del documento" value={name} onChange={(event) => setName(event.target.value)} />
        <Button variant="outlined" component="label" disabled={!editable || !selected}>Subir archivo (máx. 2 MB)<input hidden type="file" accept=".pdf,.png,.jpg,.jpeg,.docx" onChange={upload} /></Button>
        <Button disabled={!editable || !selected} onClick={() => onGenerateDraft(selected)}>Generar contrato borrador</Button>
      </Stack>
      {docs.length === 0 ? <Typography color="text.secondary">Sin documentos para este trabajador.</Typography> : (
        <Table size="small">
          <TableHead><TableRow><TableCell>Tipo</TableCell><TableCell>Nombre</TableCell><TableCell>Fecha</TableCell><TableCell>Archivo</TableCell><TableCell align="right">KB</TableCell><TableCell>Acciones</TableCell></TableRow></TableHead>
          <TableBody>{docs.map((doc) => (
            <TableRow key={doc.id}>
              <TableCell>{doc.type}</TableCell><TableCell>{doc.name}</TableCell><TableCell>{doc.date}</TableCell><TableCell>{doc.fileName}</TableCell>
              <TableCell align="right">{Math.ceil(doc.size / 1024)}</TableCell>
              <TableCell><Stack direction="row" spacing={0.5}>
                {!doc.fileName.toLowerCase().endsWith(".docx") && <IconButton size="small" aria-label="Ver" onClick={() => { openDataUrl(doc.dataUrl).catch(() => setError("No se pudo abrir el documento.")); }}><ViewIcon fontSize="small" /></IconButton>}
                <IconButton size="small" aria-label="Descargar" onClick={() => downloadDataUrl(doc.dataUrl, doc.fileName)}><DownloadIcon fontSize="small" /></IconButton>
                {editable && <IconButton size="small" color="error" aria-label="Eliminar" onClick={() => { const result = deleteEmployeeDocument(doc.id, { user, role }); setError(result.ok ? "" : result.error); }}><DeleteIcon fontSize="small" /></IconButton>}
              </Stack></TableCell>
            </TableRow>
          ))}</TableBody>
        </Table>
      )}
    </Paper>
  );
}

// Datos de la empresa y valores por defecto del contrato (configuración de RRHH).
export function HrCompanyPanel({ user, role }: Actor) {
  const [company, setCompany] = useState<HrCompany>(readHrCompany);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const editable = can(role, "hr.edit");
  const text = (key: Exclude<keyof HrCompany, "defaults" | "numTrabajadores" | "tieneRIOHS">, label: string, size = 3, type?: string) => (
    <Grid size={{ xs: 12, md: size }}><TextField label={label} type={type} value={company[key]} disabled={!editable} fullWidth slotProps={type === "date" ? shrink : undefined}
      onChange={(event) => setCompany((current) => ({ ...current, [key]: event.target.value }))} /></Grid>
  );
  const dflt = (key: keyof HrCompany["defaults"], label: string, size = 3, type?: string) => (
    <Grid size={{ xs: 12, md: size }}><TextField label={label} type={type} value={company.defaults[key] as string | number} disabled={!editable} fullWidth
      onChange={(event) => setCompany((current) => ({ ...current, defaults: { ...current.defaults, [key]: type === "number" ? Number(event.target.value) : event.target.value } }))} /></Grid>
  );
  const flag = (key: keyof HrCompany["defaults"], label: string) => (
    <Grid size={{ xs: 12, md: 3 }}><FormControlLabel label={label} control={<Checkbox checked={Boolean(company.defaults[key])} disabled={!editable}
      onChange={(event) => setCompany((current) => ({ ...current, defaults: { ...current.defaults, [key]: event.target.checked } }))} />} /></Grid>
  );
  return (
    <Paper sx={{ p: 3 }}>
      <Typography variant="h6" sx={{ mb: 2 }}>Datos de la empresa para contratos y liquidaciones</Typography>
      {message && <Alert severity={message.ok ? "success" : "error"} sx={{ mb: 2 }}>{message.text}</Alert>}
      <Grid container spacing={2}>
        {text("razonSocial", "Razón social")}{text("rut", "RUT empresa", 2)}{text("giro", "Giro")}{text("representante", "Representante legal")}{text("representanteRut", "RUT representante", 2)}
        {text("domicilio", "Domicilio")}{text("ciudad", "Ciudad", 2)}{text("correo", "Correo")}{text("correoDatos", "Correo datos personales")}{text("delegadoDatos", "Delegado de datos (opcional)")}
        {text("mutualidad", "Mutualidad / ISL", 2)}{text("cajaCompensacion", "Caja de compensación (opcional)")}
        <Grid size={{ xs: 12, md: 2 }}><TextField label="N.º de trabajadores" type="number" value={company.numTrabajadores} disabled={!editable} fullWidth onChange={(event) => setCompany((current) => ({ ...current, numTrabajadores: Number(event.target.value) }))} /></Grid>
        <Grid size={{ xs: 12, md: 3 }}><FormControlLabel label="Tiene reglamento interno (RIOHS)" control={<Checkbox checked={company.tieneRIOHS} disabled={!editable} onChange={(event) => setCompany((current) => ({ ...current, tieneRIOHS: event.target.checked }))} />} /></Grid>
        {text("protocoloKarinVersion", "Protocolo Ley Karin: versión", 2)}{text("protocoloKarinFecha", "Protocolo Ley Karin: fecha", 2, "date")}{text("canalDenunciaKarin", "Canal de denuncia Ley Karin", 4)}
        {dflt("periodoPago", "Período de pago", 2)}{dflt("diaPago", "Día de pago", 2, "number")}{dflt("formaPago", "Forma de pago", 3)}{dflt("colacionMinutos", "Colación (min)", 2, "number")}
        {dflt("sistemaControlAsistencia", "Control de asistencia", 3)}{dflt("reajusteTexto", "Reajuste (texto, opcional)", 4)}{dflt("paisesTransferencia", "Países de alojamiento de datos", 3)}
        {flag("propiedadIntelectual", "Cláusula propiedad intelectual")}{flag("firmaElectronica", "Firma electrónica")}{flag("controlBiometrico", "Control biométrico")}{flag("transferenciaInternacional", "Transferencia internacional de datos")}
        <Grid size={{ xs: 12 }}><Stack direction="row" spacing={1}>
          <Button variant="contained" disabled={!editable} onClick={() => { const result = saveHrCompany(company, { user, role }); setMessage({ ok: result.ok, text: result.ok ? "Datos de la empresa guardados." : result.error }); }}>Guardar datos de la empresa</Button>
          <Button disabled={!editable} onClick={() => setCompany({ ...defaultHrCompany })}>Restablecer valores base</Button>
        </Stack></Grid>
      </Grid>
    </Paper>
  );
}

// Parámetros mensuales de remuneraciones: editables por Contabilidad o Administrador.
export function PayrollParamsPanel({ user, role }: Actor) {
  const [period, setPeriod] = useState(new Date().toISOString().slice(0, 7));
  const [params, setParams] = useState<PayrollParams>(() => getPayrollParams(period) ?? paramsTemplateFor(period));
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const editable = can(role, "payroll.params");
  const exists = readPayrollParamsList().some((item) => item.period === period);
  const load = (next: string) => { setPeriod(next); if (/^\d{4}-\d{2}$/.test(next)) { setParams(getPayrollParams(next) ?? paramsTemplateFor(next)); setMessage(null); } };
  const num = (label: string, value: number, apply: (p: PayrollParams, v: number) => PayrollParams, size = 2, asPercent = false) => (
    <Grid size={{ xs: 12, md: size }}><TextField label={asPercent ? `${label} (%)` : label} type="number" disabled={!editable} fullWidth
      value={asPercent ? Number((value * 100).toFixed(4)) : value} helperText={asPercent ? percent(value) : undefined}
      onChange={(event) => { const v = Number(event.target.value); setParams((current) => apply(current, asPercent ? v / 100 : v)); }} /></Grid>
  );
  const r = params.rates;
  const rate = (label: string, key: "afpMandatory" | "health" | "sis" | "crp" | "lifeExpectancy" | "afpEmployerAccount" | "mutualBase" | "mutualAdicional" | "gratificationPct" | "voluntaryLimitPct") =>
    num(label, r[key], (p, v) => ({ ...p, rates: { ...p.rates, [key]: v } }), 2, true);
  return (
    <Paper sx={{ p: 3 }}>
      <Stack direction={{ xs: "column", sm: "row" }} spacing={2} sx={{ mb: 2, alignItems: { sm: "center" } }}>
        <Typography variant="h6" sx={{ flexGrow: 1 }}>Parámetros de remuneraciones por período</Typography>
        <TextField type="month" label="Período" value={period} onChange={(event) => load(event.target.value)} slotProps={shrink} />
      </Stack>
      {!editable && <Alert severity="info" sx={{ mb: 2 }}>Solo Contabilidad o Administrador puede editar estos parámetros.</Alert>}
      {!exists && <Alert severity="warning" sx={{ mb: 2 }}>No hay parámetros guardados para {period}: se muestran los del período anterior como base. Edita UF, UTM, IMM y tasas, y guarda para poder calcular la nómina.</Alert>}
      {message && <Alert severity={message.ok ? "success" : "error"} sx={{ mb: 2 }}>{message.text}</Alert>}
      <Grid container spacing={2}>
        {num("UF (último día del mes)", params.uf, (p, v) => ({ ...p, uf: v }))}
        {num("UF plan ISAPRE", params.ufIsapre, (p, v) => ({ ...p, ufIsapre: v }))}
        {num("UTM", params.utm, (p, v) => ({ ...p, utm: v }))}
        {num("IMM", params.imm, (p, v) => ({ ...p, imm: v }))}
        {num("Jornada máxima (h)", params.weeklyMaxHours, (p, v) => ({ ...p, weeklyMaxHours: v }))}
        {num("Tope AFP/salud (UF)", params.caps.afpUF, (p, v) => ({ ...p, caps: { ...p.caps, afpUF: v } }))}
        {num("Tope cesantía (UF)", params.caps.cesantiaUF, (p, v) => ({ ...p, caps: { ...p.caps, cesantiaUF: v } }))}
        {num("Tope APV mensual (UF)", params.caps.apvMonthlyUF, (p, v) => ({ ...p, caps: { ...p.caps, apvMonthlyUF: v } }))}
        {rate("AFP obligatoria", "afpMandatory")}{rate("Salud legal", "health")}{rate("Gratificación", "gratificationPct")}
        {num("Tope gratificación (IMM/año)", r.gratificationCapIMM, (p, v) => ({ ...p, rates: { ...p.rates, gratificationCapIMM: v } }))}
        {num("Factor horas extra", r.overtimeFactor, (p, v) => ({ ...p, rates: { ...p.rates, overtimeFactor: v } }))}
        {rate("Límite otros descuentos", "voluntaryLimitPct")}
        {num("Años para cesantía reducida", r.cesantiaSeniorityYears, (p, v) => ({ ...p, rates: { ...p.rates, cesantiaSeniorityYears: v } }))}
        <Grid size={{ xs: 12, md: 4 }}><FormControlLabel label="Horas extra entran a la base de la gratificación" control={<Checkbox checked={params.gratificationIncludesOvertime} disabled={!editable} onChange={(event) => setParams((p) => ({ ...p, gratificationIncludesOvertime: event.target.checked }))} />} /></Grid>
        <Grid size={{ xs: 12 }}><Typography variant="subtitle2">Comisión por AFP (se suma al 10 %)</Typography></Grid>
        {Object.entries(r.afpCommission).map(([afp, value]) => num(afp, value, (p, v) => ({ ...p, rates: { ...p.rates, afpCommission: { ...p.rates.afpCommission, [afp]: v } } }), 2, true))}
        <Grid size={{ xs: 12 }}><Typography variant="subtitle2">Seguro de cesantía</Typography></Grid>
        {(["Indefinido", "PlazoFijo", "Indef11mas"] as const).flatMap((kind) => [
          num(`${kind}: trabajador`, r.cesantia[kind].worker, (p, v) => ({ ...p, rates: { ...p.rates, cesantia: { ...p.rates.cesantia, [kind]: { ...p.rates.cesantia[kind], worker: v } } } }), 2, true),
          num(`${kind}: empleador`, r.cesantia[kind].employer, (p, v) => ({ ...p, rates: { ...p.rates, cesantia: { ...p.rates.cesantia, [kind]: { ...p.rates.cesantia[kind], employer: v } } } }), 2, true),
        ])}
        <Grid size={{ xs: 12 }}><Typography variant="subtitle2">Aportes del empleador y mutual</Typography></Grid>
        {rate("SIS", "sis")}{rate("Rentabilidad protegida", "crp")}{rate("Expectativa de vida", "lifeExpectancy")}{rate("Cuenta individual AFP", "afpEmployerAccount")}
        {rate("Mutual básica + SANNA", "mutualBase")}{rate("Mutual adicional (empresa)", "mutualAdicional")}
        <Grid size={{ xs: 12 }}><Typography variant="subtitle2">Impuesto único (tramos en UTM)</Typography></Grid>
        {params.taxBrackets.map((bracket, index) => {
          const set = (patch: Partial<typeof bracket>) => setParams((p) => ({ ...p, taxBrackets: p.taxBrackets.map((item, i) => i === index ? { ...item, ...patch } : item) }));
          return [
            <Grid key={`f${index}`} size={{ xs: 6, md: 2 }}><TextField label="Desde (UTM)" type="number" value={bracket.fromUTM} disabled={!editable} fullWidth onChange={(event) => set({ fromUTM: Number(event.target.value) })} /></Grid>,
            <Grid key={`t${index}`} size={{ xs: 6, md: 2 }}><TextField label="Hasta (UTM)" type="number" value={bracket.toUTM ?? ""} placeholder="sin tope" disabled={!editable} fullWidth onChange={(event) => set({ toUTM: event.target.value === "" ? null : Number(event.target.value) })} /></Grid>,
            <Grid key={`x${index}`} size={{ xs: 6, md: 2 }}><TextField label="Factor" type="number" value={bracket.factor} disabled={!editable} fullWidth onChange={(event) => set({ factor: Number(event.target.value) })} /></Grid>,
            <Grid key={`r${index}`} size={{ xs: 6, md: 2 }}><TextField label="Rebaja (UTM)" type="number" value={bracket.rebateUTM} disabled={!editable} fullWidth onChange={(event) => set({ rebateUTM: Number(event.target.value) })} /></Grid>,
            <Grid key={`s${index}`} size={{ xs: 12, md: 4 }}><Typography variant="caption" color="text.secondary">{Math.round(bracket.fromUTM * params.utm).toLocaleString("es-CL")} a {bracket.toUTM === null ? "sin tope" : Math.round(bracket.toUTM * params.utm).toLocaleString("es-CL")} CLP</Typography></Grid>,
          ];
        })}
        <Grid size={{ xs: 12 }}><Typography variant="subtitle2">Asignación familiar por carga (renta imponible hasta)</Typography></Grid>
        {params.familyAllowance.flatMap((tier, index) => [
          <Grid key={`m${index}`} size={{ xs: 6, md: 3 }}><TextField label="Renta hasta" type="number" value={tier.maxIncome ?? ""} placeholder="sin tope" disabled={!editable} fullWidth onChange={(event) => setParams((p) => ({ ...p, familyAllowance: p.familyAllowance.map((item, i) => i === index ? { ...item, maxIncome: event.target.value === "" ? null : Number(event.target.value) } : item) }))} /></Grid>,
          <Grid key={`a${index}`} size={{ xs: 6, md: 3 }}><TextField label="Monto por carga" type="number" value={tier.amountPerCharge} disabled={!editable} fullWidth onChange={(event) => setParams((p) => ({ ...p, familyAllowance: p.familyAllowance.map((item, i) => i === index ? { ...item, amountPerCharge: Number(event.target.value) } : item) }))} /></Grid>,
        ])}
        <Grid size={{ xs: 12 }}><Typography variant="caption" color="text.secondary">Fuentes: {params.source.map((item) => `${item.label} (${item.fetchedAt})`).join("; ")}</Typography></Grid>
        <Grid size={{ xs: 12 }}><Button variant="contained" disabled={!editable} onClick={() => { const result = savePayrollParams(params, { user, role }); setMessage({ ok: result.ok, text: result.ok ? `Parámetros de ${params.period} guardados.` : result.error }); }}>Guardar parámetros de {period}</Button></Grid>
      </Grid>
    </Paper>
  );
}

// Detalle legal de la liquidación en pantalla: cada concepto con base, tasa y monto.
export function PayslipDetail({ slip }: { slip: Payslip }) {
  const fmt = (value: number) => new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 }).format(value);
  const block = (title: string, kind: PayslipLine["kind"], lines: PayslipLine[], totalLabel: string, total: number) => lines.filter((line) => line.kind === kind).length === 0 ? null : (
    <Paper variant="outlined" sx={{ mb: 2 }}>
      <Typography variant="subtitle2" sx={{ px: 2, py: 1, bgcolor: "#f1f5f9", fontWeight: 700 }}>{title}</Typography>
      <Table size="small">
        <TableBody>
          {lines.filter((line) => line.kind === kind).map((line) => (
            <TableRow key={line.code}>
              <TableCell>{line.label}{line.detail && <Typography variant="caption" sx={{ display: "block" }} color="text.secondary">{line.detail}</Typography>}</TableCell>
              <TableCell align="right">{line.base === undefined ? "" : `Base ${fmt(line.base)}`}</TableCell>
              <TableCell align="right">{line.rate === undefined ? "" : percent(line.rate)}</TableCell>
              <TableCell align="right">{fmt(line.amount)}</TableCell>
            </TableRow>
          ))}
          <TableRow><TableCell colSpan={3} sx={{ fontWeight: 700 }}>{totalLabel}</TableCell><TableCell align="right" sx={{ fontWeight: 700 }}>{fmt(total)}</TableCell></TableRow>
        </TableBody>
      </Table>
    </Paper>
  );
  return (
    <>
      {block("HABERES IMPONIBLES", "imponible", slip.lines, "Total imponible", slip.totalImponible)}
      {block("HABERES NO IMPONIBLES", "noImponible", slip.lines, "Total no imponible", slip.totalNoImponible)}
      <Typography sx={{ fontWeight: 700, mb: 2 }}>Total haberes: {fmt(slip.gross)}</Typography>
      {block("DESCUENTOS LEGALES", "descLegal", slip.lines, "Total descuentos legales", slip.legalDeductions)}
      <Typography variant="body2" sx={{ mb: 2 }}>Base tributable del impuesto único: {fmt(slip.taxableBase)}</Typography>
      {block("OTROS DESCUENTOS (voluntarios y convencionales)", "descVoluntario", slip.lines, "Total otros descuentos", slip.voluntaryDeductions)}
      <Typography sx={{ fontWeight: 700, mb: 2 }}>Total descuentos: -{fmt(slip.deductions)}</Typography>
      {block("APORTES DEL EMPLEADOR (informativos)", "aporteEmpleador", slip.employerContributions, "Total aportes empleador", slip.employerTotal)}
      <Typography variant="body2" sx={{ mb: 1 }}>Costo total empleador: {fmt(slip.employerCost)}</Typography>
      {slip.warnings.map((warning) => <Alert key={warning} severity="warning" sx={{ mb: 1 }}>{warning}</Alert>)}
      <Typography variant="caption" color="text.secondary">Valores usados: UF {slip.values.uf.toLocaleString("es-CL")} (plan ISAPRE con UF {slip.values.ufIsapre.toLocaleString("es-CL")}), UTM {fmt(slip.values.utm)}, IMM {fmt(slip.values.imm)}, tope AFP/salud {fmt(slip.values.afpCap)}, tope cesantía {fmt(slip.values.cesantiaCap)}.</Typography>
    </>
  );
}
