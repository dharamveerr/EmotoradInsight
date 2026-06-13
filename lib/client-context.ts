import { cookies } from "next/headers";
import getDb from "@/lib/db";
import { getSession } from "@/lib/auth";

export const ACTIVE_CLIENT_COOKIE = "ei_client";

export type ClientRow = { id: string; name: string; slug: string | null };
export type SessionUser = { id: string; role: string; client_id: string | null };

/** Resolve the logged-in user's DB row (role + client_id). */
export async function getSessionUser(): Promise<SessionUser | null> {
  const session = await getSession();
  if (!session) return null;
  const identifier = session.username as string;
  const db = await getDb();
  const user = await db
    .prepare("SELECT id, role, client_id FROM app_users WHERE username = ? OR email = ?")
    .get<SessionUser>(identifier, identifier);
  if (user) return user;

  // Env-var super-admin bypass (and any valid signed token) may have no matching
  // app_users row. Trust the role from the signed session so multi-tenant
  // features still resolve instead of silently failing.
  if (session.role) {
    return { id: `session:${identifier}`, role: session.role as string, client_id: null };
  }
  return null;
}

/**
 * The client whose data the current request operates on.
 * - client admin → their assigned client
 * - super_admin  → the client picked in the switcher (cookie), else first client
 * Returns null when no client can be resolved (e.g. super_admin, no clients yet).
 */
export async function getActiveClient(): Promise<ClientRow | null> {
  const user = await getSessionUser();
  if (!user) return null;
  const db = await getDb();

  if (user.role !== "super_admin") {
    if (!user.client_id) return null;
    const c = await db
      .prepare("SELECT id, name, slug FROM clients WHERE id = ?")
      .get<ClientRow>(user.client_id);
    return c || null;
  }

  // Super admin: cookie selection, validated against existing clients
  const jar = await cookies();
  const picked = jar.get(ACTIVE_CLIENT_COOKIE)?.value;
  if (picked) {
    const c = await db
      .prepare("SELECT id, name, slug FROM clients WHERE id = ?")
      .get<ClientRow>(picked);
    if (c) return c;
  }
  // Fallback: most recently created client
  return (
    (await db
      .prepare("SELECT id, name, slug FROM clients ORDER BY created_at ASC LIMIT 1")
      .get<ClientRow>()) || null
  );
}

export async function getActiveClientId(): Promise<string | null> {
  return (await getActiveClient())?.id ?? null;
}

export async function isSuperAdmin(): Promise<boolean> {
  const user = await getSessionUser();
  return user?.role === "super_admin";
}
