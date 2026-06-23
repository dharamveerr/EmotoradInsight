// Ask N8N to discover a tenant's source variables. N8N runs the DISTINCT
// variable_name query (last 15 days) against chat_log_variable and posts the
// results to /api/sync/variables. Fire-and-forget: failures are logged, never
// block the caller (client creation or a manual sync click).
export function triggerVariableSync(orgId: string, sourceClientId: string) {
  const url = process.env.N8N_VARIABLE_SYNC_URL;
  if (!url) return; // not configured — sync can still be run manually/scheduled
  fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(process.env.N8N_WEBHOOK_SECRET ? { "x-n8n-secret": process.env.N8N_WEBHOOK_SECRET } : {}),
    },
    body: JSON.stringify({ org_id: orgId, client_id: sourceClientId }),
  }).catch((e) => console.error("triggerVariableSync failed:", e));
}

// Raw chat_log_variable row as returned by the variable-report N8N flow.
export type VariableReportRow = {
  chat_user_mobile?: string | null;
  variable_name?: string | null;
  variable_string_value?: string | null;
  bot_template_id?: string | null;
  created_at?: string | null;
};

/**
 * Fetch the variable report straight from the source DB via a dedicated N8N
 * flow. Synchronous: the app POSTs { org_id, client_id, from, to } and the flow
 * responds with { rows: [...] } (raw chat_log_variable columns). Returns null on
 * failure (not configured / error) so callers can fall back to local data; an
 * empty array means the flow ran and the source genuinely had no rows.
 */
export async function fetchVariableReport(
  orgId: string,
  sourceClientId: string,
  from: string,
  to: string
): Promise<VariableReportRow[] | null> {
  const url = process.env.N8N_VARIABLE_REPORT_URL;
  if (!url) return null;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(process.env.N8N_WEBHOOK_SECRET ? { "x-n8n-secret": process.env.N8N_WEBHOOK_SECRET } : {}),
      },
      body: JSON.stringify({ org_id: orgId, client_id: sourceClientId, from, to }),
    });
    if (!res.ok) {
      console.error("fetchVariableReport: N8N responded", res.status);
      return null;
    }
    const data = await res.json();
    return Array.isArray(data?.rows) ? data.rows : Array.isArray(data) ? data : [];
  } catch (e) {
    console.error("fetchVariableReport error:", e);
    return null;
  }
}

// Ask N8N to refresh a tenant's agent statistics. N8N queries the source agent
// console and posts the per-conversation snapshot to /api/sync/agent-stats.
// Fire-and-forget, same auth/secret convention as the variable sync.
export function triggerAgentStatsSync(orgId: string, sourceClientId: string) {
  const url = process.env.N8N_AGENT_STATS_SYNC_URL;
  if (!url) return; // not configured — view still renders the last synced data
  fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(process.env.N8N_WEBHOOK_SECRET ? { "x-n8n-secret": process.env.N8N_WEBHOOK_SECRET } : {}),
    },
    body: JSON.stringify({ org_id: orgId, client_id: sourceClientId }),
  }).catch((e) => console.error("triggerAgentStatsSync failed:", e));
}
