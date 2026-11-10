import { useState } from "react";
import type { ReactNode } from "react";
import {
  Alert, Autocomplete, Button, Checkbox, Chip, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel,
  Grid, IconButton, MenuItem, Paper, Stack, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography,
} from "@mui/material";
import { Add, DeleteOutlined } from "@mui/icons-material";
import { can } from "../../app/permissions";
import type { Role } from "../../app/roles";
import { bankLabel, chileBanks } from "../../data/chileBanks";
import type { BankGroup } from "../../data/chileBanks";
import {
  accountTypes, chileRegions, deleteSupplier, emptySupplierInput, paymentModes, paymentTermLabel, paymentTermWarning,
  readSuppliers, saveSupplier, setSupplierActive, supplierReferences, termDays,
} from "../../data/suppliers";
import type { PaymentMode, Supplier, SupplierInput } from "../../data/suppliers";

const bankGroups: BankGroup[] = ["Bancos", "Cooperativas y cuentas digitales"];

type Props = { role: Role; user: string; suppliers: Supplier[]; onChange: (list: Supplier[]) => void };

export default function SuppliersTab({ role, user, suppliers, onChange }: Props) {
  const canEdit = can(role, "supplier.edit");
  const [editing, setEditing] = useState<{ id?: string; draft: SupplierInput } | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [formError, setFormError] = useState("");
  const actor = { user, role };

  const refresh = () => onChange(readSuppliers());
  const report = (result: { ok: boolean }, error: string | undefined, success: string) => {
    if (result.ok) { setError(""); setMessage(success); refresh(); } else { setMessage(""); setError(error ?? ""); }
  };

  const open = (supplier?: Supplier) => {
    setFormError("");
    const { id, ...rest } = supplier ?? { id: undefined, ...emptySupplierInput() };
    setEditing({ id, draft: structuredClone(rest) });
  };

  const submit = () => {
    if (!editing) return;
    const result = saveSupplier(editing.draft, actor, editing.id);
    if (!result.ok) { setFormError(result.error); return; }
    setEditing(null);
    report(result, undefined, `Proveedor ${result.value.name} guardado.`);
  };

  const toggle = (supplier: Supplier) => {
    const result = setSupplierActive(supplier.id, !supplier.active, actor);
    report(result, result.ok ? undefined : result.error, `${supplier.name} ${supplier.active ? "desactivado" : "activado"}.`);
  };

  const remove = (supplier: Supplier) => {
    const result = deleteSupplier(supplier.id, actor);
    report(result, result.ok ? undefined : result.error, `${supplier.name} eliminado.`);
  };

  return (
    <Stack spacing={2}>
      {message && <Alert severity="success">{message}</Alert>}
      {error && <Alert severity="error">{error}</Alert>}
      <Paper sx={{ p: 3 }}>
        <Stack direction="row" sx={{ alignItems: "center", mb: 2 }}>
          <Typography variant="h6" sx={{ flexGrow: 1 }}>Proveedores</Typography>
          {canEdit
            ? <Button variant="contained" startIcon={<Add />} onClick={() => open()}>Nuevo proveedor</Button>
            : <Chip size="small" label="Solo lectura" />}
        </Stack>
        {suppliers.length === 0 ? <Typography color="text.secondary">No hay proveedores registrados.</Typography> : (
          <Table size="small">
            <TableHead><TableRow>
              <TableCell>Razón social</TableCell><TableCell>RUT</TableCell><TableCell>Plazo de pago</TableCell>
              <TableCell>Categorías</TableCell><TableCell>Estado</TableCell><TableCell>Acciones</TableCell>
            </TableRow></TableHead>
            <TableBody>{suppliers.map((supplier) => {
              const refs = supplierReferences(supplier.name);
              const days = supplier.paymentTerm.days;
              return (
                <TableRow key={supplier.id}>
                  <TableCell>{supplier.name}<Typography variant="caption" sx={{ display: "block" }}>{supplier.tradeName}</Typography></TableCell>
                  <TableCell>{supplier.rut || "Sin RUT"}</TableCell>
                  <TableCell>{paymentTermLabel(supplier.paymentTerm)}{days > 30 && <Chip size="small" color="warning" sx={{ ml: 1 }} label="Ley 21.131" />}</TableCell>
                  <TableCell>{supplier.categories.map((category) => <Chip key={category} size="small" label={category} sx={{ mr: 0.5 }} />)}</TableCell>
                  <TableCell><Chip size="small" color={supplier.active ? "success" : "default"} label={supplier.active ? "Activo" : "Inactivo"} /></TableCell>
                  <TableCell><Stack direction="row" spacing={1}>
                    <Button size="small" onClick={() => open(supplier)}>{canEdit ? "Editar" : "Ver"}</Button>
                    {canEdit && <Button size="small" onClick={() => toggle(supplier)}>{supplier.active ? "Desactivar" : "Activar"}</Button>}
                    {canEdit && refs.orders + refs.quotes === 0 && <Button size="small" color="error" onClick={() => remove(supplier)}>Eliminar</Button>}
                  </Stack></TableCell>
                </TableRow>
              );
            })}</TableBody>
          </Table>
        )}
      </Paper>
      {editing && (
        <SupplierDialog
          draft={editing.draft} isNew={!editing.id} readOnly={!canEdit} error={formError}
          onChange={(draft) => setEditing({ ...editing, draft })} onClose={() => setEditing(null)} onSave={submit}
        />
      )}
    </Stack>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return <Stack spacing={1}><Typography variant="subtitle1" sx={{ fontWeight: 700 }}>{title}</Typography>{children}</Stack>;
}

function SupplierDialog({ draft, isNew, readOnly, error, onChange, onClose, onSave }: {
  draft: SupplierInput; isNew: boolean; readOnly: boolean; error: string;
  onChange: (draft: SupplierInput) => void; onClose: () => void; onSave: () => void;
}) {
  const set = <K extends keyof SupplierInput>(key: K, value: SupplierInput[K]) => onChange({ ...draft, [key]: value });
  const text = (label: string, value: string, apply: (value: string) => void, size = 6, required = false) => (
    <Grid size={{ xs: 12, sm: size }}>
      <TextField size="small" fullWidth label={label} value={value} required={required} disabled={readOnly} onChange={(event) => apply(event.target.value)} />
    </Grid>
  );
  const address = (key: keyof SupplierInput["address"], label: string, size = 6) =>
    text(label, draft.address[key], (value) => set("address", { ...draft.address, [key]: value }), size);
  const bank = (key: keyof SupplierInput["bank"], label: string) =>
    text(label, draft.bank[key], (value) => set("bank", { ...draft.bank, [key]: value }));
  const setContact = (index: number, patch: Partial<SupplierInput["contacts"][number]>) =>
    set("contacts", draft.contacts.map((contact, position) => position === index ? { ...contact, ...patch } : contact));
  const markPrimary = (index: number) => set("contacts", draft.contacts.map((contact, position) => ({ ...contact, primary: position === index })));
  const removeContact = (index: number) => {
    const rest = draft.contacts.filter((_, position) => position !== index);
    set("contacts", rest.length && !rest.some((contact) => contact.primary) ? rest.map((contact, position) => ({ ...contact, primary: position === 0 })) : rest);
  };
  const warning = paymentTermWarning(draft.paymentTerm.days);
  const setMode = (mode: PaymentMode) =>
    set("paymentTerm", { ...draft.paymentTerm, mode, days: termDays(mode, draft.paymentTerm.days) });

  return (
    <Dialog open onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>{readOnly ? "Proveedor" : isNew ? "Nuevo proveedor" : "Editar proveedor"}</DialogTitle>
      <DialogContent>
        <Stack spacing={3} sx={{ pt: 1 }}>
          {error && <Alert severity="error">{error}</Alert>}
          <Section title="Identificación">
            <Grid container spacing={2}>
              {text("Razón social", draft.name, (value) => set("name", value), 6, true)}
              {text("Nombre de fantasía", draft.tradeName, (value) => set("tradeName", value))}
              {text("RUT (ej. 76.123.450-1)", draft.rut, (value) => set("rut", value), 4, true)}
              {text("Giro", draft.activity, (value) => set("activity", value), 8, true)}
            </Grid>
          </Section>
          <Section title="Dirección">
            <Grid container spacing={2}>
              {address("street", "Calle y número", 6)}
              {address("commune", "Comuna", 3)}
              {address("city", "Ciudad", 3)}
              <Grid size={{ xs: 12, sm: 8 }}>
                <TextField select size="small" fullWidth label="Región" value={draft.address.region} disabled={readOnly}
                  onChange={(event) => set("address", { ...draft.address, region: event.target.value })}>
                  {chileRegions.map((region) => <MenuItem key={region} value={region}>{region}</MenuItem>)}
                </TextField>
              </Grid>
              {address("country", "País", 4)}
            </Grid>
          </Section>
          <Section title="Contactos">
            {draft.contacts.map((contact, index) => (
              <Grid container spacing={1} key={index} sx={{ alignItems: "center" }}>
                {text("Nombre", contact.name, (value) => setContact(index, { name: value }), 3, true)}
                {text("Cargo", contact.role, (value) => setContact(index, { role: value }), 2)}
                {text("Correo", contact.email, (value) => setContact(index, { email: value }), 3)}
                {text("Teléfono", contact.phone, (value) => setContact(index, { phone: value }), 2)}
                <Grid size={{ xs: 12, sm: 2 }}>
                  <FormControlLabel label="Principal" control={<Checkbox checked={contact.primary} disabled={readOnly} onChange={() => markPrimary(index)} />} />
                  {!readOnly && draft.contacts.length > 1 && <IconButton size="small" aria-label="Quitar contacto" onClick={() => removeContact(index)}><DeleteOutlined fontSize="small" /></IconButton>}
                </Grid>
              </Grid>
            ))}
            {!readOnly && <div><Button size="small" startIcon={<Add />} onClick={() => set("contacts", [...draft.contacts, { name: "", role: "", email: "", phone: "", primary: false }])}>Agregar contacto</Button></div>}
          </Section>
          <Section title="Cuenta para pago">
            <Grid container spacing={2}>
              <Grid size={{ xs: 12, sm: 6 }}>
                <TextField select size="small" fullWidth label="Banco" value={draft.bank.bankCode} disabled={readOnly}
                  onChange={(event) => set("bank", { ...draft.bank, bankCode: event.target.value })}
                  helperText={draft.bank.bankCode ? bankLabel(draft.bank.bankCode) : undefined}>
                  {bankGroups.flatMap((group) => [
                    <MenuItem key={group} disabled sx={{ fontWeight: 700, opacity: 1 }}>{group}</MenuItem>,
                    ...chileBanks.filter((item) => item.group === group).map((item) => <MenuItem key={item.code} value={item.code}>{item.code} {item.name}</MenuItem>),
                  ])}
                </TextField>
              </Grid>
              <Grid size={{ xs: 12, sm: 3 }}>
                <TextField select size="small" fullWidth label="Tipo de cuenta" value={draft.bank.type} disabled={readOnly}
                  onChange={(event) => set("bank", { ...draft.bank, type: event.target.value as SupplierInput["bank"]["type"] })}>
                  {accountTypes.map((type) => <MenuItem key={type} value={type}>{type}</MenuItem>)}
                </TextField>
              </Grid>
              {bank("number", "Número de cuenta")}
              {bank("holder", "Titular")}
              {bank("holderRut", "RUT del titular")}
              {bank("paymentEmail", "Correo para el aviso de pago")}
            </Grid>
          </Section>
          <Section title="Plazos acordados de pago">
            <Grid container spacing={2}>
              <Grid size={{ xs: 12, sm: 4 }}>
                <TextField select size="small" fullWidth label="Plazo" value={draft.paymentTerm.mode} disabled={readOnly} onChange={(event) => setMode(event.target.value as PaymentMode)}>
                  {paymentModes.map((mode) => <MenuItem key={mode} value={mode}>{mode === "Contado" || mode === "Otro" ? mode : `${mode} días`}</MenuItem>)}
                </TextField>
              </Grid>
              {draft.paymentTerm.mode === "Otro" && (
                <Grid size={{ xs: 12, sm: 3 }}>
                  <TextField size="small" fullWidth type="number" label="Días" value={draft.paymentTerm.days} disabled={readOnly}
                    onChange={(event) => set("paymentTerm", { ...draft.paymentTerm, days: Number(event.target.value) })} />
                </Grid>
              )}
              {text("Condición (texto libre)", draft.paymentTerm.condition, (value) => set("paymentTerm", { ...draft.paymentTerm, condition: value }), 12)}
            </Grid>
            {warning && <Alert severity="warning">{warning}</Alert>}
          </Section>
          <Section title="Categorías y estado">
            <Autocomplete multiple freeSolo size="small" options={[]} value={draft.categories} disabled={readOnly}
              onChange={(_, value) => set("categories", value.map((item) => item.trim()).filter(Boolean))}
              renderValue={(value, getItemProps) => value.map((option, index) => <Chip size="small" label={option} {...getItemProps({ index })} key={option} />)}
              renderInput={(params) => <TextField {...params} label="Categorías que suministra (Enter para agregar)" />} />
            <FormControlLabel label="Proveedor activo" control={<Checkbox checked={draft.active} disabled={readOnly} onChange={(event) => set("active", event.target.checked)} />} />
          </Section>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{readOnly ? "Cerrar" : "Cancelar"}</Button>
        {!readOnly && <Button variant="contained" onClick={onSave}>Guardar</Button>}
      </DialogActions>
    </Dialog>
  );
}
