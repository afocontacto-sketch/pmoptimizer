import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  MenuItem,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import { CheckCircleOutlined, Print, ShoppingCart } from "@mui/icons-material";
import {
  makeSupplyId,
  purchaseOrdersStorageKey,
  purchaseRequestsStorageKey,
  readStoredList,
  suppliersStorageKey,
} from "./supplyData";
import type { PurchaseOrder, PurchaseQuote, PurchaseRequest, SupplierMaster } from "./supplyData";

type RoleName = "Administrador" | "Supervisor" | "Planificador" | "PM Proyecto" | "Compras" | "Contabilidad" | "Producción" | "Industrial" | "Ingeniería" | "Calidad";
type QuoteDraft = { supplier: string; unitCost: string; expectedDate: string };
const emptyQuote = (needDate: string): QuoteDraft => ({ supplier: "", unitCost: "", expectedDate: needDate });

function money(value: number): string {
  return new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 }).format(value);
}

export default function PurchasingPage({ role, user }: { role: RoleName; user: string }) {
  const [requests, setRequests] = useState<PurchaseRequest[]>(() =>
    readStoredList<PurchaseRequest>(purchaseRequestsStorageKey));
  const [orders, setOrders] = useState<PurchaseOrder[]>(() =>
    readStoredList<PurchaseOrder>(purchaseOrdersStorageKey));
  const [suppliers, setSuppliers] = useState<SupplierMaster[]>(() => {
    const saved = readStoredList<SupplierMaster>(suppliersStorageKey);
    const historicalNames = [
      ...orders.map((order) => order.supplier),
      ...requests.flatMap((request) => request.quotes?.map((quote) => quote.supplier) ?? []),
    ];
    const names = [...new Set([...saved.map((supplier) => supplier.name), ...historicalNames].filter(Boolean))];
    return names.map((name) => saved.find((supplier) => supplier.name === name) ?? {
      id: makeSupplyId("PROV"),
      name,
    });
  });
  const [supplierName, setSupplierName] = useState("");
  const [drafts, setDrafts] = useState<Record<string, QuoteDraft[]>>({});
  const [selectedQuotes, setSelectedQuotes] = useState<Record<string, string>>({});
  const [printOrder, setPrintOrder] = useState<PurchaseOrder | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const canApprove = role === "Administrador" || role === "PM Proyecto";
  const canQuote = role === "Administrador" || role === "Compras";

  const addSupplier = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = supplierName.trim();
    if (!name || suppliers.some((supplier) => supplier.name.toLowerCase() === name.toLowerCase())) {
      setError("Ingresa un nombre de proveedor único para guardarlo en el maestro.");
      return;
    }
    const next = [...suppliers, { id: makeSupplyId("PROV"), name }];
    try {
      localStorage.setItem(suppliersStorageKey, JSON.stringify(next));
      setSuppliers(next);
      setSupplierName("");
      setError("");
      setMessage(`Proveedor ${name} agregado al maestro.`);
    } catch (cause) {
      console.error("No se pudo guardar el proveedor.", cause);
      setError("No se pudo guardar el proveedor en este navegador.");
    }
  };

  useEffect(() => {
    if (!printOrder) return;
    const timer = window.setTimeout(() => {
      window.print();
      setPrintOrder(null);
    }, 100);
    return () => window.clearTimeout(timer);
  }, [printOrder]);

  const updateData = (nextRequests: PurchaseRequest[], nextOrders: PurchaseOrder[]) => {
    try {
      localStorage.setItem(purchaseOrdersStorageKey, JSON.stringify(nextOrders));
      localStorage.setItem(purchaseRequestsStorageKey, JSON.stringify(nextRequests));
      setOrders(nextOrders);
      setRequests(nextRequests);
      setError("");
      return true;
    } catch (writeError) {
      console.error("No se pudo guardar el flujo de compras.", writeError);
      setError("No se pudieron guardar los cambios de compras en este navegador.");
      return false;
    }
  };

  const createOrder = (request: PurchaseRequest) => {
    const cheapestQuoteId = request.quotes?.length
      ? request.quotes.reduce((cheapest, item) => item.unitCost < cheapest.unitCost ? item : cheapest).id
      : undefined;
    const quote = request.quotes?.find((item) => item.id === (selectedQuotes[request.id] ?? cheapestQuoteId));
    if (!quote) {
      setError(`Selecciona una de las tres ofertas comparadas para ${request.id}.`);
      return;
    }
    const orderId = makeSupplyId("OC");
    const order: PurchaseOrder = {
      id: orderId,
      requestId: request.id,
      materialCode: request.materialCode,
      materialName: request.materialName,
      unit: request.unit,
      quantity: request.quantity,
      supplier: quote.supplier,
      unitCost: quote.unitCost,
      expectedDate: quote.expectedDate,
      selectedQuoteId: quote.id,
      status: "Pendiente aprobación",
    };
    const nextOrders = [...orders, order];
    const nextRequests = requests.map((item) => item.id === request.id
      ? {
        ...item,
        supplier: order.supplier,
        quotedUnitCost: quote.unitCost,
        purchaseOrderId: orderId,
        expectedDate: quote.expectedDate,
        status: "OC pendiente aprobación" as const,
      }
      : item);
    if (updateData(nextRequests, nextOrders)) {
      setMessage(`${orderId} creada y enviada al PM del proyecto para aprobación.`);
    }
  };

  const approveOrder = (order: PurchaseOrder, approve: boolean) => {
    const nextOrders = orders.map((item) => item.id === order.id
      ? { ...item, status: approve ? "Aprobada" as const : "Rechazada" as const, approvedBy: user }
      : item);
    const nextRequests = requests.map((item) => item.id === order.requestId
      ? { ...item, status: approve ? "OC aprobada" as const : "Cotización en curso" as const }
      : item);
    if (updateData(nextRequests, nextOrders)) {
      setMessage(approve ? `${order.id} aprobada por ${user}.` : `${order.id} rechazada; Compras puede ajustar la cotización.`);
    }
  };

  const startQuote = (request: PurchaseRequest) => {
    setDrafts((current) => ({ ...current, [request.id]: Array.from({ length: 3 }, () => emptyQuote(request.needDate)) }));
    const next = requests.map((item) => item.id === request.id
      ? { ...item, status: "Cotización en curso" as const }
      : item);
    updateData(next, orders);
  };

  const saveQuotes = (request: PurchaseRequest) => {
    const entries = drafts[request.id] ?? [];
    const suppliers = entries.map((quote) => quote.supplier.trim().toLowerCase());
    if (entries.length !== 3 || entries.some((quote) => !quote.supplier.trim() ||
      !Number.isFinite(Number(quote.unitCost)) || Number(quote.unitCost) <= 0 ||
      !/^\d{4}-\d{2}-\d{2}$/.test(quote.expectedDate)) || new Set(suppliers).size !== 3) {
      setError(`Registra tres proveedores distintos, cada uno con precio mayor a cero y fecha válida para ${request.id}.`);
      return;
    }
    const quotes: PurchaseQuote[] = entries.map((quote) => ({
      id: makeSupplyId("COT"),
      supplier: quote.supplier.trim(),
      unitCost: Number(quote.unitCost),
      expectedDate: quote.expectedDate,
    }));
    const next = requests.map((item) => item.id === request.id ? { ...item, quotes } : item);
    if (updateData(next, orders)) {
      setSelectedQuotes((current) => ({ ...current, [request.id]: quotes.reduce((best, item) =>
        item.unitCost < (quotes.find((candidate) => candidate.id === best)?.unitCost ?? Infinity) ? item.id : best, quotes[0].id) }));
      setMessage(`Cuadro comparativo de ${request.id} guardado. Selecciona la oferta adjudicada para emitir la OC.`);
    }
  };

  return (
    <Stack spacing={3}>
      <div>
        <Typography variant="h4" sx={{ fontWeight: 700 }}>Compras · cotizaciones y órdenes</Typography>
        <Typography color="text.secondary">
          Supply genera solicitudes desde faltantes del MRP. Compras cotiza y emite la OC; el PM del proyecto la aprueba antes de considerarla cobertura.
        </Typography>
      </div>
      {message && <Alert severity="success">{message}</Alert>}
      {error && <Alert severity="error">{error}</Alert>}
      {canQuote && (
        <Paper component="form" onSubmit={addSupplier} sx={{ p: 2 }}>
          <Stack direction={{ xs: "column", sm: "row" }} spacing={1} sx={{ alignItems: { sm: "center" } }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 700, flexGrow: 1 }}>Maestro de proveedores</Typography>
            <TextField size="small" label="Nombre del proveedor" value={supplierName} onChange={(event) => setSupplierName(event.target.value)} required />
            <Button type="submit" variant="outlined">Agregar proveedor</Button>
          </Stack>
          <Typography variant="caption" color="text.secondary">
            {suppliers.length ? `${suppliers.length} proveedores disponibles para cotizaciones y facturas.` : "Agrega proveedores aquí antes de registrar cotizaciones."}
          </Typography>
        </Paper>
      )}
      <Paper sx={{ p: 3 }}>
        <Stack direction="row" spacing={1} sx={{ alignItems: "center", mb: 2 }}>
          <ShoppingCart color="primary" />
          <Typography variant="h6">Solicitudes de pedido</Typography>
        </Stack>
        {requests.length === 0 ? (
          <Alert severity="info">No hay solicitudes. Los faltantes fechados se generan desde Supply → MRP.</Alert>
        ) : (
          <Table size="small">
            <TableHead><TableRow>
              <TableCell>Solicitud</TableCell><TableCell>Material</TableCell><TableCell align="right">Cantidad</TableCell>
              <TableCell>Necesidad</TableCell><TableCell>Estado</TableCell><TableCell>Proveedor / oferta</TableCell><TableCell>Acciones</TableCell>
            </TableRow></TableHead>
            <TableBody>{requests.map((request) => {
              const quoteDrafts = drafts[request.id] ?? Array.from({ length: 3 }, () => emptyQuote(request.needDate));
              const cheapestQuoteId = request.quotes?.length
                ? request.quotes.reduce((cheapest, quote) => quote.unitCost < cheapest.unitCost ? quote : cheapest).id
                : "";
              const order = orders.find((item) => item.id === request.purchaseOrderId && item.status !== "Rechazada");
              return (
                <TableRow key={request.id}>
                  <TableCell>{request.id}<Typography variant="caption" sx={{ display: "block" }}>{request.callIds.join(", ")}</Typography></TableCell>
                  <TableCell>{request.materialCode}<Typography variant="caption" sx={{ display: "block" }}>{request.materialName}</Typography></TableCell>
                  <TableCell align="right">{request.quantity} {request.unit}</TableCell>
                  <TableCell>{request.needDate}</TableCell>
                  <TableCell><Chip size="small" label={request.status} color={request.status === "OC aprobada" ? "success" : request.status === "OC pendiente aprobación" ? "warning" : "default"} /></TableCell>
                  <TableCell>
                    {order ? <>{order.supplier}<Typography variant="caption" sx={{ display: "block" }}>{money(order.unitCost)} c/u · entrega {order.expectedDate}</Typography></> : !canQuote ? "Pendiente de cotización por Compras" : request.quotes?.length === 3 ? (
                      <Stack spacing={1}>
                        {request.quotes.map((quote) => (
                          <Typography key={quote.id} variant="body2">
                            {quote.supplier} · {money(quote.unitCost)} c/u · {quote.expectedDate}
                          {quote.id === (selectedQuotes[request.id] ?? cheapestQuoteId) && <Chip size="small" sx={{ ml: 1 }} color="success" label="Seleccionada" />}
                          </Typography>
                        ))}
                        <TextField select size="small" label="Oferta adjudicada" value={selectedQuotes[request.id] ?? cheapestQuoteId} onChange={(event) => setSelectedQuotes((current) => ({ ...current, [request.id]: event.target.value }))}>
                          {request.quotes.map((quote) => <MenuItem key={quote.id} value={quote.id}>{quote.supplier} · {money(quote.unitCost)}</MenuItem>)}
                        </TextField>
                      </Stack>
                    ) : request.status === "Cotización en curso" ? (
                      <Stack spacing={1}>
                        {quoteDrafts.map((quote, index) => (
                          <Stack key={index} direction={{ xs: "column", md: "row" }} spacing={1}>
                            <TextField select size="small" label={`Proveedor ${index + 1}`} value={quote.supplier} onChange={(event) => setDrafts((current) => {
                              const next = [...(current[request.id] ?? quoteDrafts)];
                              next[index] = { ...next[index], supplier: event.target.value };
                              return { ...current, [request.id]: next };
                            })}>
                              {suppliers.map((supplier) => <MenuItem key={supplier.id} value={supplier.name}>{supplier.name}</MenuItem>)}
                            </TextField>
                            <TextField size="small" label="Precio unit. CLP" type="number" value={quote.unitCost} onChange={(event) => setDrafts((current) => {
                              const next = [...(current[request.id] ?? quoteDrafts)];
                              next[index] = { ...next[index], unitCost: event.target.value };
                              return { ...current, [request.id]: next };
                            })} />
                            <TextField size="small" label="Entrega estimada" type="date" value={quote.expectedDate} onChange={(event) => setDrafts((current) => {
                              const next = [...(current[request.id] ?? quoteDrafts)];
                              next[index] = { ...next[index], expectedDate: event.target.value };
                              return { ...current, [request.id]: next };
                            })} slotProps={{ inputLabel: { shrink: true } }} />
                          </Stack>
                        ))}
                      </Stack>
                    ) : "Sin cotización iniciada"}
                  </TableCell>
                  <TableCell>
                    {order?.status === "Pendiente aprobación" && canApprove ? (
                      <Stack direction="row" spacing={1}>
                        <Button size="small" color="success" startIcon={<CheckCircleOutlined />} onClick={() => approveOrder(order, true)}>Aprobar</Button>
                        <Button size="small" color="error" onClick={() => approveOrder(order, false)}>Rechazar</Button>
                      </Stack>
                    ) : order ? (
                      <Chip size="small" label={order.status} color={order.status === "Aprobada" ? "success" : order.status === "Rechazada" ? "error" : "default"} />
                    ) : canQuote && request.status === "Pendiente cotización" ? (
                      <Button size="small" onClick={() => startQuote(request)}>Registrar 3 cotizaciones</Button>
                    ) : canQuote && request.status === "Cotización en curso" && request.quotes?.length !== 3 ? (
                      <Button size="small" variant="contained" onClick={() => saveQuotes(request)}>Guardar comparativo</Button>
                    ) : canQuote && request.status === "Cotización en curso" ? (
                      <Button size="small" variant="contained" onClick={() => createOrder(request)}>Adjudicar y crear OC</Button>
                    ) : null}
                  </TableCell>
                </TableRow>
              );
            })}</TableBody>
          </Table>
        )}
      </Paper>
      <Paper sx={{ p: 3 }}>
        <Typography variant="h6" sx={{ mb: 2 }}>Órdenes de compra</Typography>
        {orders.length === 0 ? <Typography color="text.secondary">Las OC cotizadas aparecerán aquí.</Typography> : (
          <Table size="small">
            <TableHead><TableRow><TableCell>OC</TableCell><TableCell>Solicitud</TableCell><TableCell>Proveedor</TableCell><TableCell>Material</TableCell><TableCell align="right">Total</TableCell><TableCell>Entrega</TableCell><TableCell>Estado / aprobación</TableCell><TableCell>Documento</TableCell></TableRow></TableHead>
            <TableBody>{orders.map((order) => (
              <TableRow key={order.id}>
                <TableCell>{order.id}</TableCell><TableCell>{order.requestId}</TableCell><TableCell>{order.supplier}</TableCell>
                <TableCell>{order.materialCode} · {order.materialName}</TableCell>
                <TableCell align="right">{money(order.quantity * order.unitCost)}</TableCell>
                <TableCell>{order.expectedDate}</TableCell>
                <TableCell>{order.status}{order.approvedBy ? ` · ${order.approvedBy}` : ""}</TableCell>
                <TableCell><Button size="small" startIcon={<Print />} onClick={() => setPrintOrder(order)}>Imprimir</Button></TableCell>
              </TableRow>
            ))}</TableBody>
          </Table>
        )}
      </Paper>
      {printOrder && <PurchaseOrderPrint order={printOrder} />}
    </Stack>
  );
}

function PurchaseOrderPrint({ order }: { order: PurchaseOrder }) {
  const total = order.quantity * order.unitCost;
  return (
    <Box className="document-print-area">
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "2px solid #166534", paddingBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <img
            src="/PMO.jfif"
            alt=""
            onError={(event) => { event.currentTarget.style.display = "none"; }}
            style={{ maxWidth: 64, maxHeight: 54, objectFit: "contain" }}
          />
          <strong style={{ fontSize: 20, letterSpacing: 1 }}>PMOPTIMIZER</strong>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ color: "#166534", fontSize: 12, fontWeight: 700, letterSpacing: 1 }}>ORDEN DE COMPRA</div>
          <div style={{ fontSize: 22, fontWeight: 700 }}>{order.id}</div>
        </div>
      </header>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, margin: "28px 0" }}>
        <div><small style={{ color: "#64748b" }}>PROVEEDOR</small><div style={{ fontSize: 16, fontWeight: 600 }}>{order.supplier}</div></div>
        <div><small style={{ color: "#64748b" }}>FECHA DE EMISIÓN</small><div>{new Date().toLocaleDateString("es-CL")}</div></div>
        <div><small style={{ color: "#64748b" }}>SOLICITUD DE PEDIDO</small><div>{order.requestId}</div></div>
        <div><small style={{ color: "#64748b" }}>FECHA DE ENTREGA ESTIMADA</small><div>{order.expectedDate}</div></div>
      </div>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead><tr style={{ background: "#f1f5f9", textAlign: "left" }}>
          <th style={{ padding: 10, borderBottom: "1px solid #cbd5e1" }}>Código</th>
          <th style={{ padding: 10, borderBottom: "1px solid #cbd5e1" }}>Descripción</th>
          <th style={{ padding: 10, borderBottom: "1px solid #cbd5e1", textAlign: "right" }}>Cantidad</th>
          <th style={{ padding: 10, borderBottom: "1px solid #cbd5e1" }}>Unidad</th>
          <th style={{ padding: 10, borderBottom: "1px solid #cbd5e1", textAlign: "right" }}>Precio unitario</th>
          <th style={{ padding: 10, borderBottom: "1px solid #cbd5e1", textAlign: "right" }}>Total</th>
        </tr></thead>
        <tbody><tr>
          <td style={{ padding: 10, borderBottom: "1px solid #e2e8f0" }}>{order.materialCode}</td>
          <td style={{ padding: 10, borderBottom: "1px solid #e2e8f0" }}>{order.materialName}</td>
          <td style={{ padding: 10, borderBottom: "1px solid #e2e8f0", textAlign: "right" }}>{order.quantity}</td>
          <td style={{ padding: 10, borderBottom: "1px solid #e2e8f0" }}>{order.unit}</td>
          <td style={{ padding: 10, borderBottom: "1px solid #e2e8f0", textAlign: "right" }}>{money(order.unitCost)}</td>
          <td style={{ padding: 10, borderBottom: "1px solid #e2e8f0", textAlign: "right" }}>{money(total)}</td>
        </tr></tbody>
      </table>
      <div style={{ marginTop: 18, textAlign: "right", fontSize: 18, fontWeight: 700 }}>Total: {money(total)}</div>
      <div style={{ marginTop: 52, borderTop: "1px solid #cbd5e1", paddingTop: 14, color: "#475569", fontSize: 11 }}>
        Estado: {order.status}{order.approvedBy ? ` · Aprobada por ${order.approvedBy}` : ""}. Documento interno de prueba; no constituye un documento tributario.
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 80, marginTop: 72, textAlign: "center", fontSize: 11 }}>
        <div style={{ borderTop: "1px solid #64748b", paddingTop: 8 }}>Solicitado por</div>
        <div style={{ borderTop: "1px solid #64748b", paddingTop: 8 }}>Aprobación</div>
      </div>
    </Box>
  );
}
