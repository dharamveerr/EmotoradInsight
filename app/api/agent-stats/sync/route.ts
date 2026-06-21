import { NextRequest, NextResponse } from "next/server";
import getDb from "@/lib/db";
import { getSession } from "@/lib/auth";
import { getActiveClientId } from "@/lib/client-context";
import { triggerAgentStatsSync } from "@/lib/n8n";
import { denyIfNoPermission, PERMISSIONS } from "@/lib/permissions";

// Manual "Sync" from the Agent Statistics view. Resolves the active client's
// source identity and asks N8N to re-pull the agent snapshot, which it posts to
// /api/sync/agent-stats. Mirrors the variable-sync trigger.
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const denied = await denyIfNoPermission(req, PERMISSIONS.AGENT_STATISTICS);
  if (denied) return denied;

  const clientId = await getActiveClientId();
  if (!clientId) return NextResponse.json({ error: "No active client" }, { status: 400 });

  const db = await getDb();
  const client = await db
    .prepare("SELECT org_id, source_client_id FROM clients WHERE id = ?")
    .get<{ org_id: string | null; source_client_id: string | null }>(clientId);

  if (!client?.org_id || !client?.source_client_id) {
    return NextResponse.json(
      { error: "Active client has no org_id / client_id. Add them to enable sync." },
      { status: 400 }
    );
  }

  if (!process.env.N8N_AGENT_STATS_SYNC_URL) {
    return NextResponse.json({ error: "Agent stats sync is not configured (N8N_AGENT_STATS_SYNC_URL)." }, { status: 503 });
  }

  triggerAgentStatsSync(client.org_id, client.source_client_id);
  return NextResponse.json({ triggered: true });
}
