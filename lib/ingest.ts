import { v4 as uuidv4 } from "uuid";
import getDb from "@/lib/db";
import { mapRows, SourceRow } from "@/lib/n8n-mapping";
import { relabelEventsForClient, reconcileEventSteps } from "@/lib/relabel-events";

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

  const SQL =
    `INSERT INTO events (id, userId, journey, step, timestamp, metadata, client_id, source_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(source_id) WHERE source_id IS NOT NULL DO UPDATE SET
       metadata = excluded.metadata,
       timestamp = excluded.timestamp`;

  // Bulk upsert in batches — one round trip per chunk instead of per row.
  let maxCreatedAt = "";
  const CHUNK = 500;
  for (let i = 0; i < events.length; i += CHUNK) {
    const slice = events.slice(i, i + CHUNK);
    await db.batch(
      slice.map((e) => ({
        sql: SQL,
        args: [uuidv4(), e.userId, e.journey, e.step, e.timestamp, JSON.stringify(e.metadata), clientId, e.sourceId],
      }))
    );
    for (const e of slice) if (e.timestamp > maxCreatedAt) maxCreatedAt = e.timestamp;
  }
  const written = events.length;

  if (maxCreatedAt) {
    await db
      .prepare(
        `UPDATE clients SET last_synced_at = ?
         WHERE id = ? AND (last_synced_at IS NULL OR last_synced_at < ?)`
      )
      .run(maxCreatedAt, clientId, maxCreatedAt);
  }

  // Relabel any events stored with raw bot_template_id UUIDs to the
  // published tree's friendly journey/step names (non-fatal if no tree yet).
  try {
    await relabelEventsForClient(clientId);
    // Then reconcile every journey's step labels against what each event's
    // metadata actually contains — catches variables that were ambiguously
    // shared across steps at the time of the first relabel (e.g. two steps
    // both configured with the same variable), which otherwise stay stuck
    // under the wrong step forever once relabelEventsForClient has run once.
    await reconcileEventSteps(clientId);
  } catch {
    // No published tree yet — events stay as-is until a tree is published.
  }

  return {
    received: rows.length,
    mappedEvents: events.length,
    written,
    skipped,
    maxCreatedAt: maxCreatedAt || null,
  };
}
