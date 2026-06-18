import { NextResponse } from "next/server";
import getDb from "@/lib/db";
import { getSession } from "@/lib/auth";
import { getActiveClientId } from "@/lib/client-context";
import { triggerVariableSync } from "@/lib/n8n";

// Manual "Sync variables" action from the Create Tree panel. Resolves the
// active client's source identity and asks N8N to re-run the DISTINCT
// variable_name query (last 15 days). N8N posts results to /api/sync/variables
// where they are merged additively (new ones flagged). This is the ONLY
// auto/manual trigger besides client creation — no background polling.
export async function POST() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

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

  if (!process.env.N8N_VARIABLE_SYNC_URL) {
    return NextResponse.json({ error: "Variable sync is not configured (N8N_VARIABLE_SYNC_URL)." }, { status: 503 });
  }

  triggerVariableSync(client.org_id, client.source_client_id);
  return NextResponse.json({ triggered: true });
}
