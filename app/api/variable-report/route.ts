import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import getDb from "@/lib/db";
import { getActiveClientId } from "@/lib/client-context";
import { fetchVariableReport } from "@/lib/n8n";
import { ingestRows } from "@/lib/ingest";
import { SourceRow } from "@/lib/n8n-mapping";
import { denyIfNoReports } from "@/lib/permissions";

type ReportRow = { mobile: string; variable: string; value: string; timestamp: string; journey: string };

// Variable Report: per-user variable values over time for a date range.
// Source: a dedicated N8N flow that queries the source chat_log_variable table
// directly (N8N_VARIABLE_REPORT_URL), sent the active client's org_id +
// client_id + date range. N8N-only — no local fallback, so any failure surfaces.
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const denied = await denyIfNoReports(req);
  if (denied) return denied;

  const today = new Date().toISOString().slice(0, 10);
  const from = req.nextUrl.searchParams.get("from") || today;
  const to = req.nextUrl.searchParams.get("to") || from;

  if (!process.env.N8N_VARIABLE_REPORT_URL) {
    return NextResponse.json({ error: "Variable report sync is not configured (N8N_VARIABLE_REPORT_URL)." }, { status: 503 });
  }

  const clientId = await getActiveClientId();
  if (!clientId) {
    return NextResponse.json({ error: "No active client selected." }, { status: 400 });
  }

  const db = await getDb();
  const client = await db
    .prepare("SELECT org_id, source_client_id FROM clients WHERE id = ?")
    .get<{ org_id: string | null; source_client_id: string | null }>(clientId);
  if (!client?.org_id || !client?.source_client_id) {
    return NextResponse.json({ error: "Active client has no org_id / client_id. Add them to enable the report." }, { status: 400 });
  }

  const raw = await fetchVariableReport(client.org_id, client.source_client_id, from, to);
  if (raw === null) {
    // N8N unreachable / inactive / errored — surface it instead of hiding behind
    // stale local data. Most common cause: the workflow isn't activated.
    return NextResponse.json(
      { error: "Could not reach the N8N variable-report flow. Make sure the workflow is imported and Active." },
      { status: 502 }
    );
  }

  // Feed the same rows into the events table so the live (published) tree's
  // reports — Overview, Funnels, Heatmap, Drop-off, MIS — populate from the
  // variable-report data. Idempotent upsert, so refetching the same range is safe.
  let ingested = 0;
  try {
    const res = await ingestRows(clientId, raw as unknown as SourceRow[]);
    ingested = res.written;
  } catch (e) {
    console.error("variable-report ingest failed:", e);
  }

  const rows: ReportRow[] = raw
    .filter((r) => r.variable_name)
    .map((r) => ({
      mobile: String(r.chat_user_mobile ?? ""),
      variable: String(r.variable_name ?? ""),
      value: r.variable_string_value == null ? "" : String(r.variable_string_value),
      timestamp: r.created_at ? new Date(r.created_at).toISOString() : "",
      journey: String(r.bot_template_id ?? ""),
    }));

  return NextResponse.json({ rows, count: rows.length, from, to, source: "n8n", ingested });
}
