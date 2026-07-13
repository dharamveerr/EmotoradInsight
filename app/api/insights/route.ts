import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import getDb from "@/lib/db";
import { getJourneyConfig } from "@/lib/journey-config";
import { getActiveClientId } from "@/lib/client-context";
import { ensureHydrated } from "@/lib/source-fetch";
import { denyIfNoReports } from "@/lib/permissions";

// Helper: returns SQL clause + params for optional date range filtering
function df(from: string, to: string) {
  return from && to
    ? { clause: "AND (timestamp)::date BETWEEN ?::date AND ?::date", p: [from, to] as string[] }
    : { clause: "", p: [] as string[] };
}

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const denied = await denyIfNoReports(req);
  if (denied) return denied;

  const { searchParams } = new URL(req.url);
  const type    = searchParams.get("type")    || "overview";
  const journey = searchParams.get("journey") || "";
  const from    = searchParams.get("from")    || "";
  const to      = searchParams.get("to")      || "";

  // Lazily pull this range from the source (via N8N) before reading local events.
  // Default range = current date. No-op when sync isn't configured.
  await ensureHydrated(from, to);

  const db = await getDb();
  const { clause: dc, p: dp } = df(from, to);
  // Journey labels/steps come from the active client's published tree (static fallback)
  const { steps: JOURNEY_STEPS } = await getJourneyConfig();

  // Every events query is scoped to the active client's data.
  const clientId = await getActiveClientId();
  const cf = clientId ? " AND client_id = ?" : "";
  const cp: string[] = clientId ? [clientId] : [];

  // Aggregate queries that don't target one journey are restricted to the
  // published tree's journeys, so non-published data never appears in reports.
  const journeyKeys = Object.keys(JOURNEY_STEPS);
  const js = journeyKeys.length ? ` AND journey IN (${journeyKeys.map(() => "?").join(",")})` : "";
  const jp: string[] = journeyKeys.length ? journeyKeys : [];

  // ── OVERVIEW ──────────────────────────────────────────────────────────
  if (type === "overview") {
    const today    = new Date().toISOString().slice(0, 10);
    const dateFrom = from || today;
    const dateTo   = to   || today;

    const todaySessions = (await db
      .prepare(`SELECT COUNT(DISTINCT userId) as c FROM events WHERE (timestamp)::date BETWEEN ?::date AND ?::date${cf}${js}`)
      .get<{ c: number }>(dateFrom, dateTo, ...cp, ...jp))!;

    const activeJourneys = (await db
      .prepare(`SELECT COUNT(DISTINCT journey) as c FROM events WHERE (timestamp)::date BETWEEN ?::date AND ?::date${cf}${js}`)
      .get<{ c: number }>(dateFrom, dateTo, ...cp, ...jp))!;

    const journeyCompletions = await Promise.all(
      Object.entries(JOURNEY_STEPS).map(async ([j, steps]) => {
        const lastStep = steps[steps.length - 1];
        const total     = (await db.prepare(`SELECT COUNT(DISTINCT userId) as c FROM events WHERE journey = ? AND (timestamp)::date BETWEEN ?::date AND ?::date${cf}`).get<{ c: number }>(j, dateFrom, dateTo, ...cp))!;
        const completed = (await db.prepare(`SELECT COUNT(DISTINCT userId) as c FROM events WHERE journey = ? AND step = ? AND (timestamp)::date BETWEEN ?::date AND ?::date${cf}`).get<{ c: number }>(j, lastStep, dateFrom, dateTo, ...cp))!;
        return { total: Number(total.c), completed: Number(completed.c) };
      })
    );
    const totalUsers     = journeyCompletions.reduce((s, r) => s + r.total, 0);
    const totalCompleted = journeyCompletions.reduce((s, r) => s + r.completed, 0);
    const completionRate = totalUsers > 0 ? Math.round((totalCompleted / totalUsers) * 100) : 0;

    const last7Days = await db
      .prepare(`SELECT (timestamp)::date as date, COUNT(DISTINCT userId || journey) as count FROM events WHERE (timestamp)::date BETWEEN ?::date AND ?::date${cf}${js} GROUP BY (timestamp)::date ORDER BY date`)
      .all<{ date: string; count: number }>(dateFrom, dateTo, ...cp, ...jp);

    const journeyDist = await db
      .prepare(`SELECT journey, COUNT(DISTINCT userId) as count FROM events WHERE (timestamp)::date BETWEEN ?::date AND ?::date${cf}${js} GROUP BY journey ORDER BY count DESC`)
      .all<{ journey: string; count: number }>(dateFrom, dateTo, ...cp, ...jp);

    const journeyBreakdown = await Promise.all(
      Object.entries(JOURNEY_STEPS).map(async ([j, steps]) => {
        const lastStep  = steps[steps.length - 1];
        const entries   = (await db.prepare(`SELECT COUNT(DISTINCT userId) as c FROM events WHERE journey = ? AND step = ? AND (timestamp)::date BETWEEN ?::date AND ?::date${cf}`).get<{ c: number }>(j, steps[0], dateFrom, dateTo, ...cp))!;
        const completed = (await db.prepare(`SELECT COUNT(DISTINCT userId) as c FROM events WHERE journey = ? AND step = ? AND (timestamp)::date BETWEEN ?::date AND ?::date${cf}`).get<{ c: number }>(j, lastStep, dateFrom, dateTo, ...cp))!;
        const entriesC = Number(entries.c);
        const completedC = Number(completed.c);
        const conversionRate = entriesC > 0 ? Math.round((completedC / entriesC) * 100) : 0;
        return { journey: j, entries: entriesC, completed: completedC, conversionRate };
      })
    );

    return NextResponse.json({ todaySessions: Number(todaySessions.c), activeJourneys: Number(activeJourneys.c), completionRate, dropoffRate: 100 - completionRate, last7Days, journeyDist, journeyBreakdown });
  }

  // ── FUNNEL ────────────────────────────────────────────────────────────
  if (type === "funnel") {
    if (!journey) {
      const rows = await db
        .prepare(`SELECT step, COUNT(DISTINCT userId) as count FROM events WHERE 1=1 ${dc}${cf}${js} GROUP BY step ORDER BY count DESC LIMIT 20`)
        .all<{ step: string; count: number }>(...dp, ...cp, ...jp);
      return NextResponse.json({ funnel: rows });
    }
    const steps = JOURNEY_STEPS[journey] || [];
    const funnel = await Promise.all(
      steps.map(async (step) => {
        const row = (await db
          .prepare(`SELECT COUNT(DISTINCT userId) as count FROM events WHERE journey = ? AND step = ? ${dc}${cf}`)
          .get<{ count: number }>(journey, step, ...dp, ...cp))!;
        return { step, count: Number(row.count) };
      })
    );
    return NextResponse.json({ funnel });
  }

  // ── HEATMAP ───────────────────────────────────────────────────────────
  if (type === "heatmap") {
    const whereParts: string[] = [];
    const params: (string | number)[] = [];
    if (journey) { whereParts.push("journey = ?"); params.push(journey); }
    else if (journeyKeys.length) { whereParts.push(`journey IN (${journeyKeys.map(() => "?").join(",")})`); params.push(...journeyKeys); }
    if (from && to) { whereParts.push("(timestamp)::date BETWEEN ?::date AND ?::date"); params.push(from, to); }
    if (clientId) { whereParts.push("client_id = ?"); params.push(clientId); }
    const where = whereParts.length ? "WHERE " + whereParts.join(" AND ") : "";

    const rows = await db
      .prepare(`SELECT CAST(strftime('%w', timestamp) AS INTEGER) as day, CAST(strftime('%H', timestamp) AS INTEGER) as hour, COUNT(*) as count FROM events ${where} GROUP BY day, hour`)
      .all<{ day: number; hour: number; count: number }>(...params);
    return NextResponse.json({ heatmap: rows });
  }

  // ── DROPOFF ───────────────────────────────────────────────────────────
  if (type === "dropoff") {
    if (!journey) {
      const rows = await db
        .prepare(`SELECT step, COUNT(DISTINCT userId) as entered FROM events WHERE 1=1 ${dc}${cf}${js} GROUP BY step ORDER BY entered DESC LIMIT 20`)
        .all<{ step: string; entered: number }>(...dp, ...cp, ...jp);
      const dropoff = rows.map((row, i) => {
        const nextEntered = rows[i + 1]?.entered ?? 0;
        const exited  = Math.max(0, Number(row.entered) - Number(nextEntered));
        const dropRate = Number(row.entered) > 0 ? Math.round((exited / Number(row.entered)) * 100) : 0;
        return { step: row.step, entered: Number(row.entered), exited, dropRate };
      });
      return NextResponse.json({ dropoff, journey: "all" });
    }

    const steps = JOURNEY_STEPS[journey] || [];
    const dropoff = await Promise.all(
      steps.map(async (step, i) => {
        const entered  = (await db.prepare(`SELECT COUNT(DISTINCT userId) as c FROM events WHERE journey = ? AND step = ? ${dc}${cf}`).get<{ c: number }>(journey, step, ...dp, ...cp))!;
        const nextStep = steps[i + 1];
        const nextCount = nextStep
          ? Number(((await db.prepare(`SELECT COUNT(DISTINCT userId) as c FROM events WHERE journey = ? AND step = ? ${dc}${cf}`).get<{ c: number }>(journey, nextStep, ...dp, ...cp))!).c)
          : 0;
        const enteredC = Number(entered.c);
        const exited   = enteredC - nextCount;
        const dropRate = enteredC > 0 ? Math.round((exited / enteredC) * 100) : 0;
        return { step, entered: enteredC, exited: exited > 0 ? exited : 0, dropRate };
      })
    );
    return NextResponse.json({ dropoff, journey });
  }

  // ── PRODUCT-ANALYTICS ─────────────────────────────────────────────────
  if (type === "product-analytics") {
    const allJourneys   = !journey;
    const targetJourney = journey || "";

    // Funnel
    let funnel: { step: string; count: number }[];
    if (allJourneys) {
      const allKeys = Object.keys(JOURNEY_STEPS);
      const totals: Record<string, number> = {};
      for (const j of allKeys) {
        for (const step of JOURNEY_STEPS[j]) {
          const row = (await db.prepare(`SELECT COUNT(DISTINCT userId) as count FROM events WHERE journey = ? AND step = ? ${dc}${cf}`).get<{ count: number }>(j, step, ...dp, ...cp))!;
          totals[step] = (totals[step] || 0) + Number(row.count);
        }
      }
      const allSteps = [...new Set(Object.keys(JOURNEY_STEPS).flatMap((j) => JOURNEY_STEPS[j]))];
      funnel = allSteps.map((step) => ({ step, count: totals[step] || 0 }));
    } else {
      const steps = JOURNEY_STEPS[targetJourney] || [];
      funnel = await Promise.all(
        steps.map(async (step) => {
          const row = (await db.prepare(`SELECT COUNT(DISTINCT userId) as count FROM events WHERE journey = ? AND step = ? ${dc}${cf}`).get<{ count: number }>(targetJourney, step, ...dp, ...cp))!;
          return { step, count: Number(row.count) };
        })
      );
    }

    // By date
    const byDate = allJourneys
      ? await db.prepare(`SELECT (timestamp)::date as date, COUNT(DISTINCT userId) as count FROM events WHERE 1=1 ${dc}${cf} GROUP BY (timestamp)::date ORDER BY date`).all<{ date: string; count: number }>(...dp, ...cp)
      : await db.prepare(`SELECT (timestamp)::date as date, COUNT(DISTINCT userId) as count FROM events WHERE journey = ? ${dc}${cf} GROUP BY (timestamp)::date ORDER BY date`).all<{ date: string; count: number }>(targetJourney, ...dp, ...cp);

    // By hour
    const byHour = allJourneys
      ? await db.prepare(`SELECT CAST(strftime('%H', timestamp) AS INTEGER) as hour, COUNT(DISTINCT userId) as count FROM events WHERE 1=1 ${dc}${cf} GROUP BY hour ORDER BY hour`).all<{ hour: number; count: number }>(...dp, ...cp)
      : await db.prepare(`SELECT CAST(strftime('%H', timestamp) AS INTEGER) as hour, COUNT(DISTINCT userId) as count FROM events WHERE journey = ? ${dc}${cf} GROUP BY hour ORDER BY hour`).all<{ hour: number; count: number }>(targetJourney, ...dp, ...cp);

    // Product distribution
    const productRows = allJourneys
      ? await db.prepare(`SELECT metadata FROM events WHERE step = 'product_type_selected' ${dc}${cf}`).all<{ metadata: string | null }>(...dp, ...cp)
      : await db.prepare(`SELECT metadata FROM events WHERE journey = ? AND step = 'product_type_selected' ${dc}${cf}`).all<{ metadata: string | null }>(targetJourney, ...dp, ...cp);

    const productCounts: Record<string, number> = {};
    productRows.forEach((row) => {
      if (row.metadata) {
        try { const meta = JSON.parse(row.metadata); const product = meta.product || "Unknown"; productCounts[product] = (productCounts[product] || 0) + 1; } catch { /* skip */ }
      }
    });
    const productDistribution = Object.entries(productCounts).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, 6);

    // Price distribution
    const priceRows = allJourneys
      ? await db.prepare(`SELECT metadata FROM events WHERE step = 'price_filter_set' ${dc}${cf}`).all<{ metadata: string | null }>(...dp, ...cp)
      : await db.prepare(`SELECT metadata FROM events WHERE journey = ? AND step = 'price_filter_set' ${dc}${cf}`).all<{ metadata: string | null }>(targetJourney, ...dp, ...cp);

    const priceCounts: Record<string, number> = {};
    priceRows.forEach((row) => {
      if (row.metadata) {
        try { const meta = JSON.parse(row.metadata); const price = meta.price || "Unknown"; priceCounts[price] = (priceCounts[price] || 0) + 1; } catch { /* skip */ }
      }
    });
    const priceDistribution = Object.entries(priceCounts).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);

    // ── KPI metrics ─────────────────────────────────────────────────────
    // uniqueUsers  = distinct mobile numbers (userId) across the journey(s)
    // totalCount   = total interactions (event rows) — basis for avg/day
    // started      = distinct users who hit each journey's FIRST step
    // completed    = distinct users who hit each journey's LAST step
    // dropped      = started − completed (began but never finished)
    const uniqRow = allJourneys
      ? (await db.prepare(`SELECT COUNT(DISTINCT userId) c FROM events WHERE 1=1 ${dc}${cf}${js}`).get<{ c: number }>(...dp, ...cp, ...jp))!
      : (await db.prepare(`SELECT COUNT(DISTINCT userId) c FROM events WHERE journey = ? ${dc}${cf}`).get<{ c: number }>(targetJourney, ...dp, ...cp))!;
    const uniqueUsers = Number(uniqRow.c);

    const totRow = allJourneys
      ? (await db.prepare(`SELECT COUNT(*) c FROM events WHERE 1=1 ${dc}${cf}${js}`).get<{ c: number }>(...dp, ...cp, ...jp))!
      : (await db.prepare(`SELECT COUNT(*) c FROM events WHERE journey = ? ${dc}${cf}`).get<{ c: number }>(targetJourney, ...dp, ...cp))!;
    const totalCount = Number(totRow.c);

    let started = 0, completed = 0;
    const kpiKeys = allJourneys ? Object.keys(JOURNEY_STEPS) : [targetJourney];
    for (const j of kpiKeys) {
      const steps = JOURNEY_STEPS[j] || [];
      if (steps.length === 0) continue;
      const first = steps[0], last = steps[steps.length - 1];
      const s = (await db.prepare(`SELECT COUNT(DISTINCT userId) c FROM events WHERE journey = ? AND step = ? ${dc}${cf}`).get<{ c: number }>(j, first, ...dp, ...cp))!;
      const c = (await db.prepare(`SELECT COUNT(DISTINCT userId) c FROM events WHERE journey = ? AND step = ? ${dc}${cf}`).get<{ c: number }>(j, last, ...dp, ...cp))!;
      started += Number(s.c);
      completed += Number(c.c);
    }
    const dropped = Math.max(0, started - completed);
    const kpis = { uniqueUsers, totalCount, started, completed, dropped };

    return NextResponse.json({ funnel, byDate, byHour, productDistribution, priceDistribution, kpis });
  }

  return NextResponse.json({ error: "Unknown type" }, { status: 400 });
}
