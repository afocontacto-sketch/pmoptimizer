import { useEffect, useState } from "react";

// Reloj que se actualiza cada intervalMs (por defecto 30 s) para entradas de tiempo abiertas.
export function useNow(intervalMs = 30000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timerId = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(timerId);
  }, [intervalMs]);
  return now;
}
