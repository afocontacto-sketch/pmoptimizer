import { keys } from "../data/keys";
import { isRole } from "./roles";
import type { Role } from "./roles";

export type Session = { user: string; role: Role };

export function readSession(): Session | null {
  const raw = localStorage.getItem(keys.session);
  if (!raw) return null;
  try {
    const stored: unknown = JSON.parse(raw);
    if (
      typeof stored === "object" && stored !== null &&
      "user" in stored && typeof stored.user === "string" && stored.user.trim().length > 0 &&
      "role" in stored && isRole(stored.role)
    ) {
      return { user: stored.user, role: stored.role };
    }
  } catch {
    // Sesión corrupta: se elimina abajo.
  }
  localStorage.removeItem(keys.session);
  return null;
}

export function saveSession(session: Session): void {
  localStorage.setItem(keys.session, JSON.stringify(session));
}

export function clearSession(): void {
  localStorage.removeItem(keys.session);
}
