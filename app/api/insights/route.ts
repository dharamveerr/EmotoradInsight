import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import getDb from "@/lib/db";
import { JOURNEY_STEPS, ChatbotEvent } from "@/lib/types";
import { getPublishedTree, classifyEventsToTreeLeaves, getHeatmapData, getStepDistribution } from "@/lib/tree-reporting";
import { classifyEventToTreeNode, getTreeLeaves, getTreeNodePath } from "@/lib/tree-evaluator";

// Helper: returns SQL clause + params for optional date range filtering
function df(from: string, to: string) {
  return from && to
    ? { clause: "AND date(timestamp) BETWEEN ? AND ?", p: [from, to] as string[] }
    : { clause: "", p: [] as string[] };
}

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const type    = searchParams.get("type")    || "overview";
  const journey = searchParams.get("journey") || "";
  const from    = searchParams.get("from")    || "";
  const to      = searchParams.get("to")      || "";

  const db = getDb();
  const { clause: dc, p: dp } = df(from, to);

  // Check if tree is published - if so, use tree-based reporting
  const publishedTree = getPublishedTree();
  if (publishedTree) {
    return handleTreeBasedReporting(type, journey, from, to, dc, dp, db, publishedTree);
  }

  // Fallback to original hardcoded JOURNEY_STEPS logic if no tree published

  // ── OVERVIEW ──────────────────────────────────────────────────────────
  if (type === "overview") {
    const today    = new Date().toISOString().slice(0, 10);
    const dateFrom = from || today;
    const dateTo   = to   || today;

    const todaySessions = db
      .prepare("SELECT COUNT(DISTINCT userId) as c FROM events WHERE date(timestamp) BETWEEN ? AND ?")
      .get(dateFrom, dateTo) as { c: number };

    const activeJourneys = db
      .prepare("SELECT COUNT(DISTINCT journey) as c FROM events WHERE date(timestamp) BETWEEN ? AND ?")
      .get(dateFrom, dateTo) as { c: number };

    const journeyCompletions = Object.entries(JOURNEY_STEPS).map(([j, steps]) => {
      const lastStep = steps[steps.length - 1];
      const total     = db.prepare("SELECT COUNT(DISTINCT userId) as c FROM events WHERE journey = ? AND date(timestamp) BETWEEN ? AND ?").get(j, dateFrom, dateTo) as { c: number };
      const completed = db.prepare("SELECT COUNT(DISTINCT userId) as c FROM events WHERE journey = ? AND step = ? AND date(timestamp) BETWEEN ? AND ?").get(j, lastStep, dateFrom, dateTo) as { c: number };
      return { total: total.c, completed: completed.c };
    });
    const totalUsers     = journeyCompletions.reduce((s, r) => s + r.total, 0);
    const totalCompleted = journeyCompletions.reduce((s, r) => s + r.completed, 0);
    const completionRate = totalUsers > 0 ? Math.round((totalCompleted / totalUsers) * 100) : 0;

    const last7Days = db
      .prepare("SELECT date(timestamp) as date, COUNT(DISTINCT userId || journey) as count FROM events WHERE date(timestamp) BETWEEN ? AND ? GROUP BY date(timestamp) ORDER BY date")
      .all(dateFrom, dateTo) as { date: string; count: number }[];

    const journeyDist = db
      .prepare("SELECT journey, COUNT(DISTINCT userId) as count FROM events WHERE date(timestamp) BETWEEN ? AND ? GROUP BY journey ORDER BY count DESC")
      .all(dateFrom, dateTo) as { journey: string; count: number }[];

    const journeyBreakdown = Object.entries(JOURNEY_STEPS).map(([j, steps]) => {
      const lastStep  = steps[steps.length - 1];
      const entries   = db.prepare("SELECT COUNT(DISTINCT userId) as c FROM events WHERE journey = ? AND step = ? AND date(timestamp) BETWEEN ? AND ?").get(j, steps[0], dateFrom, dateTo) as { c: number };
      const completed = db.prepare("SELECT COUNT(DISTINCT userId) as c FROM events WHERE journey = ? AND step = ? AND date(timestamp) BETWEEN ? AND ?").get(j, lastStep, dateFrom, dateTo) as { c: number };
      const conversionRate = entries.c > 0 ? Math.round((completed.c / entries.c) * 100) : 0;
      return { journey: j, entries: entries.c, completed: completed.c, conversionRate };
    });

    return NextResponse.json({ todaySessions: todaySessions.c, activeJourneys: activeJourneys.c, completionRate, dropoffRate: 100 - completionRate, last7Days, journeyDist, journeyBreakdown });
  }

  // ── FUNNEL ────────────────────────────────────────────────────────────
  if (type === "funnel") {
    if (!journey) {
      const rows = db
        .prepare(`SELECT step, COUNT(DISTINCT userId) as count FROM events WHERE 1=1 ${dc} GROUP BY step ORDER BY count DESC LIMIT 20`)
        .all(...dp) as { step: string; count: number }[];
      return NextResponse.json({ funnel: rows });
    }
    const steps = JOURNEY_STEPS[journey] || [];
    const funnel = steps.map((step) => {
      const row = db
        .prepare(`SELECT COUNT(DISTINCT userId) as count FROM events WHERE journey = ? AND step = ? ${dc}`)
        .get(journey, step, ...dp) as { count: number };
      return { step, count: row.count };
    });
    return NextResponse.json({ funnel });
  }

  // ── HEATMAP ───────────────────────────────────────────────────────────
  if (type === "heatmap") {
    const whereParts: string[] = [];
    const params: (string | number)[] = [];
    if (journey) { whereParts.push("journey = ?"); params.push(journey); }
    if (from && to) { whereParts.push("date(timestamp) BETWEEN ? AND ?"); params.push(from, to); }
    const where = whereParts.length ? "WHERE " + whereParts.join(" AND ") : "";

    const rows = db
      .prepare(`SELECT CAST(strftime('%w', timestamp) AS INTEGER) as day, CAST(strftime('%H', timestamp) AS INTEGER) as hour, COUNT(*) as count FROM events ${where} GROUP BY day, hour`)
      .all(...params) as { day: number; hour: number; count: number }[];
    return NextResponse.json({ heatmap: rows });
  }

  // ── DROPOFF ───────────────────────────────────────────────────────────
  if (type === "dropoff") {
    if (!journey) {
      const rows = db
        .prepare(`SELECT step, COUNT(DISTINCT userId) as entered FROM events WHERE 1=1 ${dc} GROUP BY step ORDER BY entered DESC LIMIT 20`)
        .all(...dp) as { step: string; entered: number }[];
      const dropoff = rows.map((row, i) => {
        const nextEntered = rows[i + 1]?.entered ?? 0;
        const exited  = Math.max(0, row.entered - nextEntered);
        const dropRate = row.entered > 0 ? Math.round((exited / row.entered) * 100) : 0;
        return { step: row.step, entered: row.entered, exited, dropRate };
      });
      return NextResponse.json({ dropoff, journey: "all" });
    }

    const steps = JOURNEY_STEPS[journey] || [];
    const dropoff = steps.map((step, i) => {
      const entered  = db.prepare(`SELECT COUNT(DISTINCT userId) as c FROM events WHERE journey = ? AND step = ? ${dc}`).get(journey, step, ...dp) as { c: number };
      const nextStep = steps[i + 1];
      const nextCount = nextStep
        ? (db.prepare(`SELECT COUNT(DISTINCT userId) as c FROM events WHERE journey = ? AND step = ? ${dc}`).get(journey, nextStep, ...dp) as { c: number }).c
        : 0;
      const exited   = entered.c - nextCount;
      const dropRate = entered.c > 0 ? Math.round((exited / entered.c) * 100) : 0;
      return { step, entered: entered.c, exited: exited > 0 ? exited : 0, dropRate };
    });
    return NextResponse.json({ dropoff, journey });
  }

  // ── PRODUCT-ANALYTICS ─────────────────────────────────────────────────
  if (type === "product-analytics") {
    const allJourneys   = !journey;
    const targetJourney = journey || "";

    // Funnel
    const funnel = allJourneys
      ? (() => {
          const allKeys = Object.keys(JOURNEY_STEPS);
          const totals: Record<string, number> = {};
          allKeys.forEach((j) => {
            JOURNEY_STEPS[j].forEach((step) => {
              const row = db.prepare(`SELECT COUNT(DISTINCT userId) as count FROM events WHERE journey = ? AND step = ? ${dc}`).get(j, step, ...dp) as { count: number };
              totals[step] = (totals[step] || 0) + row.count;
            });
          });
          const allSteps = [...new Set(Object.keys(JOURNEY_STEPS).flatMap((j) => JOURNEY_STEPS[j]))];
          return allSteps.map((step) => ({ step, count: totals[step] || 0 }));
        })()
      : (() => {
          const steps = JOURNEY_STEPS[targetJourney] || [];
          return steps.map((step) => {
            const row = db.prepare(`SELECT COUNT(DISTINCT userId) as count FROM events WHERE journey = ? AND step = ? ${dc}`).get(targetJourney, step, ...dp) as { count: number };
            return { step, count: row.count };
          });
        })();

    // By date
    const byDate = allJourneys
      ? (db.prepare(`SELECT DATE(timestamp) as date, COUNT(DISTINCT userId) as count FROM events WHERE 1=1 ${dc} GROUP BY DATE(timestamp) ORDER BY date`).all(...dp) as { date: string; count: number }[])
      : (db.prepare(`SELECT DATE(timestamp) as date, COUNT(DISTINCT userId) as count FROM events WHERE journey = ? ${dc} GROUP BY DATE(timestamp) ORDER BY date`).all(targetJourney, ...dp) as { date: string; count: number }[]);

    // By hour
    const byHour = allJourneys
      ? (db.prepare(`SELECT CAST(strftime('%H', timestamp) AS INTEGER) as hour, COUNT(DISTINCT userId) as count FROM events WHERE 1=1 ${dc} GROUP BY hour ORDER BY hour`).all(...dp) as { hour: number; count: number }[])
      : (db.prepare(`SELECT CAST(strftime('%H', timestamp) AS INTEGER) as hour, COUNT(DISTINCT userId) as count FROM events WHERE journey = ? ${dc} GROUP BY hour ORDER BY hour`).all(targetJourney, ...dp) as { hour: number; count: number }[]);

    // Product distribution
    const productRows = allJourneys
      ? (db.prepare(`SELECT metadata FROM events WHERE step = 'product_type_selected' ${dc}`).all(...dp) as { metadata: string | null }[])
      : (db.prepare(`SELECT metadata FROM events WHERE journey = ? AND step = 'product_type_selected' ${dc}`).all(targetJourney, ...dp) as { metadata: string | null }[]);

    const productCounts: Record<string, number> = {};
    productRows.forEach((row) => {
      if (row.metadata) {
        try { const meta = JSON.parse(row.metadata); const product = meta.product || "Unknown"; productCounts[product] = (productCounts[product] || 0) + 1; } catch { /* skip */ }
      }
    });
    const productDistribution = Object.entries(productCounts).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, 6);

    // Price distribution
    const priceRows = allJourneys
      ? (db.prepare(`SELECT metadata FROM events WHERE step = 'price_filter_set' ${dc}`).all(...dp) as { metadata: string | null }[])
      : (db.prepare(`SELECT metadata FROM events WHERE journey = ? AND step = 'price_filter_set' ${dc}`).all(targetJourney, ...dp) as { metadata: string | null }[]);

    const priceCounts: Record<string, number> = {};
    priceRows.forEach((row) => {
      if (row.metadata) {
        try { const meta = JSON.parse(row.metadata); const price = meta.price || "Unknown"; priceCounts[price] = (priceCounts[price] || 0) + 1; } catch { /* skip */ }
      }
    });
    const priceDistribution = Object.entries(priceCounts).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);

    return NextResponse.json({ funnel, byDate, byHour, productDistribution, priceDistribution });
  }

  return NextResponse.json({ error: "Unknown type" }, { status: 400 });
}

/**
 * Handle tree-based reporting
 */
function handleTreeBasedReporting(
  type: string,
  leafParam: string,
  from: string,
  to: string,
  dc: string,
  dp: string[],
  db: any,
  tree: any
) {
  const today = new Date().toISOString().slice(0, 10);
  const dateFrom = from || today;
  const dateTo = to || today;

  // Get all events in date range
  const dateClause = dc ? `WHERE ${dc}` : "";
  const allEvents = db
    .prepare(`SELECT * FROM events ${dateClause} ORDER BY timestamp`)
    .all(...dp) as ChatbotEvent[];

  // Classify events to tree leaves
  const eventsByLeaf = classifyEventsToTreeLeaves(allEvents, tree);

  if (type === "overview") {
    const totalUsers = new Set(allEvents.map((e) => e.userId)).size;
    const leaves = getTreeLeaves(tree);

    const leafBreakdown = leaves.map((leaf) => {
      const path = getTreeNodePath(leaf, tree);
      const events = eventsByLeaf.get(path) || [];
      const leafUsers = new Set(events.map((e) => e.userId)).size;
      return {
        segment: path,
        users: leafUsers,
        events: events.length,
      };
    });

    const todaySessions = new Set(
      allEvents.map((e) => e.userId)
    ).size;

    return NextResponse.json({
      todaySessions,
      activeJourneys: leaves.length,
      completionRate: 0,
      dropoffRate: 0,
      last7Days: [],
      journeyDist: leafBreakdown.map((lb) => ({
        journey: lb.segment,
        count: lb.users,
      })),
      journeyBreakdown: leafBreakdown,
      isTreeBased: true,
    });
  }

  if (type === "funnel") {
    const leaves = getTreeLeaves(tree);
    const selectedLeaf = leafParam
      ? leaves.find((l) => getTreeNodePath(l, tree) === leafParam)
      : leaves[0];

    if (!selectedLeaf) {
      return NextResponse.json({ funnel: [], isTreeBased: true });
    }

    const leafPath = getTreeNodePath(selectedLeaf, tree);
    const leafEvents = eventsByLeaf.get(leafPath) || [];

    const steps = new Map<string, number>();
    for (const event of leafEvents) {
      const count = steps.get(event.step) || 0;
      steps.set(event.step, count + 1);
    }

    const funnel = Array.from(steps.entries()).map(([step, count]) => ({
      step,
      count,
    }));

    return NextResponse.json({
      funnel,
      leaf: leafPath,
      isTreeBased: true,
    });
  }

  if (type === "heatmap") {
    const leaves = getTreeLeaves(tree);
    const selectedLeaf = leafParam
      ? leaves.find((l) => getTreeNodePath(l, tree) === leafParam)
      : null;

    const eventsToAnalyze = selectedLeaf
      ? eventsByLeaf.get(getTreeNodePath(selectedLeaf, tree)) || []
      : allEvents;

    const heatmapData = getHeatmapData(eventsToAnalyze);

    return NextResponse.json({
      heatmap: heatmapData,
      leaf: selectedLeaf ? getTreeNodePath(selectedLeaf, tree) : "all",
      isTreeBased: true,
    });
  }

  if (type === "dropoff") {
    const leaves = getTreeLeaves(tree);
    const selectedLeaf = leafParam
      ? leaves.find((l) => getTreeNodePath(l, tree) === leafParam)
      : leaves[0];

    if (!selectedLeaf) {
      return NextResponse.json({ dropoff: [], isTreeBased: true });
    }

    const leafPath = getTreeNodePath(selectedLeaf, tree);
    const leafEvents = eventsByLeaf.get(leafPath) || [];

    const steps = Array.from(
      new Set(leafEvents.map((e) => e.step))
    );

    const dropoff = steps.map((step, i) => {
      const entered = leafEvents.filter((e) => e.step === step).length;
      const nextStep = steps[i + 1];
      const nextCount = nextStep
        ? leafEvents.filter((e) => e.step === nextStep).length
        : 0;
      const exited = entered - nextCount;
      const dropRate =
        entered > 0 ? Math.round((exited / entered) * 100) : 0;

      return {
        step,
        entered,
        exited: exited > 0 ? exited : 0,
        dropRate,
      };
    });

    return NextResponse.json({
      dropoff,
      leaf: leafPath,
      isTreeBased: true,
    });
  }

  // Default: return tree overview
  return NextResponse.json({
    error: "Unknown type",
    isTreeBased: true,
  });
}
