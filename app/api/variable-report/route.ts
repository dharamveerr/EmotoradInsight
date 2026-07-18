import { NextRequest, NextResponse, after } from "next/server";
import { getSession } from "@/lib/auth";
import getDb from "@/lib/db";
import { getActiveClientId } from "@/lib/client-context";
import { getVariableStepMap } from "@/lib/journey-config";
import { fetchVariableReport } from "@/lib/n8n";
import { ingestRows } from "@/lib/ingest";
import { SourceRow } from "@/lib/n8n-mapping";
import { denyIfNoReports } from "@/lib/permissions";
import { startJob, finishJob, failJob, getJob } from "@/lib/variable-jobs";
import { computeVariableAllowedUsers, type ParsedEvent } from "@/lib/journey-funnel";

type ReportRow = { mobile: string; variable: string; value: string; timestamp: string; journey: string };

// Reads the Variable Report rows for a range straight from the local `events`
// table (fast). Events are populated by the background fetch job (POST), which
// pulls chat_log_variable via N8N and ingests it. So the display never waits on
// the slow N8N query — it reflects whatever has been ingested so far.
//
// Each variable is masked to the users who sequentially completed every step
// before the one that owns it (same rolling-intersection logic as the Funnel
// chart) — so a step's variable can never report more users than a prior
// step's, and Budget/etc. can never show a user who skipped MBBS Country.
async function readRowsFromEvents(clientId: string, from: string, to: string): Promise<ReportRow[]> {
  const db = await getDb();
  const events = await db
    .prepare(
      `SELECT userId AS "userId", journey, timestamp, metadata
       FROM events
       WHERE (timestamp)::date BETWEEN ?::date AND ?::date AND client_id = ?
       ORDER BY timestamp DESC`
    )
    .all<{ userId: string; journey: string; timestamp: string; metadata: string | null }>(from, to, clientId);

  const parsedEvents: ParsedEvent[] = [];
  const metaByEvent: { userId: string; journey: string; timestamp: string; meta: Record<string, unknown> }[] = [];
  for (const e of events) {
    let meta: Record<string, unknown> = {};
    try { meta = e.metadata ? JSON.parse(e.metadata) : {}; } catch { meta = {}; }
    metaByEvent.push({ userId: e.userId, journey: e.journey, timestamp: e.timestamp, meta });
    parsedEvents.push({ userId: e.userId, meta: meta as Record<string, string> });
  }

  const allowedByVariable = await computeVariableAllowedUsers(db, clientId, parsedEvents);

  const rows: ReportRow[] = [];
  for (const e of metaByEvent) {
    for (const [k, v] of Object.entries(e.meta)) {
      const allowed = allowedByVariable.get(k);
      if (allowed && !allowed.has(e.userId)) continue; // dropped a prior step — not a real completion
      rows.push({ mobile: e.userId, variable: k, value: v == null ? "" : String(v), timestamp: e.timestamp, journey: e.journey });
    }
  }
  return rows;
}

// ── GET: display rows (from events) + current fetch-job status ──────────────
// Never calls N8N. Cheap enough to run on every page load / Sync click.
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const denied = await denyIfNoReports(req);
  if (denied) return denied;

  const today = new Date().toISOString().slice(0, 10);
  const from = req.nextUrl.searchParams.get("from") || today;
  const to = req.nextUrl.searchParams.get("to") || from;

  const clientId = await getActiveClientId();
  if (!clientId) return NextResponse.json({ error: "No active client selected." }, { status: 400 });

  const rows = await readRowsFromEvents(clientId, from, to);
  const job = await getJob(clientId);
  return NextResponse.json({ rows, count: rows.length, from, to, job });
}

// ── POST: start a background fetch job (N8N → remap → ingest) ───────────────
// Returns immediately with { status: "pending" }. The heavy query + ingest run
// after the response via Next `after`, and the job row records progress so the
// client can poll it (GET). Idempotent: re-posting the same range is safe.
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const denied = await denyIfNoReports(req);
  if (denied) return denied;

  const body = (await req.json().catch(() => ({}))) as { from?: string; to?: string };
  const today = new Date().toISOString().slice(0, 10);
  const from = body.from || today;
  const to = body.to || from;

  if (!process.env.N8N_VARIABLE_REPORT_URL) {
    return NextResponse.json({ error: "Variable report sync is not configured (N8N_VARIABLE_REPORT_URL)." }, { status: 503 });
  }

  const clientId = await getActiveClientId();
  if (!clientId) return NextResponse.json({ error: "No active client selected." }, { status: 400 });

  const db = await getDb();
  const client = await db
    .prepare("SELECT org_id, source_client_id FROM clients WHERE id = ?")
    .get<{ org_id: string | null; source_client_id: string | null }>(clientId);
  if (!client?.org_id || !client?.source_client_id) {
    return NextResponse.json({ error: "Active client has no org_id / client_id. Add them to enable the report." }, { status: 400 });
  }

  await startJob(clientId, from, to);
  const orgId = client.org_id, srcClientId = client.source_client_id;

  after(async () => {
    try {
      const raw = await fetchVariableReport(orgId, srcClientId, from, to);
      if (raw === null) {
        await failJob(clientId, "Could not reach the N8N variable-report flow. Make sure the workflow is Active.");
        return;
      }
      // Relabel journey/step from source UUIDs to the tree's journey/step names
      // (matched by the variable each row carries) so reports line up.
      const varMap = await getVariableStepMap(clientId);
      const remapped: SourceRow[] = (raw as unknown as SourceRow[]).map((r) => {
        const m = varMap[String((r as Record<string, unknown>).variable_name ?? "")];
        if (!m) return r;
        return { ...r, bot_template_id: m.journey, chat_flow_node_id: m.step };
      });
      await ingestRows(clientId, remapped);
      await finishJob(clientId, raw.length);
    } catch (e) {
      await failJob(clientId, e instanceof Error ? e.message : String(e));
    }
  });

  return NextResponse.json({ status: "pending", from, to });
}
