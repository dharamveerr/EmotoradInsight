import { NextRequest, NextResponse } from "next/server";
import getDb from "@/lib/db";

// N8N reads this before querying Postgres so it only pulls rows newer than the
// last successful sync. Auth: header x-n8n-secret == env N8N_WEBHOOK_SECRET.
// Query: ?org_id=...&client_id=...  (external source identifiers)
export async function GET(req: NextRequest) {
  const secret = process.env.N8N_WEBHOOK_SECRET;
  if (!secret || req.headers.get("x-n8n-secret") !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const orgId = (searchParams.get("org_id") || "").trim();
  const sourceClientId = (searchParams.get("client_id") || "").trim();
  if (!orgId || !sourceClientId) {
    return NextResponse.json({ error: "org_id and client_id are required" }, { status: 400 });
  }

  const db = await getDb();
  const client = await db
    .prepare("SELECT id, last_synced_at FROM clients WHERE org_id = ? AND source_client_id = ?")
    .get<{ id: string; last_synced_at: string | null }>(orgId, sourceClientId);
  if (!client) {
    return NextResponse.json({ error: "No matching client" }, { status: 404 });
  }

  // Epoch fallback so the first run pulls everything
  return NextResponse.json({
    cursor: client.last_synced_at || "1970-01-01T00:00:00.000Z",
  });
}
