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
