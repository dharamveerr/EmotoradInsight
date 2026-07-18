import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import getDb from "@/lib/db";
import { getActiveClientId } from "@/lib/client-context";
import { ensureHydrated } from "@/lib/source-fetch";
import { denyIfNoReports } from "@/lib/permissions";
import { loadTreeJourneys, usersAtStep, type ParsedEvent } from "@/lib/journey-funnel";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const denied = await denyIfNoReports(req);
  if (denied) return denied;

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
  // journey is the tree-journey KEY (not the raw events.journey tag), so we
  // fetch the user's whole conversation by userId and show every step they hit.
  if (userId && journey) {
    const events = await db
      .prepare(`SELECT step, timestamp, metadata FROM events WHERE userId = ?${cf} ORDER BY timestamp ASC`)
      .all<{ step: string; timestamp: string; metadata: string | null }>(userId, ...cp);

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
  // Journeys are derived from the PUBLISHED TREE, not the raw events.journey
  // campaign tag — identical attribution to the Funnel / Drop-off pages. A user
  // "enters" a journey when their metadata holds one of step 1's variables, and
  // their progress is the sequential run of steps they satisfied (a step only
  // counts if every prior step also matched). One user can enter more than one
  // journey → one row per (user, journey) they entered.
  const dateClause = from && to ? "(timestamp)::date BETWEEN ?::date AND ?::date" : "";
  const parts = [dateClause, clientId ? "client_id = ?" : ""].filter(Boolean);
  const listWhere = parts.length ? "WHERE " + parts.join(" AND ") : "";
  const listParams: string[] = [...(from && to ? [from, to] : []), ...cp];

  const eventRows = await db
    .prepare(`SELECT userId AS "userId", timestamp, metadata FROM events ${listWhere} ORDER BY timestamp ASC`)
    .all<{ userId: string; timestamp: string; metadata: string | null }>(...listParams);

  // One ParsedEvent per row (so a var captured in ANY of a user's events counts),
  // plus per-user earliest timestamp + display name for the row.
  const parsed: ParsedEvent[] = [];
  const userInfo = new Map<string, { startTime: string; name: string }>();
  for (const r of eventRows) {
    let meta: Record<string, string> = {};
    try { meta = r.metadata ? JSON.parse(r.metadata) : {}; } catch {}
    parsed.push({ userId: r.userId, meta });
    const nm = meta["@customer_name"] || meta["@user_name"] || "";
    const cur = userInfo.get(r.userId);
    if (!cur) userInfo.set(r.userId, { startTime: r.timestamp, name: nm });
    else if (!cur.name && nm) cur.name = nm; // rows are ASC, so first startTime is the min
  }

  const treeJourneys = await loadTreeJourneys(db, clientId);
  const sessions: {
    userId: string; name: string; journey: string; startTime: string;
    stepsCompleted: number; totalSteps: number; outcome: "completed" | "dropped";
  }[] = [];

  for (const tj of treeJourneys) {
    if (tj.steps.length === 0) continue;
    // Sequential rolling intersection; record the furthest step each user reached.
    const reached = new Map<string, number>();
    let rolling: Set<string> = new Set();
    let first = true;
    for (let i = 0; i < tj.steps.length; i++) {
      const stepSet = usersAtStep(parsed, tj.steps[i]);
      rolling = first ? stepSet : new Set([...rolling].filter((u) => stepSet.has(u)));
      first = false;
      for (const u of rolling) reached.set(u, i + 1);
    }
    for (const [userId, stepsCompleted] of reached) {
      const info = userInfo.get(userId);
      sessions.push({
        userId,
        name: info?.name || "",
        journey: tj.key,
        startTime: info?.startTime || "",
        stepsCompleted,
        totalSteps: tj.steps.length,
        outcome: stepsCompleted === tj.steps.length ? "completed" : "dropped",
      });
    }
  }

  sessions.sort((a, b) => (a.startTime < b.startTime ? 1 : a.startTime > b.startTime ? -1 : 0));

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
