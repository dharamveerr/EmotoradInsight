import { NextRequest, NextResponse } from "next/server";
import getDb from "@/lib/db";
import { mergeClientVariables } from "@/lib/variables";

// Variable-discovery endpoint for N8N. After a client is added, N8N runs:
//   SELECT DISTINCT variable_name FROM chat_log_variable
//   WHERE org_id = ? AND client_id = ?
//     AND created_at >= NOW() - INTERVAL '15 days'
// and POSTs the resulting names here (POST /api/sync/variables). They are
// stored per-client and surface in the Create Tree variables panel.
//
// Auth: header `x-n8n-secret` must equal env N8N_WEBHOOK_SECRET.
// Body: { org_id, client_id, variables: string[] }
//   - org_id, client_id are the EXTERNAL source identifiers (not internal id)
//   - variables: the DISTINCT variable_name values from the source query

function authed(req: NextRequest): boolean {
  const secret = process.env.N8N_WEBHOOK_SECRET;
  if (!secret) return false; // refuse until a secret is configured
  return req.headers.get("x-n8n-secret") === secret;
}

export async function POST(req: NextRequest) {
  if (!authed(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { org_id?: string; client_id?: string; variables?: unknown[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const orgId = String(body.org_id || "").trim();
  const sourceClientId = String(body.client_id || "").trim();
  // Accept either legacy string[] names or template-tagged objects:
  //   { bot_template_id, name, value } | { variable_name, variable_string_value }
  const raw = Array.isArray(body.variables) ? body.variables : [];
  const items = raw.map((v) => {
    if (typeof v === "string") return v;
    const o = v as Record<string, unknown>;
    return {
      name: String(o.name ?? o.variable_name ?? ""),
      value: o.value != null ? String(o.value) : o.variable_string_value != null ? String(o.variable_string_value) : null,
      bot_template_id: o.bot_template_id != null ? String(o.bot_template_id) : null,
    };
  });
  if (!orgId || !sourceClientId) {
    return NextResponse.json({ error: "org_id and client_id are required" }, { status: 400 });
  }

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

  const { added, total } = await mergeClientVariables(client.id, items);
  await db
    .prepare("UPDATE clients SET last_synced_at = ? WHERE id = ?")
    .run(new Date().toISOString(), client.id);

  return NextResponse.json({ client: client.name, added, total });
}
