import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import getDb from "@/lib/db";
import { getJourneyConfig } from "@/lib/journey-config";
import { getActiveClientId } from "@/lib/client-context";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { steps: JOURNEY_STEPS } = await getJourneyConfig();
  const clientId = await getActiveClientId();

  const { searchParams } = new URL(req.url);
  const userId = searchParams.get("userId");
  const journey = searchParams.get("journey");
  const from    = searchParams.get("from") || "";
  const to      = searchParams.get("to")   || "";
  const exportFormat = searchParams.get("export"); // "csv" | "excel"

  const db = await getDb();
  // Client scoping (alias `e` for the joined list query, plain for the rest)
  const cf = clientId ? " AND client_id = ?" : "";
  const cp: string[] = clientId ? [clientId] : [];

  // ── Single session detail ──────────────────────────────────────────
  if (userId && journey) {
    const events = await db
      .prepare(`SELECT step, timestamp, metadata FROM events WHERE userId = ? AND journey = ?${cf} ORDER BY timestamp ASC`)
      .all<{ step: string; timestamp: string; metadata: string | null }>(userId, journey, ...cp);

    const steps = events.map((e) => {
      let meta: Record<string, string> = {};
      try { meta = e.metadata ? JSON.parse(e.metadata) : {}; } catch {}
      return { step: e.step, timestamp: e.timestamp, variables: meta };
    });

    return NextResponse.json({ steps });
  }

  // ── Session list ───────────────────────────────────────────────────
  const dateClause = from && to ? "date(e.timestamp) BETWEEN ? AND ?" : "";
  const parts = [dateClause, clientId ? "e.client_id = ?" : ""].filter(Boolean);
  const listWhere = parts.length ? "WHERE " + parts.join(" AND ") : "";
  const listParams: string[] = [...(from && to ? [from, to] : []), ...cp];

  const rows = await db
    .prepare(`
      SELECT
        userId, journey,
        MIN(timestamp) as startTime,
        COUNT(*) as stepCount,
        MAX(step) as lastStep,
        (SELECT metadata FROM events e2
         WHERE e2.userId = e.userId AND e2.journey = e.journey
         ORDER BY e2.timestamp ASC LIMIT 1) as firstMeta
      FROM events e
      ${listWhere}
      GROUP BY userId, journey
      ORDER BY startTime DESC
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
        SELECT userId, journey, step, timestamp, metadata
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
