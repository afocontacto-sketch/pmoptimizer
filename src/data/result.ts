// Resultado uniforme de las mutaciones de data/: la UI muestra error si ok es false.
export type Result<T = void> = { ok: true; value: T } | { ok: false; error: string };

export const ok = <T>(value: T): Result<T> => ({ ok: true, value });
export const fail = <T = never>(error: string): Result<T> => ({ ok: false, error });
