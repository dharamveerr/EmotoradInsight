import { NextRequest, NextResponse } from "next/server";
import getDb from "@/lib/db";
import { replaceAgentStats, AgentStatInput } from "@/lib/agent-stats";

// Agent-stats callback for N8N. N8N queries the source agent console and POSTs
// the current per-conversation snapshot here. Rows replace the client's prior
// snapshot wholesale.
//
// Auth: header `x-n8n-secret` must equal env N8N_WEBHOOK_SECRET.
// Body: { org_id, client_id, agents: AgentStatInput[] }
//   - org_id, client_id are the EXTERNAL source identifiers (not internal id)

function authed(req: NextRequest): boolean {
  const secret = process.env.N8N_WEBHOOK_SECRET;
  if (!secret) return false;
  return req.headers.get("x-n8n-secret") === secret;
}

export async function POST(req: NextRequest) {
  if (!authed(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { org_id?: string; client_id?: string; agents?: unknown[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const orgId = String(body.org_id || "").trim();
  const sourceClientId = String(body.client_id || "").trim();
  if (!orgId || !sourceClientId) {
    return NextResponse.json({ error: "org_id and client_id are required" }, { status: 400 });
  }

  // Accept the source's own column names too, normalising to AgentStatInput.
  const raw = Array.isArray(body.agents) ? body.agents : [];
  const items: AgentStatInput[] = raw.map((r) => {
    const o = (r ?? {}) as Record<string, unknown>;
    const pick = (...keys: string[]) => {
      for (const k of keys) if (o[k] != null) return o[k] as never;
      return null;
    };
    return {
      agent_name: pick("agent_name", "agentName", "name") as string | null,
      customer_contact: pick("customer_contact", "customerContact", "contact") as string | null,
      campaign_id: pick("campaign_id", "campaignId") as string | null,
      is_customer_replied: pick("is_customer_replied", "isCustomerReplied"),
      customer_last_reply: pick("customer_last_reply", "customerLastReply") as string | null,
      customer_last_reply_at: pick("customer_last_reply_at", "customerLastReplyAt", "customerLastReplyTime") as string | null,
      is_agent_replied: pick("is_agent_replied", "isAgentReplied"),
      agent_last_reply: pick("agent_last_reply", "agentLastReply") as string | null,
      agent_last_reply_at: pick("agent_last_reply_at", "agentLastReplyAt", "agentLastReplyTime") as string | null,
      is_open: pick("is_open", "isOpen", "open"),
      created_at: pick("created_at", "createdAt") as string | null,
    };
  });

  const db = await getDb();
  const client = await db
    .prepare("SELECT id, name FROM clients WHERE org_id = ? AND source_client_id = ?")
    .get<{ id: string; name: string }>(orgId, sourceClientId);
  if (!client) {
    return NextResponse.json(
      { error: `No client matches org_id=${orgId} client_id=${sourceClientId}. Add it first.` },
      { status: 404 }
    );
  }

  const inserted = await replaceAgentStats(client.id, items);
  await db
    .prepare("UPDATE clients SET last_synced_at = ? WHERE id = ?")
    .run(new Date().toISOString(), client.id);

  return NextResponse.json({ client: client.name, inserted });
}
