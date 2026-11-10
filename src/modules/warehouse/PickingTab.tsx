import { useState } from "react";
import type { ChangeEvent } from "react";
import {
  Alert,
  Box,
  Button,
  Grid,
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
import { Add, Download } from "@mui/icons-material";
import { can } from "../../app/permissions";
import type { Role } from "../../app/roles";
import { KpiCard } from "../../components/KpiCard";
import { downloadCsv as downloadCsvRows, downloadTemplate } from "../../data/csv";
import { money } from "../../data/format";
import { useOperations } from "../../hooks/useOperations";
import type { Feedback } from "../../hooks/useOperations";
import { isPickableLocation, makeMovement } from "../operationsData";
import type { WorkOrder } from "../operationsData";

type Props = {
  user: string;
  role: Role;
  importWarehouseCsv: (event: ChangeEvent<HTMLInputElement>) => void;
  importMessage: string;
  importError: string;
} & Feedback;

export default function PickingTab({ user, role, setMessage, setError, importWarehouseCsv, importMessage: warehouseImportMessage, importError: warehouseImportError }: Props) {
  const { orders, stock, setStock, updateOrder, recordMovement } = useOperations();
  const [selectedWarehouseOrderId, setSelectedWarehouseOrderId] = useState("");
  const [pickingTaken, setPickingTaken] = useState<Record<string, string>>({});
  const canChangePicking = can(role, "warehouse.pick");
  const availableOrders = orders.filter((order) => order.type !== "ESPERA" && order.status !== "Cerrada");
  const transitLines = stock.filter((bin) => bin.status === "En tránsito" && bin.quantity > 0);
  const physicalBins = stock.filter((bin) => bin.status !== "En tránsito");
  const pendingPutawayBins = stock.filter((bin) =>
    bin.status === "Libre utilización" && bin.location === "REC-UBICAR",
  );
  const availableMaterials = new Set(stock
    .filter((bin) => bin.status === "Libre utilización" && isPickableLocation(bin.location) && bin.quantity > bin.reserved)
    .map((bin) => bin.code)).size;
  const qualityLots = stock.filter((bin) => bin.status === "Bloqueado calidad" && bin.quantity > 0).length;
  const openPurchaseOrders = new Set(transitLines.map((bin) => bin.reference)).size;
  const physicalInventoryValue = physicalBins.reduce((sum, bin) => sum + bin.quantity * bin.unitCost, 0);

  const sortedPickList = (order: WorkOrder) => {
    const remaining = order.materials.map((item) => ({
      ...item,
      quantity: Math.max(0,
        item.required
        - item.picked
        - (order.reservedPicks ?? []).filter((pick) => pick.code === item.code).reduce((sum, pick) => sum + pick.quantity, 0),
      ),
    })).filter((item) => item.quantity > 0);
    const picks = remaining.flatMap((item) => {
      let needed = item.quantity;
      return stock
        .filter((bin) =>
          bin.code === item.code &&
          bin.status === "Libre utilización" &&
          isPickableLocation(bin.location),
        )
        .sort((a, b) => a.location.localeCompare(b.location, undefined, { numeric: true }))
        .flatMap((bin) => {
          const canPick = Math.min(needed, bin.quantity - bin.reserved);
          if (canPick <= 0) return [];
          needed -= canPick;
          return [{ bin, quantity: canPick }];
        });
    });
    return { remaining, picks };
  };
  const selectedWarehouseOrder = availableOrders.find((order) => order.id === selectedWarehouseOrderId);
  const warehousePickRows = selectedWarehouseOrder
    ? selectedWarehouseOrder.materials.map((material) => {
      const remaining = Math.max(0, material.required - material.picked);
      const reserved = (selectedWarehouseOrder.reservedPicks ?? [])
        .filter((pick) => pick.code === material.code).reduce((sum, pick) => sum + pick.quantity, 0);
      const planned = sortedPickList(selectedWarehouseOrder).picks
        .filter((pick) => pick.bin.code === material.code).reduce((sum, pick) => sum + pick.quantity, 0);
      const bins = [
        ...(selectedWarehouseOrder.reservedPicks ?? []).filter((pick) => pick.code === material.code).flatMap((pick) => {
          const bin = stock.find((item) => item.id === pick.binId);
          return bin ? [`${bin.warehouse}/${bin.location}`] : [];
        }),
        ...sortedPickList(selectedWarehouseOrder).picks.filter((pick) => pick.bin.code === material.code)
          .map((pick) => `${pick.bin.warehouse}/${pick.bin.location}`),
      ];
      return { ...material, quantity: material.required, remaining, reserved, planned, locations: [...new Set(bins)].join(", ") };
    }).filter((item) => item.remaining > 0)
    : [];
  const exportPicking = (order: WorkOrder) => {
    downloadCsvRows(`picking_${order.id}.csv`,
      ["Orden", "Material", "Código", "Ubicación sugerida", "Cantidad requerida", "Cantidad tomada"],
      warehousePickRows.map((item) => [
        order.id,
        item.name ?? item.code,
        item.code,
        item.locations,
        item.remaining,
        pickingTaken[`${order.id}:${item.code}`] ?? "",
      ]));
  };

  const preparePicking = (order: WorkOrder) => {
    if (!canChangePicking) {
      setError("Tu rol no tiene permiso para preparar picking.");
      return;
    }
    const { remaining, picks } = sortedPickList(order);
    if (!remaining.length) {
      setError(`No quedan materiales pendientes para ${order.id}.`);
      setMessage("");
      return;
    }
    const availableByCode = new Map<string, number>();
    for (const pick of picks) {
      availableByCode.set(pick.bin.code, (availableByCode.get(pick.bin.code) ?? 0) + pick.quantity);
    }
    const short = remaining.filter((item) => (availableByCode.get(item.code) ?? 0) < item.quantity);
    if (short.length) {
      setError(`Stock libre insuficiente para ${order.id}: ${short.map((item) => item.code).join(", ")}. Revisa Calidad, tránsito o compras.`);
      setMessage("");
      return;
    }
    setStock((current) => current.map((bin) => {
      const reserved = picks.filter((pick) => pick.bin.id === bin.id).reduce((sum, pick) => sum + pick.quantity, 0);
      return reserved ? { ...bin, reserved: bin.reserved + reserved } : bin;
    }));
    picks.forEach((pick) => recordMovement(makeMovement(
      "Reserva picking",
      pick.bin.code,
      pick.quantity,
      `${pick.bin.warehouse}/${pick.bin.location}`,
      order.id,
      order.id,
      user,
    )));
    updateOrder(order.id, (current) => ({
      ...current,
      reservedPicks: [
        ...(current.reservedPicks ?? []),
        ...picks.map((pick) => ({ binId: pick.bin.id, code: pick.bin.code, quantity: pick.quantity })),
      ],
    }));
    setMessage(`Picking reservado para ${order.id} siguiendo ubicación ascendente.`);
    setError("");
  };

  const confirmConsumption = (order: WorkOrder) => {
    if (!canChangePicking) {
      setError("Tu rol no tiene permiso para confirmar el consumo de materiales.");
      return;
    }
    const remaining = order.materials.map((item) => ({
      code: item.code,
      quantity: Math.max(0, item.required - item.picked),
    })).filter((item) => item.quantity > 0);
    const picks = (order.reservedPicks ?? []).flatMap((pick) => {
      const bin = stock.find((item) => item.id === pick.binId);
      return bin ? [{ bin, quantity: pick.quantity }] : [];
    });
    const reservedByCode = new Map<string, number>();
    for (const pick of picks) reservedByCode.set(pick.bin.code, (reservedByCode.get(pick.bin.code) ?? 0) + pick.quantity);
    const takenByCode = new Map(remaining.map((item) => {
      const raw = pickingTaken[`${order.id}:${item.code}`];
      return [item.code, raw?.trim() ? Number(raw) : item.quantity];
    }));
    if (!remaining.length || remaining.some((item) => {
      const taken = takenByCode.get(item.code) ?? 0;
      return !Number.isFinite(taken) || taken <= 0 || taken > item.quantity ||
        taken > (reservedByCode.get(item.code) ?? 0);
    })) {
      setError(`Indica cantidades tomadas válidas y no mayores al saldo reservado para ${order.id}.`);
      return;
    }
    if (picks.some((pick) => pick.quantity > pick.bin.quantity || pick.quantity > pick.bin.reserved)) {
      setError("La reserva ya no coincide con el saldo disponible. Libera y vuelve a preparar el picking.");
      return;
    }
    let remainingToConsume = new Map(takenByCode);
    const consumedPicks = picks.map((pick) => {
      const quantity = Math.min(pick.quantity, remainingToConsume.get(pick.bin.code) ?? 0);
      remainingToConsume.set(pick.bin.code, Math.max(0, (remainingToConsume.get(pick.bin.code) ?? 0) - quantity));
      return { ...pick, consumed: quantity };
    });
    setStock((current) => current.map((bin) => {
      const reserved = picks.filter((pick) => pick.bin.id === bin.id).reduce((sum, pick) => sum + pick.quantity, 0);
      const consumed = consumedPicks.filter((pick) => pick.bin.id === bin.id).reduce((sum, pick) => sum + pick.consumed, 0);
      return reserved ? { ...bin, quantity: bin.quantity - consumed, reserved: Math.max(0, bin.reserved - reserved) } : bin;
    }));
    consumedPicks.forEach((pick) => {
      if (pick.consumed > 0) recordMovement(makeMovement(
        "Consumo OT", pick.bin.code, pick.consumed,
        `${pick.bin.warehouse}/${pick.bin.location}`, order.id, `${order.id} · ${order.wbs}`, user,
      ));
      if (pick.quantity > pick.consumed) recordMovement(makeMovement(
        "Liberación picking", pick.bin.code, pick.quantity - pick.consumed,
        order.id, `${pick.bin.warehouse}/${pick.bin.location}`, order.id, user,
      ));
    });
    updateOrder(order.id, (current) => {
      const additions = remaining.map((item) => {
        const materialPicks = consumedPicks.filter((pick) => pick.bin.code === item.code && pick.consumed > 0);
        const pickedQuantity = materialPicks.reduce((sum, pick) => sum + pick.consumed, 0);
        const unitCost = materialPicks.reduce((sum, pick) => sum + pick.consumed * pick.bin.unitCost, 0)
          / Math.max(1, pickedQuantity);
        return { code: item.code, quantity: takenByCode.get(item.code) ?? 0, unitCost };
      });
      const materials = current.materials.map((line) => {
        const taken = additions.find((item) => item.code === line.code);
        if (!taken || taken.quantity <= 0) return line;
        const picked = line.picked + taken.quantity;
        const unitCostAvg = line.picked > 0
          ? ((line.unitCostAvg ?? 0) * line.picked + taken.unitCost * taken.quantity) / picked
          : taken.unitCost;
        return { ...line, picked, unitCostAvg };
      });
      const pickingStatus = materials.every((line) => line.picked >= line.required) ? "Picking completo" : "Picking parcial";
      return { ...current, materials, pickingStatus, reservedPicks: [] };
    });
    setPickingTaken((current) => Object.fromEntries(Object.entries(current).filter(([key]) => !key.startsWith(`${order.id}:`))));
    setMessage(`Cantidades tomadas registradas en ${order.id}; el excedente reservado se liberó y el consumo se cargará al costo de la OT/WBS.`);
    setError("");
  };

  const releasePicking = (order: WorkOrder) => {
    if (!canChangePicking) {
      setError("Tu rol no tiene permiso para liberar reservas de picking.");
      return;
    }
    const reservations = order.reservedPicks ?? [];
    if (!reservations.length) return;
    setStock((current) => current.map((bin) => {
      const reserved = reservations
        .filter((pick) => pick.binId === bin.id)
        .reduce((sum, pick) => sum + pick.quantity, 0);
      return reserved ? { ...bin, reserved: Math.max(0, bin.reserved - reserved) } : bin;
    }));
    reservations.forEach((pick) => {
      const bin = stock.find((item) => item.id === pick.binId);
      recordMovement(makeMovement(
        "Liberación picking",
        pick.code,
        pick.quantity,
        order.id,
        bin ? `${bin.warehouse}/${bin.location}` : "Stock",
        order.id,
        user,
      ));
    });
    updateOrder(order.id, (current) => ({ ...current, reservedPicks: [] }));
    setMessage(`Reservas de ${order.id} liberadas; el stock vuelve a estar disponible.`);
    setError("");
  };

  const exportWarehouseTemplate = () => downloadTemplate("plantilla_almacen.csv",
    ["code", "name", "warehouse", "location", "status", "quantity", "unit", "unitCost", "reference"],
    ["MAT-114", "Cinta aislante 3M", "Bodega Central", "A-01-02", "Libre utilización", 10, "rollo", 3500, ""]);

  return (
    <Paper sx={{ p: 3 }}>
      <Stack direction={{ xs: "column", md: "row" }} sx={{ justifyContent: "space-between", alignItems: { xs: "flex-start", md: "center" }, gap: 2, mb: 2 }}>
        <Box>
          <Typography variant="h6">Picking por OT · secuencia de ubicación</Typography>
          <Typography variant="body2" color="text.secondary">El stock se reserva primero y solo se descuenta al confirmar el consumo contra la OT/WBS.</Typography>
        </Box>
        <Stack direction="row" sx={{ flexWrap: "wrap", gap: 1 }}>
          <Button startIcon={<Download />} onClick={exportWarehouseTemplate}>Plantilla CSV</Button>
          {role === "Administrador" && <Button component="label" variant="outlined" startIcon={<Add />}>
            Importar saldos
            <input hidden type="file" accept=".csv,text/csv" onChange={importWarehouseCsv} />
          </Button>}
        </Stack>
      </Stack>
      {warehouseImportMessage && <Alert severity="success" sx={{ mb: 2 }}>{warehouseImportMessage}</Alert>}
      {warehouseImportError && <Alert severity="error" sx={{ mb: 2 }}>{warehouseImportError}</Alert>}
      <Grid container spacing={2} sx={{ mb: 2 }}>
        {[
          { label: "Materiales disponibles", value: `${availableMaterials} códigos` },
          { label: "Lotes en inspección QC", value: `${qualityLots} lotes` },
          { label: "Órdenes de compra en tránsito", value: `${openPurchaseOrders} OC` },
          { label: "Pendiente de ubicación", value: `${pendingPutawayBins.length} lotes` },
          { label: "Valorización física demo", value: money(physicalInventoryValue) },
        ].map((item) => (
          <Grid size={{ xs: 12, sm: 6, lg: 3 }} key={item.label}>
            <KpiCard outlined label={item.label} value={item.value} />
          </Grid>
        ))}
      </Grid>
      <Paper variant="outlined" sx={{ mb: 2 }}>
        <Table size="small">
          <TableHead><TableRow><TableCell>OT</TableCell><TableCell>Equipo / contrato</TableCell><TableCell>Componentes</TableCell><TableCell>Estado picking</TableCell><TableCell /></TableRow></TableHead>
          <TableBody>{availableOrders.map((order) => (
            <TableRow key={order.id} selected={selectedWarehouseOrder?.id === order.id}>
              <TableCell>{order.id}</TableCell><TableCell>{order.equipment}<Typography variant="caption" sx={{ display: "block" }}>{order.contract} / {order.wbs}</Typography></TableCell>
              <TableCell>{order.materials.length} materiales</TableCell><TableCell>{order.reservedPicks?.length ? "Reservado" : "Pendiente"}</TableCell>
              <TableCell><Button size="small" onClick={() => setSelectedWarehouseOrderId(order.id)}>Abrir picking</Button></TableCell>
            </TableRow>
          ))}</TableBody>
        </Table>
      </Paper>
      {selectedWarehouseOrder && (
        <Paper className="picking-print-area" variant="outlined" sx={{ p: 2, mb: 2 }}>
          <Stack direction={{ xs: "column", sm: "row" }} sx={{ justifyContent: "space-between", alignItems: { sm: "center" }, gap: 1, mb: 1 }}>
            <Box><Typography variant="h6">Picking · {selectedWarehouseOrder.id}</Typography><Typography variant="caption" color="text.secondary">{selectedWarehouseOrder.equipment} · {selectedWarehouseOrder.contract} / {selectedWarehouseOrder.wbs}</Typography></Box>
            <Stack direction="row" spacing={1}><Button onClick={() => exportPicking(selectedWarehouseOrder)}>Exportar CSV</Button><Button onClick={() => window.print()}>Imprimir</Button></Stack>
          </Stack>
          <Table size="small">
            <TableHead><TableRow><TableCell>Ubicación lógica</TableCell><TableCell>Material</TableCell><TableCell align="right">Requerido</TableCell><TableCell align="right">Reservado</TableCell><TableCell>Cantidad tomada</TableCell></TableRow></TableHead>
            <TableBody>{warehousePickRows.map((item) => (
              <TableRow key={item.code}>
                <TableCell>{item.locations || "Sin stock disponible"}</TableCell><TableCell>{item.code} · {item.name}</TableCell>
                <TableCell align="right">{item.remaining} {item.unit}</TableCell><TableCell align="right">{item.reserved || item.planned} {item.unit}</TableCell>
                <TableCell><TextField size="small" type="number" value={pickingTaken[`${selectedWarehouseOrder.id}:${item.code}`] ?? ""} onChange={(event) => setPickingTaken((current) => ({ ...current, [`${selectedWarehouseOrder.id}:${item.code}`]: event.target.value }))} slotProps={{ htmlInput: { min: 0, max: item.remaining, step: "any" } }} sx={{ width: 130 }} /></TableCell>
              </TableRow>
            ))}</TableBody>
          </Table>
          <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
            {role !== "Supervisor" && <>
              <Button size="small" disabled={!canChangePicking} onClick={() => preparePicking(selectedWarehouseOrder)}>Preparar picking</Button>
              <Button size="small" variant="contained" disabled={!selectedWarehouseOrder.reservedPicks?.length || !canChangePicking} onClick={() => confirmConsumption(selectedWarehouseOrder)}>Confirmar cantidades tomadas</Button>
              <Button size="small" color="warning" disabled={!selectedWarehouseOrder.reservedPicks?.length || !canChangePicking} onClick={() => releasePicking(selectedWarehouseOrder)}>Liberar reserva</Button>
            </>}
          </Stack>
        </Paper>
      )}
      <Alert severity="info">La zona REC-UBICAR no se considera disponible para picking hasta que se asigne un pasillo/estante. El stock en inspección o tránsito tampoco se puede retirar.</Alert>
    </Paper>
  );
}
