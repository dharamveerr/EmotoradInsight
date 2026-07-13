import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import getDb from "@/lib/db";
import { getJourneyConfig } from "@/lib/journey-config";
import { getActiveClientId } from "@/lib/client-context";
import { ensureHydrated } from "@/lib/source-fetch";
import { denyIfNoReports } from "@/lib/permissions";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const denied = await denyIfNoReports(req);
  if (denied) return denied;

  const { steps: JOURNEY_STEPS } = await getJourneyConfig();
  const clientId = await getActiveClientId();

  const { searchParams } = new URL(req.url);
  const userId = searchParams.get("userId");
  const journey = searchParams.get("journey");
  const from    = searchParams.get("from") || "";
  const to      = searchParams.get("to")   || "";
  const exportFormat = searchParams.get("export"); // "csv" | "excel"

  // Hydrate the list range from source (via N8N) before reading local events.
  // Detail view (userId+journey) reads already-present events — no fetch needed.
  if (!(userId && journey)) await ensureHydrated(from, to);

  const db = await getDb();
  // Client scoping (alias `e` for the joined list query, plain for the rest)
  const cf = clientId ? " AND client_id = ?" : "";
  const cp: string[] = clientId ? [clientId] : [];

  // ── Single session detail ──────────────────────────────────────────
  if (userId && journey) {
    const events = await db
      .prepare(`SELECT step, timestamp, metadata FROM events WHERE userId = ? AND journey = ?${cf} ORDER BY timestamp ASC`)
      .all<{ step: string; timestamp: string; metadata: string | null }>(userId, journey, ...cp);

    // Collapse repeated events for the same step into a single step, merging all
    // their variables. Keeps first-seen order and the earliest timestamp so the
    // detail shows each step once with every variable captured in it.
    const byStep = new Map<string, { step: string; timestamp: string; variables: Record<string, string> }>();
    for (const e of events) {
      let meta: Record<string, string> = {};
      try { meta = e.metadata ? JSON.parse(e.metadata) : {}; } catch {}
      const existing = byStep.get(e.step);
      if (existing) {
        Object.assign(existing.variables, meta);
        if (e.timestamp < existing.timestamp) existing.timestamp = e.timestamp;
      } else {
        byStep.set(e.step, { step: e.step, timestamp: e.timestamp, variables: { ...meta } });
      }
    }
    const steps = [...byStep.values()];

    return NextResponse.json({ steps });
  }

  // ── Session list ───────────────────────────────────────────────────
  const dateClause = from && to ? "(e.timestamp)::date BETWEEN ?::date AND ?::date" : "";
  const parts = [dateClause, clientId ? "e.client_id = ?" : ""].filter(Boolean);
  const listWhere = parts.length ? "WHERE " + parts.join(" AND ") : "";
  const listParams: string[] = [...(from && to ? [from, to] : []), ...cp];

  const rows = await db
    .prepare(`
      SELECT
        userId AS "userId", journey,
        MIN(timestamp) AS "startTime",
        COUNT(*) AS "stepCount",
        MAX(step) AS "lastStep",
        (SELECT metadata FROM events e2
         WHERE e2.userId = e.userId AND e2.journey = e.journey
         ORDER BY e2.timestamp ASC LIMIT 1) AS "firstMeta"
      FROM events e
      ${listWhere}
      GROUP BY userId, journey
      ORDER BY MIN(timestamp) DESC
      LIMIT 2000
    `)
    .all<{
      userId: string; journey: string; startTime: string;
      stepCount: number; lastStep: string; firstMeta: string | null;
    }>(...listParams);

  const sessions = rows.map((r) => {
    const steps = JOURNEY_STEPS[r.journey] || [];
    const lastExpected = steps[steps.length - 1];
    let name = "";
    try {
      const m = r.firstMeta ? JSON.parse(r.firstMeta) : {};
      name = m["@customer_name"] || m["@user_name"] || "";
    } catch {}
    return {
      userId: r.userId,
      name,
      journey: r.journey,
      startTime: r.startTime,
      stepsCompleted: r.stepCount,
      totalSteps: steps.length,
      outcome: r.lastStep === lastExpected ? "completed" : "dropped",
    };
  });

  // ── Export ─────────────────────────────────────────────────────────
  if (exportFormat === "csv" || exportFormat === "excel") {
    // Flatten: one row per event with all metadata keys
    const allEvents = await db
      .prepare(`
        SELECT userId AS "userId", journey, step, timestamp, metadata
        FROM events
        ${clientId ? "WHERE client_id = ?" : ""}
        ORDER BY userId, journey, timestamp ASC
      `)
      .all<{ userId: string; journey: string; step: string; timestamp: string; metadata: string | null }>(...cp);

    // Collect all unique metadata keys
    const allKeys = new Set<string>();
    allEvents.forEach((e) => {
      try {
        if (e.metadata) Object.keys(JSON.parse(e.metadata)).forEach((k) => allKeys.add(k));
      } catch {}
    });
    const metaKeys = Array.from(allKeys).sort();

    // Build CSV rows
    const headers = ["Phone Number", "Journey", "Step", "Timestamp", ...metaKeys];
    const csvRows = [headers.join(",")];

    allEvents.forEach((e) => {
      let meta: Record<string, string> = {};
      try { meta = e.metadata ? JSON.parse(e.metadata) : {}; } catch {}
      const row = [
        `"${e.userId}"`,
        `"${e.journey}"`,
        `"${e.step}"`,
        `"${e.timestamp}"`,
        ...metaKeys.map((k) => `"${(meta[k] || "").replace(/"/g, '""')}"`)
      ];
      csvRows.push(row.join(","));
    });

    const csv = csvRows.join("\n");

    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="emotorad-sessions-${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    });
  }

  return NextResponse.json({ sessions });
}
