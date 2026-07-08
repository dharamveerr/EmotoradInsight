import getDb from "@/lib/db";

export type JobStatus = "pending" | "done" | "error";
export type VariableSyncJob = {
  from: string;
  to: string;
  status: JobStatus;
  count: number;
  error: string | null;
  startedAt: string | null;
  finishedAt: string | null;
};

// One latest fetch job per client. Upsert on start, update on finish.
export async function startJob(clientId: string, from: string, to: string): Promise<void> {
  const db = await getDb();
  await db
    .prepare(
      `INSERT INTO variable_sync_jobs (client_id, from_date, to_date, status, count, error, started_at, finished_at)
       VALUES (?, ?, ?, 'pending', 0, NULL, ?, NULL)
       ON CONFLICT(client_id) DO UPDATE SET
         from_date = excluded.from_date, to_date = excluded.to_date,
         status = 'pending', count = 0, error = NULL,
         started_at = excluded.started_at, finished_at = NULL`
    )
    .run(clientId, from, to, new Date().toISOString());
}

export async function finishJob(clientId: string, count: number): Promise<void> {
  const db = await getDb();
  await db
    .prepare(`UPDATE variable_sync_jobs SET status = 'done', count = ?, finished_at = ? WHERE client_id = ?`)
    .run(count, new Date().toISOString(), clientId);
}

export async function failJob(clientId: string, error: string): Promise<void> {
  const db = await getDb();
  await db
    .prepare(`UPDATE variable_sync_jobs SET status = 'error', error = ?, finished_at = ? WHERE client_id = ?`)
    .run(error.slice(0, 500), new Date().toISOString(), clientId);
}

export async function getJob(clientId: string): Promise<VariableSyncJob | null> {
  const db = await getDb();
  const row = await db
    .prepare(`SELECT from_date, to_date, status, count, error, started_at, finished_at FROM variable_sync_jobs WHERE client_id = ?`)
    .get<{ from_date: string; to_date: string; status: JobStatus; count: number; error: string | null; started_at: string | null; finished_at: string | null }>(clientId);
  if (!row) return null;
  return {
    from: row.from_date,
    to: row.to_date,
    status: row.status,
    count: Number(row.count) || 0,
    error: row.error,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
  };
}
