import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import getDb from "@/lib/db";
import { mapRows, SourceRow } from "@/lib/n8n-mapping";

// Ingestion endpoint for N8N. N8N runs the `chat_log_variable` Postgres query
// per client and POSTs the rows here. Rows are mapped to events, scoped to the
// matching internal client, and upserted idempotently.
//
// Auth: header `x-n8n-secret` must equal env N8N_WEBHOOK_SECRET.
// Body: { org_id, client_id, rows: [ ...chat_log_variable rows... ], dryRun? }
//   - org_id, client_id are the EXTERNAL source identifiers (not internal id)
//   - dryRun: if true, parse + report only, write nothing (for verifying mapping)

function authed(req: NextRequest): boolean {
  const secret = process.env.N8N_WEBHOOK_SECRET;
  if (!secret) return false; // refuse until a secret is configured
  return req.headers.get("x-n8n-secret") === secret;
}

export async function POST(req: NextRequest) {
  if (!authed(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { org_id?: string; client_id?: string; rows?: SourceRow[]; dryRun?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const orgId = String(body.org_id || "").trim();
  const sourceClientId = String(body.client_id || "").trim();
  const rows = Array.isArray(body.rows) ? body.rows : [];
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

  const { events, skipped } = mapRows(rows);

  // Dry run: echo what was parsed so the mapping can be verified against real data
  if (body.dryRun) {
    return NextResponse.json({
      dryRun: true,
      client: client.name,
      received: rows.length,
      mappedEvents: events.length,
      skipped,
      sample: events.slice(0, 5),
    });
  }

  let inserted = 0;
  let maxCreatedAt = "";
  for (const e of events) {
    const res = await db
      .prepare(
        `INSERT INTO events (id, userId, journey, step, timestamp, metadata, client_id, source_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(source_id) WHERE source_id IS NOT NULL DO UPDATE SET
           metadata = excluded.metadata,
           timestamp = excluded.timestamp`
      )
      .run(
        uuidv4(), e.userId, e.journey, e.step, e.timestamp,
        JSON.stringify(e.metadata), client.id, e.sourceId
      );
    inserted += res.changes;
    if (e.timestamp > maxCreatedAt) maxCreatedAt = e.timestamp;
  }

  // Advance the per-client cursor so the next N8N run only pulls newer rows
  if (maxCreatedAt) {
    await db
      .prepare(
        `UPDATE clients SET last_synced_at = ?
         WHERE id = ? AND (last_synced_at IS NULL OR last_synced_at < ?)`
      )
      .run(maxCreatedAt, client.id, maxCreatedAt);
  }

  return NextResponse.json({
    client: client.name,
    received: rows.length,
    mappedEvents: events.length,
    written: inserted,
    skipped,
    lastSyncedAt: maxCreatedAt || null,
  });
}
