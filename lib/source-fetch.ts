import getDb from "@/lib/db";
import { getActiveClientId } from "@/lib/client-context";
import { ingestRows } from "@/lib/ingest";
import { SourceRow } from "@/lib/n8n-mapping";

// On-demand report data. Reports read the local `events` table, but events are
// hydrated lazily from the source (chat_log_variable) via N8N for the requested
// date range. N8N internally loops <=15-day windows (no single query spans more
// than 15 days), runs the Postgres query per window, and returns the combined
// rows. We then upsert them (idempotent) so the existing report SQL works.
//
// Freshness: past days are immutable — fetched once. Today is re-fetched only
// when its last fetch is older than TODAY_TTL_MS. If N8N_REPORT_FETCH_URL is not
// configured, hydration is a no-op and reports fall back to whatever events are
// already present (e.g. pushed via /api/webhook/n8n).

const TODAY_TTL_MS = 2 * 60 * 1000; // re-fetch today's data at most every 2 min

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

// Inclusive list of YYYY-MM-DD between from..to (capped for safety).
function daysInRange(from: string, to: string): string[] {
  const out: string[] = [];
  const start = new Date(from + "T00:00:00Z");
  const end = new Date(to + "T00:00:00Z");
  if (isNaN(start.getTime()) || isNaN(end.getTime()) || start > end) return out;
  for (let d = start, i = 0; d <= end && i < 400; d = new Date(d.getTime() + 86400000), i++) {
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

/**
 * Ensure the active client's events for [from, to] are present locally,
 * fetching missing/stale days from the source via N8N. Range defaults to the
 * current date. Safe no-op when sync isn't configured or the client has no
 * source identity.
 */
export async function ensureHydrated(from?: string, to?: string): Promise<void> {
  const url = process.env.N8N_REPORT_FETCH_URL;
  if (!url) return; // not configured — use local events as-is

  const clientId = await getActiveClientId();
  if (!clientId) return;

  const db = await getDb();
  const client = await db
    .prepare("SELECT org_id, source_client_id FROM clients WHERE id = ?")
    .get<{ org_id: string | null; source_client_id: string | null }>(clientId);
  if (!client?.org_id || !client?.source_client_id) return;

  const today = todayStr();
  const f = from || today;
  const t = to || today;
  const days = daysInRange(f, t);
  if (days.length === 0) return;

  // Which days actually need a fetch?
  const logRows = await db
    .prepare(`SELECT day, fetched_at FROM source_fetch_log WHERE client_id = ?`)
    .all<{ day: string; fetched_at: string }>(clientId);
  const log = new Map(logRows.map((r) => [r.day, r.fetched_at]));

  const now = Date.now();
  const needs = days.some((day) => {
    const at = log.get(day);
    if (!at) return true; // never fetched
    if (day === today) return now - new Date(at).getTime() > TODAY_TTL_MS; // stale today
    return false; // past day already fetched — immutable
  });
  if (!needs) return;

  // Send the whole range; N8N chunks it into <=15-day windows internally.
  let rows: SourceRow[] = [];
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(process.env.N8N_WEBHOOK_SECRET ? { "x-n8n-secret": process.env.N8N_WEBHOOK_SECRET } : {}),
      },
      body: JSON.stringify({ org_id: client.org_id, client_id: client.source_client_id, from: f, to: t }),
    });
    if (!res.ok) {
      console.error("ensureHydrated: N8N report fetch failed", res.status);
      return;
    }
    const data = await res.json();
    rows = Array.isArray(data?.rows) ? data.rows : Array.isArray(data) ? data : [];
  } catch (e) {
    console.error("ensureHydrated: N8N report fetch error", e);
    return;
  }

  await ingestRows(clientId, rows);

  // Mark every day in range fetched now (covers days the source had no rows for,
  // so we don't keep re-querying empty past days).
  const stamp = new Date().toISOString();
  for (const day of days) {
    await db
      .prepare(
        `INSERT INTO source_fetch_log (client_id, day, fetched_at) VALUES (?, ?, ?)
         ON CONFLICT(client_id, day) DO UPDATE SET fetched_at = excluded.fetched_at`
      )
      .run(clientId, day, stamp);
  }
}
