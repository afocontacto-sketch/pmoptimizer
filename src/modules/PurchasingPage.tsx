import { useState } from "react";
import {
  Alert,
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
import { CheckCircleOutlined, ShoppingCart } from "@mui/icons-material";
import {
  makeSupplyId,
  purchaseOrdersStorageKey,
  purchaseRequestsStorageKey,
  readStoredList,
} from "./supplyData";
import type { PurchaseOrder, PurchaseQuote, PurchaseRequest } from "./supplyData";

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
  const [drafts, setDrafts] = useState<Record<string, QuoteDraft[]>>({});
  const [selectedQuotes, setSelectedQuotes] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const canApprove = role === "Administrador" || role === "PM Proyecto";
  const canQuote = role === "Administrador" || role === "Compras";

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
                            <TextField size="small" label={`Proveedor ${index + 1}`} value={quote.supplier} onChange={(event) => setDrafts((current) => {
                              const next = [...(current[request.id] ?? quoteDrafts)];
                              next[index] = { ...next[index], supplier: event.target.value };
                              return { ...current, [request.id]: next };
                            })} />
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
            <TableHead><TableRow><TableCell>OC</TableCell><TableCell>Solicitud</TableCell><TableCell>Proveedor</TableCell><TableCell>Material</TableCell><TableCell align="right">Total</TableCell><TableCell>Entrega</TableCell><TableCell>Estado / aprobación</TableCell></TableRow></TableHead>
            <TableBody>{orders.map((order) => (
              <TableRow key={order.id}>
                <TableCell>{order.id}</TableCell><TableCell>{order.requestId}</TableCell><TableCell>{order.supplier}</TableCell>
                <TableCell>{order.materialCode} · {order.materialName}</TableCell>
                <TableCell align="right">{money(order.quantity * order.unitCost)}</TableCell>
                <TableCell>{order.expectedDate}</TableCell>
                <TableCell>{order.status}{order.approvedBy ? ` · ${order.approvedBy}` : ""}</TableCell>
              </TableRow>
            ))}</TableBody>
          </Table>
        )}
      </Paper>
    </Stack>
  );
}
