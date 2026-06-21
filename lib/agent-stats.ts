import getDb from "./db";
import { v4 as uuidv4 } from "uuid";

// One conversation row as delivered by N8N from the source agent console.
export type AgentStatInput = {
  agent_name?: string | null;
  customer_contact?: string | null;
  campaign_id?: string | null;
  is_customer_replied?: boolean | number | string | null;
  customer_last_reply?: string | null;
  customer_last_reply_at?: string | null;
  is_agent_replied?: boolean | number | string | null;
  agent_last_reply?: string | null;
  agent_last_reply_at?: string | null;
  is_open?: boolean | number | string | null;
  created_at?: string | null;
};

export type AgentStatRow = {
  id: string;
  agent_name: string | null;
  customer_contact: string | null;
  campaign_id: string | null;
  is_customer_replied: number;
  customer_last_reply: string | null;
  customer_last_reply_at: string | null;
  is_agent_replied: number;
  agent_last_reply: string | null;
  agent_last_reply_at: string | null;
  is_open: number;
  source_created_at: string | null;
};

export type AgentSummary = {
  agent_name: string;
  total_assignment: number;
  open: number;
  user_replies: number;
  agent_replies: number;
};

// Coerce assorted truthy shapes ("Yes"/"true"/1/true) to 0/1.
function toBit(v: unknown): number {
  if (v == null) return 0;
  if (typeof v === "number") return v ? 1 : 0;
  if (typeof v === "boolean") return v ? 1 : 0;
  const s = String(v).trim().toLowerCase();
  return s === "1" || s === "true" || s === "yes" || s === "y" ? 1 : 0;
}

/**
 * Replace a client's agent-stats snapshot wholesale. Agent stats are a current
 * snapshot from the source (not an append log), so each sync clears the old rows
 * and inserts the fresh set in one pass.
 */
export async function replaceAgentStats(clientId: string, items: AgentStatInput[]): Promise<number> {
  const db = await getDb();
  await db.prepare("DELETE FROM agent_stats WHERE client_id = ?").run(clientId);

  const now = new Date().toISOString();
  let inserted = 0;
  for (const it of items) {
    await db
      .prepare(
        `INSERT INTO agent_stats
           (id, client_id, agent_name, customer_contact, campaign_id,
            is_customer_replied, customer_last_reply, customer_last_reply_at,
            is_agent_replied, agent_last_reply, agent_last_reply_at,
            is_open, source_created_at, synced_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        uuidv4(),
        clientId,
        it.agent_name ?? null,
        it.customer_contact ?? null,
        it.campaign_id ?? null,
        toBit(it.is_customer_replied),
        it.customer_last_reply ?? null,
        it.customer_last_reply_at ?? null,
        toBit(it.is_agent_replied),
        it.agent_last_reply ?? null,
        it.agent_last_reply_at ?? null,
        toBit(it.is_open),
        it.created_at ?? null,
        now
      );
    inserted++;
  }
  return inserted;
}

// Optional inclusive day range (YYYY-MM-DD) filtering on source_created_at.
export type DateRange = { from?: string | null; to?: string | null };

// Build the shared WHERE clause + bind params for a client, optionally bounded
// by a created-at day range. Rows with a null source_created_at are excluded
// only when a range is supplied.
function scopeClause(clientId: string, range?: DateRange): { where: string; params: (string)[] } {
  const params: string[] = [clientId];
  let where = "client_id = ?";
  if (range?.from) { where += " AND date(source_created_at) >= date(?)"; params.push(range.from); }
  if (range?.to) { where += " AND date(source_created_at) <= date(?)"; params.push(range.to); }
  return { where, params };
}

/** Detail rows for a client, newest conversation first. */
export async function getAgentStatRows(clientId: string, range?: DateRange): Promise<AgentStatRow[]> {
  const db = await getDb();
  const { where, params } = scopeClause(clientId, range);
  return db
    .prepare(
      `SELECT id, agent_name, customer_contact, campaign_id,
              is_customer_replied, customer_last_reply, customer_last_reply_at,
              is_agent_replied, agent_last_reply, agent_last_reply_at,
              is_open, source_created_at
       FROM agent_stats WHERE ${where}
       ORDER BY source_created_at DESC`
    )
    .all<AgentStatRow>(...params);
}

/** Per-agent aggregate counts (drives the summary cards + charts). */
export async function getAgentSummary(clientId: string, range?: DateRange): Promise<AgentSummary[]> {
  const db = await getDb();
  const { where, params } = scopeClause(clientId, range);
  return db
    .prepare(
      `SELECT COALESCE(agent_name, 'Unknown') AS agent_name,
              COUNT(*) AS total_assignment,
              SUM(is_open) AS open,
              SUM(is_customer_replied) AS user_replies,
              SUM(is_agent_replied) AS agent_replies
       FROM agent_stats WHERE ${where}
       GROUP BY COALESCE(agent_name, 'Unknown')
       ORDER BY total_assignment DESC`
    )
    .all<AgentSummary>(...params);
}
