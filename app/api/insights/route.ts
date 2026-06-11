import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import getDb from "@/lib/db";
import { JOURNEY_STEPS } from "@/lib/types";

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

  const db = await getDb();
  const { clause: dc, p: dp } = df(from, to);

  // ── OVERVIEW ──────────────────────────────────────────────────────────
  if (type === "overview") {
    const today    = new Date().toISOString().slice(0, 10);
    const dateFrom = from || today;
    const dateTo   = to   || today;

    const todaySessions = (await db
      .prepare("SELECT COUNT(DISTINCT userId) as c FROM events WHERE date(timestamp) BETWEEN ? AND ?")
      .get<{ c: number }>(dateFrom, dateTo))!;

    const activeJourneys = (await db
      .prepare("SELECT COUNT(DISTINCT journey) as c FROM events WHERE date(timestamp) BETWEEN ? AND ?")
      .get<{ c: number }>(dateFrom, dateTo))!;

    const journeyCompletions = await Promise.all(
      Object.entries(JOURNEY_STEPS).map(async ([j, steps]) => {
        const lastStep = steps[steps.length - 1];
        const total     = (await db.prepare("SELECT COUNT(DISTINCT userId) as c FROM events WHERE journey = ? AND date(timestamp) BETWEEN ? AND ?").get<{ c: number }>(j, dateFrom, dateTo))!;
        const completed = (await db.prepare("SELECT COUNT(DISTINCT userId) as c FROM events WHERE journey = ? AND step = ? AND date(timestamp) BETWEEN ? AND ?").get<{ c: number }>(j, lastStep, dateFrom, dateTo))!;
        return { total: Number(total.c), completed: Number(completed.c) };
      })
    );
    const totalUsers     = journeyCompletions.reduce((s, r) => s + r.total, 0);
    const totalCompleted = journeyCompletions.reduce((s, r) => s + r.completed, 0);
    const completionRate = totalUsers > 0 ? Math.round((totalCompleted / totalUsers) * 100) : 0;

    const last7Days = await db
      .prepare("SELECT date(timestamp) as date, COUNT(DISTINCT userId || journey) as count FROM events WHERE date(timestamp) BETWEEN ? AND ? GROUP BY date(timestamp) ORDER BY date")
      .all<{ date: string; count: number }>(dateFrom, dateTo);

    const journeyDist = await db
      .prepare("SELECT journey, COUNT(DISTINCT userId) as count FROM events WHERE date(timestamp) BETWEEN ? AND ? GROUP BY journey ORDER BY count DESC")
      .all<{ journey: string; count: number }>(dateFrom, dateTo);

    const journeyBreakdown = await Promise.all(
      Object.entries(JOURNEY_STEPS).map(async ([j, steps]) => {
        const lastStep  = steps[steps.length - 1];
        const entries   = (await db.prepare("SELECT COUNT(DISTINCT userId) as c FROM events WHERE journey = ? AND step = ? AND date(timestamp) BETWEEN ? AND ?").get<{ c: number }>(j, steps[0], dateFrom, dateTo))!;
        const completed = (await db.prepare("SELECT COUNT(DISTINCT userId) as c FROM events WHERE journey = ? AND step = ? AND date(timestamp) BETWEEN ? AND ?").get<{ c: number }>(j, lastStep, dateFrom, dateTo))!;
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
        .prepare(`SELECT step, COUNT(DISTINCT userId) as count FROM events WHERE 1=1 ${dc} GROUP BY step ORDER BY count DESC LIMIT 20`)
        .all<{ step: string; count: number }>(...dp);
      return NextResponse.json({ funnel: rows });
    }
    const steps = JOURNEY_STEPS[journey] || [];
    const funnel = await Promise.all(
      steps.map(async (step) => {
        const row = (await db
          .prepare(`SELECT COUNT(DISTINCT userId) as count FROM events WHERE journey = ? AND step = ? ${dc}`)
          .get<{ count: number }>(journey, step, ...dp))!;
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
    if (from && to) { whereParts.push("date(timestamp) BETWEEN ? AND ?"); params.push(from, to); }
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
        .prepare(`SELECT step, COUNT(DISTINCT userId) as entered FROM events WHERE 1=1 ${dc} GROUP BY step ORDER BY entered DESC LIMIT 20`)
        .all<{ step: string; entered: number }>(...dp);
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
        const entered  = (await db.prepare(`SELECT COUNT(DISTINCT userId) as c FROM events WHERE journey = ? AND step = ? ${dc}`).get<{ c: number }>(journey, step, ...dp))!;
        const nextStep = steps[i + 1];
        const nextCount = nextStep
          ? Number(((await db.prepare(`SELECT COUNT(DISTINCT userId) as c FROM events WHERE journey = ? AND step = ? ${dc}`).get<{ c: number }>(journey, nextStep, ...dp))!).c)
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
          const row = (await db.prepare(`SELECT COUNT(DISTINCT userId) as count FROM events WHERE journey = ? AND step = ? ${dc}`).get<{ count: number }>(j, step, ...dp))!;
          totals[step] = (totals[step] || 0) + Number(row.count);
        }
      }
      const allSteps = [...new Set(Object.keys(JOURNEY_STEPS).flatMap((j) => JOURNEY_STEPS[j]))];
      funnel = allSteps.map((step) => ({ step, count: totals[step] || 0 }));
    } else {
      const steps = JOURNEY_STEPS[targetJourney] || [];
      funnel = await Promise.all(
        steps.map(async (step) => {
          const row = (await db.prepare(`SELECT COUNT(DISTINCT userId) as count FROM events WHERE journey = ? AND step = ? ${dc}`).get<{ count: number }>(targetJourney, step, ...dp))!;
          return { step, count: Number(row.count) };
        })
      );
    }

    // By date
    const byDate = allJourneys
      ? await db.prepare(`SELECT DATE(timestamp) as date, COUNT(DISTINCT userId) as count FROM events WHERE 1=1 ${dc} GROUP BY DATE(timestamp) ORDER BY date`).all<{ date: string; count: number }>(...dp)
      : await db.prepare(`SELECT DATE(timestamp) as date, COUNT(DISTINCT userId) as count FROM events WHERE journey = ? ${dc} GROUP BY DATE(timestamp) ORDER BY date`).all<{ date: string; count: number }>(targetJourney, ...dp);

    // By hour
    const byHour = allJourneys
      ? await db.prepare(`SELECT CAST(strftime('%H', timestamp) AS INTEGER) as hour, COUNT(DISTINCT userId) as count FROM events WHERE 1=1 ${dc} GROUP BY hour ORDER BY hour`).all<{ hour: number; count: number }>(...dp)
      : await db.prepare(`SELECT CAST(strftime('%H', timestamp) AS INTEGER) as hour, COUNT(DISTINCT userId) as count FROM events WHERE journey = ? ${dc} GROUP BY hour ORDER BY hour`).all<{ hour: number; count: number }>(targetJourney, ...dp);

    // Product distribution
    const productRows = allJourneys
      ? await db.prepare(`SELECT metadata FROM events WHERE step = 'product_type_selected' ${dc}`).all<{ metadata: string | null }>(...dp)
      : await db.prepare(`SELECT metadata FROM events WHERE journey = ? AND step = 'product_type_selected' ${dc}`).all<{ metadata: string | null }>(targetJourney, ...dp);

    const productCounts: Record<string, number> = {};
    productRows.forEach((row) => {
      if (row.metadata) {
        try { const meta = JSON.parse(row.metadata); const product = meta.product || "Unknown"; productCounts[product] = (productCounts[product] || 0) + 1; } catch { /* skip */ }
      }
    });
    const productDistribution = Object.entries(productCounts).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, 6);

    // Price distribution
    const priceRows = allJourneys
      ? await db.prepare(`SELECT metadata FROM events WHERE step = 'price_filter_set' ${dc}`).all<{ metadata: string | null }>(...dp)
      : await db.prepare(`SELECT metadata FROM events WHERE journey = ? AND step = 'price_filter_set' ${dc}`).all<{ metadata: string | null }>(targetJourney, ...dp);

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
