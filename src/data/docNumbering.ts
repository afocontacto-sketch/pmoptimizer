import { keys } from "./keys";
import { readJson, writeJson } from "./storage";

export type OrderType = "PRE" | "OVH" | "COR" | "GAR" | "REP" | "ESPERA";
export type Series = "51" | "61" | "71" | "81" | "91" | "13" | "21" | "31" | "32";

// Q2: ESPERA usa la serie 13 (REP sigue en 91).
export const orderTypeSeries: Record<OrderType, Series> = {
  PRE: "51",
  COR: "61",
  OVH: "71",
  GAR: "81",
  REP: "91",
  ESPERA: "13",
};

export const MAX_SEQUENCE = 999999;
const MAX_COLLISION_RETRIES = 50;

export class DocNumberError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DocNumberError";
  }
}

export function formatDocNumber(series: string, sequence: number): string {
  return `${series}${String(sequence).padStart(6, "0")}`;
}

// El contador se persiste antes de devolver el número: si el documento no se guarda, el número queda quemado.
export function nextDocNumber(series: Series, exists?: (id: string) => boolean): string {
  const counters = readJson<Record<string, number>>(keys.docCounters, {});
  let sequence = (counters[series] ?? 0) + 1;
  let attempts = 0;
  for (;;) {
    if (sequence > MAX_SEQUENCE) throw new DocNumberError("Serie agotada");
    const id = formatDocNumber(series, sequence);
    if (!exists?.(id)) {
      const fresh = readJson<Record<string, number>>(keys.docCounters, {});
      if (!writeJson(keys.docCounters, { ...fresh, [series]: Math.max(sequence, fresh[series] ?? 0) })) {
        throw new DocNumberError("No se pudo guardar el contador de documentos");
      }
      return id;
    }
    attempts += 1;
    if (attempts >= MAX_COLLISION_RETRIES) throw new DocNumberError("No se encontró un número libre");
    sequence += 1;
  }
}
