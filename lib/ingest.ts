import { v4 as uuidv4 } from "uuid";
import getDb from "@/lib/db";
import { mapRows, SourceRow } from "@/lib/n8n-mapping";

export type IngestResult = {
  received: number;
  mappedEvents: number;
  written: number;
  skipped: number;
  maxCreatedAt: string | null;
};

/**
 * Map raw chat_log_variable rows into events and upsert them for a client.
 * Idempotent via events.source_id, so re-ingesting the same rows is safe.
 * Shared by the N8N push webhook and the on-demand report hydrator.
 */
export async function ingestRows(clientId: string, rows: SourceRow[]): Promise<IngestResult> {
  const db = await getDb();
  const { events, skipped } = mapRows(rows);

  let written = 0;
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
        JSON.stringify(e.metadata), clientId, e.sourceId
      );
    written += res.changes;
    if (e.timestamp > maxCreatedAt) maxCreatedAt = e.timestamp;
  }

  if (maxCreatedAt) {
    await db
      .prepare(
        `UPDATE clients SET last_synced_at = ?
         WHERE id = ? AND (last_synced_at IS NULL OR last_synced_at < ?)`
      )
      .run(maxCreatedAt, clientId, maxCreatedAt);
  }

  return {
    received: rows.length,
    mappedEvents: events.length,
    written,
    skipped,
    maxCreatedAt: maxCreatedAt || null,
  };
}
