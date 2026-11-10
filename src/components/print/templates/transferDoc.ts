import type { TransferOrder } from "../../../data/stock";
import { htmlTable } from "../printDocument";
import type { PrintTemplate } from "../printTemplates";

// Documento de traspaso (serie 32): enviado vs recibido por línea.
export function transferDoc(transfer: TransferOrder): PrintTemplate {
  const rows = transfer.lines.map((line) => [
    `${line.code} ${line.name}`, line.unit, line.sent, line.received ?? 0, Math.max(0, line.sent - (line.received ?? 0)),
  ]);
  return {
    title: "Traspaso entre almacenes",
    docNumber: transfer.id,
    subtitle: `${transfer.fromWarehouse} → ${transfer.toWarehouse}`,
    orientation: "portrait",
    meta: [
      ["Estado", transfer.status], ["Emitido por", transfer.createdBy], ["Fecha", new Date(transfer.createdAt).toLocaleString("es-CL")],
      ["Recibido por", transfer.receivedBy ?? "—"],
    ],
    bodyHtml: htmlTable(["Material", "Unidad", "Enviado", "Recibido", "Pendiente"], rows, { numericColumns: [2, 3, 4] }),
  };
}
