import { can } from "../app/permissions";
import type { Role } from "../app/roles";
import { useMemo, useState } from "react";
import { nextDocNumber } from "../data/docNumbering";
import { readWbsChoices } from "../data/contracts";
import { runAtomic, writeJson } from "../data/storage";
import { printDocument } from "../components/print/printDocument";
import { purchaseOrderDoc } from "../components/print/templates/purchaseOrderDoc";
import { quoteComparisonDoc } from "../components/print/templates/quoteComparisonDoc";
import { readPlannedCalls } from "./maintenanceData";
import type { FormEvent } from "react";
import {
  Alert,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
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
import { CheckCircleOutlined, Print, ShoppingCart, CompareArrows } from "@mui/icons-material";
import {
  makeSupplyId,
  purchaseOrdersStorageKey,
  purchaseRequestsStorageKey,
  readStoredList,
  suppliersStorageKey,
  quotationsStorageKey,
  requestCostAssignment,
  decidePurchaseOrder,
} from "./supplyData";
import type { PurchaseOrder, PurchaseQuote, PurchaseRequest, SupplierMaster, AwardHistory } from "./supplyData";

type QuoteDraft = { supplier: string; unitCost: string; expectedDate: string };
const emptyQuote = (needDate: string): QuoteDraft => ({ supplier: "", unitCost: "", expectedDate: needDate });

function money(value: number): string {
  return new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 }).format(value);
}

export default function PurchasingPage({ role, user }: { role: Role; user: string }) {
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
  const [awardHistory, setAwardHistory] = useState<AwardHistory[]>(() =>
    readStoredList<AwardHistory>(quotationsStorageKey));
  const [supplierName, setSupplierName] = useState("");
  const [drafts, setDrafts] = useState<Record<string, QuoteDraft[]>>({});
  const [selectedQuotes, setSelectedQuotes] = useState<Record<string, string>>({});
  const [manualWbs, setManualWbs] = useState<Record<string, string>>({});
  const plannedCalls = useMemo(() => readPlannedCalls(), []);
  const wbsChoices = useMemo(() => readWbsChoices(), []);
  const [comparatorModal, setComparatorModal] = useState<PurchaseRequest | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const canApprove = can(role, "purchase.approve");
  const canQuote = can(role, "purchase.quote");
  // El PM solo aprueba; Contabilidad y otros roles solo consultan.
  const approvalOnly = canApprove && !canQuote;
  const assignmentOf = (request: PurchaseRequest) => {
    const manual = manualWbs[request.id]?.split("|");
    return requestCostAssignment(request, plannedCalls) ?? (manual?.[1] ? { contract: manual[0], wbs: manual[1] } : null);
  };

  const addSupplier = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canQuote) {
      setError("Solo Compras puede administrar el maestro de proveedores.");
      return;
    }
    const name = supplierName.trim();
    if (!name || suppliers.some((supplier) => supplier.name.toLowerCase() === name.toLowerCase())) {
      setError("Ingresa un nombre de proveedor único para guardarlo en el maestro.");
      return;
    }
    const next = [...suppliers, { id: makeSupplyId("PROV"), name }];
    if (!writeJson(suppliersStorageKey, next)) {
      setError("No se pudo guardar el proveedor en este navegador.");
      return;
    }
    setSuppliers(next);
    setSupplierName("");
    setError("");
    setMessage(`Proveedor ${name} agregado al maestro.`);
  };

  const printDoc = (template: ReturnType<typeof purchaseOrderDoc>) => {
    printDocument({ ...template, user }).catch((printError: unknown) => {
      setError(printError instanceof Error ? printError.message : "No se pudo imprimir el documento.");
    });
  };

  const updateData = (nextRequests: PurchaseRequest[], nextOrders: PurchaseOrder[], nextAwardHistory?: AwardHistory[]) => {
    const steps: Array<() => boolean> = [
      () => writeJson(purchaseOrdersStorageKey, nextOrders),
      () => writeJson(purchaseRequestsStorageKey, nextRequests),
    ];
    if (nextAwardHistory) steps.push(() => writeJson(quotationsStorageKey, nextAwardHistory));
    if (!runAtomic([purchaseOrdersStorageKey, purchaseRequestsStorageKey, quotationsStorageKey], steps)) {
      setError("No se pudieron guardar los cambios de compras en este navegador.");
      return false;
    }
    if (nextAwardHistory) setAwardHistory(nextAwardHistory);
    setOrders(nextOrders);
    setRequests(nextRequests);
    setError("");
    return true;
  };

  const awardQuote = (request: PurchaseRequest, quote: PurchaseQuote) => {
    if (!quote) {
      setError(`Selecciona una cotización para ${request.id}.`);
      return;
    }
    if (!canQuote) {
      setError("Solo Compras puede emitir órdenes de compra.");
      return;
    }
    const assignment = assignmentOf(request);
    if (!assignment) {
      setComparatorModal(null);
      setError(`Selecciona el contrato/WBS de ${request.id} antes de emitir la OC.`);
      return;
    }

    let orderId: string;
    try {
      orderId = nextDocNumber("31", (candidate) => orders.some((item) => item.id === candidate));
    } catch (numberError) {
      setError(numberError instanceof Error ? numberError.message : "No se pudo numerar la OC.");
      return;
    }
    const today = new Date().toISOString().split("T")[0];
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
      contract: assignment.contract,
      wbs: assignment.wbs,
      createdBy: user,
      selectedQuoteId: quote.id,
      winningQuoteId: quote.id,
      status: "Pendiente aprobación",
    };

    const nextOrders = [...orders, order];
    const nextRequests = requests.map((item) => {
      if (item.id === request.id) {
        return {
          ...item,
          supplier: order.supplier,
          quotedUnitCost: quote.unitCost,
          purchaseOrderId: orderId,
          contract: assignment.contract,
          wbs: assignment.wbs,
          expectedDate: quote.expectedDate,
          status: "OC pendiente aprobación" as const,
          quotes: item.quotes?.map((q) => ({
            ...q,
            status: q.id === quote.id ? "Ganadora" as const : "Rechazada" as const,
            awardedDate: q.id === quote.id ? today : undefined,
          })),
        };
      }
      return item;
    });

    const nextAwardHistory: AwardHistory[] = [...awardHistory, {
      id: makeSupplyId("ADJ"),
      requestId: request.id,
      materialCode: request.materialCode,
      materialName: request.materialName,
      quantity: request.quantity,
      unit: request.unit,
      winningQuoteId: quote.id,
      supplier: quote.supplier,
      unitCost: quote.unitCost,
      awardedDate: today,
      expectedDate: quote.expectedDate,
      purchaseOrderId: orderId,
    }];

    if (updateData(nextRequests, nextOrders, nextAwardHistory)) {
      setComparatorModal(null);
      setMessage(`${orderId} creada. Cotización adjudicada a ${quote.supplier} · ${money(quote.unitCost)} c/u.`);
    }
  };

  const approveOrder = (order: PurchaseOrder, approve: boolean) => {
    if (!canApprove) {
      setError("Solo el PM del proyecto puede aprobar órdenes de compra.");
      return;
    }
    const freshOrders = readStoredList<PurchaseOrder>(purchaseOrdersStorageKey);
    const decision = decidePurchaseOrder(freshOrders, readStoredList<PurchaseRequest>(purchaseRequestsStorageKey), order.id, approve, user);
    if (!decision.ok) {
      setError(decision.error);
      return;
    }
    if (updateData(decision.value.requests, decision.value.orders)) {
      setMessage(approve ? `${order.id} aprobada por ${user}.` : `${order.id} rechazada; Compras puede ajustar la cotización.`);
    }
  };

  const startQuote = (request: PurchaseRequest) => {
    if (!canQuote) return;
    setDrafts((current) => ({ ...current, [request.id]: Array.from({ length: 3 }, () => emptyQuote(request.needDate)) }));
    const next = requests.map((item) => item.id === request.id
      ? { ...item, status: "Cotización en curso" as const }
      : item);
    updateData(next, orders);
  };

  const saveQuotes = (request: PurchaseRequest) => {
    if (!canQuote) {
      setError("Solo Compras puede registrar cotizaciones.");
      return;
    }
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
      {approvalOnly && (
        <Paper sx={{ p: 3 }}>
          <Typography variant="h6" sx={{ mb: 2 }}>Órdenes pendientes de aprobación</Typography>
          {orders.filter((order) => order.status === "Pendiente aprobación").length === 0
            ? <Typography color="text.secondary">No hay órdenes de compra pendientes de aprobación.</Typography> : (
              <Table size="small">
                <TableHead><TableRow><TableCell>OC</TableCell><TableCell>Proveedor</TableCell><TableCell>Material</TableCell><TableCell align="right">Total</TableCell><TableCell>Contrato / WBS</TableCell><TableCell>Acciones</TableCell></TableRow></TableHead>
                <TableBody>{orders.filter((order) => order.status === "Pendiente aprobación").map((order) => (
                  <TableRow key={order.id}>
                    <TableCell>{order.id}</TableCell><TableCell>{order.supplier}</TableCell>
                    <TableCell>{order.materialCode} · {order.materialName}</TableCell>
                    <TableCell align="right">{money(order.quantity * order.unitCost)}</TableCell>
                    <TableCell>{order.contract ?? "—"}<Typography variant="caption" sx={{ display: "block" }}>{order.wbs ?? "Sin WBS"}</Typography></TableCell>
                    <TableCell><Stack direction="row" spacing={1}>
                      <Button size="small" color="success" startIcon={<CheckCircleOutlined />} onClick={() => approveOrder(order, true)}>Aprobar</Button>
                      <Button size="small" color="error" onClick={() => approveOrder(order, false)}>Rechazar</Button>
                    </Stack></TableCell>
                  </TableRow>
                ))}</TableBody>
              </Table>
            )}
        </Paper>
      )}
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
      {!approvalOnly && <Paper sx={{ p: 3 }}>
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
                        {!requestCostAssignment(request, plannedCalls) && (
                          <TextField select size="small" label="Contrato · WBS (obligatorio)" value={manualWbs[request.id] ?? ""} onChange={(event) => setManualWbs((current) => ({ ...current, [request.id]: event.target.value }))}>
                            {wbsChoices.map((choice) => <MenuItem key={`${choice.contract}|${choice.wbs}`} value={`${choice.contract}|${choice.wbs}`}>{choice.contract} · {choice.wbs}</MenuItem>)}
                          </TextField>
                        )}
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
                    ) : canQuote && request.status === "Cotización en curso" && request.quotes?.length === 3 ? (
                      <Stack direction="row" spacing={1}>
                        <Button size="small" startIcon={<CompareArrows />} onClick={() => setComparatorModal(request)}>Ver comparativo</Button>
                      </Stack>
                    ) : null}
                  </TableCell>
                </TableRow>
              );
            })}</TableBody>
          </Table>
        )}
      </Paper>}
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
                <TableCell>{order.status}{order.approvedBy ? ` · ${order.approvedBy}` : ""}<Typography variant="caption" sx={{ display: "block" }}>{order.wbs ?? ""}</Typography></TableCell>
                <TableCell><Button size="small" startIcon={<Print />} onClick={() => printDoc(purchaseOrderDoc(order))}>Imprimir</Button></TableCell>
              </TableRow>
            ))}</TableBody>
          </Table>
        )}
      </Paper>
      {comparatorModal && <QuotationComparator request={comparatorModal} onClose={() => setComparatorModal(null)} onAward={awardQuote} onPrint={() => printDoc(quoteComparisonDoc(comparatorModal))} awardHistory={awardHistory} />}
    </Stack>
  );
}

function QuotationComparator({
  request,
  onClose,
  onAward,
  onPrint,
  awardHistory,
}: {
  request: PurchaseRequest;
  onPrint: () => void;
  onClose: () => void;
  onAward: (request: PurchaseRequest, quote: PurchaseQuote) => void;
  awardHistory: AwardHistory[];
}) {
  const quotes = request.quotes ?? [];
  const hasAwardedQuote = quotes.some((q) => q.status === "Ganadora");

  const calculateTotal = (quote: PurchaseQuote): number => {
    return request.quantity * quote.unitCost;
  };

  const findAwardRecord = (quoteId: string): AwardHistory | undefined => {
    return awardHistory.find((record) => record.winningQuoteId === quoteId);
  };

  return (
    <Dialog open={true} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>
        <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
          <CompareArrows color="primary" />
          <Typography variant="h6">Comparador de Cotizaciones</Typography>
        </Stack>
        <Typography variant="caption" color="text.secondary">
          {request.id} · {request.materialCode} ({request.materialName}) · {request.quantity} {request.unit}
        </Typography>
      </DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 2 }}>
          {hasAwardedQuote && (
            <Alert severity="info">
              Cotización adjudicada. Las órdenes de compra relacionadas están en revisión de aprobación.
            </Alert>
          )}
          <Table size="small" sx={{ border: "1px solid #e0e0e0" }}>
            <TableHead>
              <TableRow sx={{ backgroundColor: "#f5f5f5" }}>
                <TableCell sx={{ fontWeight: 700 }}>Proveedor</TableCell>
                <TableCell align="right" sx={{ fontWeight: 700 }}>Precio unitario</TableCell>
                <TableCell align="right" sx={{ fontWeight: 700 }}>Total</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Plazo de entrega</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Estado</TableCell>
                <TableCell align="center" sx={{ fontWeight: 700 }}>Acción</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {quotes.map((quote) => {
                const total = calculateTotal(quote);
                const status = quote.status ?? "Pendiente";
                const awardRecord = findAwardRecord(quote.id);
                return (
                  <TableRow key={quote.id} sx={{ backgroundColor: status === "Ganadora" ? "#e8f5e9" : status === "Rechazada" ? "#ffebee" : "inherit" }}>
                    <TableCell>
                      <Typography variant="body2" sx={{ fontWeight: 500 }}>
                        {quote.supplier}
                      </Typography>
                      {awardRecord && (
                        <Typography variant="caption" color="text.secondary">
                          Adjudicada: {awardRecord.awardedDate}
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell align="right">
                      {money(quote.unitCost)}
                    </TableCell>
                    <TableCell align="right" sx={{ fontWeight: 600 }}>
                      {money(total)}
                    </TableCell>
                    <TableCell>
                      {quote.expectedDate}
                    </TableCell>
                    <TableCell>
                      <Chip
                        size="small"
                        label={status}
                        color={status === "Ganadora" ? "success" : status === "Rechazada" ? "error" : "warning"}
                        variant={status === "Pendiente" ? "outlined" : "filled"}
                      />
                    </TableCell>
                    <TableCell align="center">
                      {status === "Pendiente" ? (
                        <Button
                          size="small"
                          variant="contained"
                          color="success"
                          onClick={() => onAward(request, quote)}
                        >
                          Adjudicar
                        </Button>
                      ) : (
                        <Chip size="small" label={status === "Ganadora" ? "Ganadora" : "Rechazada"} />
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>

          <Paper sx={{ p: 2, backgroundColor: "#fafafa" }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>
              Análisis de precios
            </Typography>
            <Stack spacing={0.5}>
              {quotes.length > 0 && (
                <>
                  <Typography variant="body2">
                    Menor precio: {money(Math.min(...quotes.map((q) => q.unitCost)))} ({
                      quotes.find((q) => q.unitCost === Math.min(...quotes.map((qm) => qm.unitCost)))?.supplier
                    })
                  </Typography>
                  <Typography variant="body2">
                    Mayor precio: {money(Math.max(...quotes.map((q) => q.unitCost)))} ({
                      quotes.find((q) => q.unitCost === Math.max(...quotes.map((qm) => qm.unitCost)))?.supplier
                    })
                  </Typography>
                  <Typography variant="body2">
                    Promedio: {money(quotes.reduce((sum, q) => sum + q.unitCost, 0) / quotes.length)}
                  </Typography>
                </>
              )}
            </Stack>
          </Paper>

          {awardHistory.filter((h) => h.requestId === request.id).length > 0 && (
            <Paper sx={{ p: 2, backgroundColor: "#f0f7ff" }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>
                Historial de adjudicaciones
              </Typography>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontSize: "0.75rem" }}>Proveedor</TableCell>
                    <TableCell align="right" sx={{ fontSize: "0.75rem" }}>Precio</TableCell>
                    <TableCell sx={{ fontSize: "0.75rem" }}>Fecha</TableCell>
                    <TableCell sx={{ fontSize: "0.75rem" }}>OC</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {awardHistory
                    .filter((h) => h.requestId === request.id)
                    .map((h) => (
                      <TableRow key={h.id}>
                        <TableCell sx={{ fontSize: "0.75rem" }}>{h.supplier}</TableCell>
                        <TableCell align="right" sx={{ fontSize: "0.75rem" }}>
                          {money(h.unitCost)}
                        </TableCell>
                        <TableCell sx={{ fontSize: "0.75rem" }}>{h.awardedDate}</TableCell>
                        <TableCell sx={{ fontSize: "0.75rem" }}>
                          <Chip size="small" label={h.purchaseOrderId} />
                        </TableCell>
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
            </Paper>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button startIcon={<Print />} onClick={onPrint}>Imprimir / Guardar PDF</Button>
        <Button onClick={onClose}>Cerrar</Button>
      </DialogActions>
    </Dialog>
  );
}
