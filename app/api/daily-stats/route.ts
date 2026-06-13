import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import getDb from "@/lib/db";
import { getJourneyConfig } from "@/lib/journey-config";
import { getActiveClientId } from "@/lib/client-context";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = await getDb();
  const { steps: JOURNEY_STEPS } = await getJourneyConfig();
  const clientId = await getActiveClientId();
  const journey = new URL(req.url).searchParams.get("journey") || "";

  // Compose WHERE: active client + journey scope. A specific journey filters to
  // it; otherwise restrict to the published tree's journeys (matches the other
  // reports' "All Journeys" behavior) so non-published data never leaks in.
  const parts: string[] = [];
  const params: string[] = [];
  if (clientId) { parts.push("client_id = ?"); params.push(clientId); }
  if (journey) {
    parts.push("journey = ?");
    params.push(journey);
  } else {
    const keys = Object.keys(JOURNEY_STEPS);
    if (keys.length) {
      parts.push(`journey IN (${keys.map(() => "?").join(",")})`);
      params.push(...keys);
    }
  }
  const where = parts.length ? "WHERE " + parts.join(" AND ") : "";

  // Get user-journey sessions grouped by date (scoped to client + journey)
  const rows = await db
    .prepare(`
      SELECT
        DATE(timestamp) as date,
        userId,
        journey,
        MAX(step) as lastStep,
        COUNT(*) as stepCount
      FROM events
      ${where}
      GROUP BY DATE(timestamp), userId, journey
      ORDER BY date DESC
    `)
    .all<{ date: string; userId: string; journey: string; lastStep: string; stepCount: number }>(...params);

  // Aggregate to one row per date (across whatever journeys passed the filter)
  const dailyMap = new Map<string, { reach: Set<string>; completed: number; total: number }>();

  rows.forEach((row) => {
    if (!dailyMap.has(row.date)) {
      dailyMap.set(row.date, { reach: new Set(), completed: 0, total: 0 });
    }
    const day = dailyMap.get(row.date)!;
    day.reach.add(row.userId);
    day.total++;

    const steps = JOURNEY_STEPS[row.journey] || [];
    if (row.lastStep === steps[steps.length - 1]) day.completed++;
  });

  const dailyStats = Array.from(dailyMap.entries())
    .map(([date, data]) => ({
      date,
      reach: data.reach.size,
      completionRate: data.total > 0 ? ((data.completed / data.total) * 100).toFixed(2) : "0.00",
      dropoffRate: data.total > 0 ? (((data.total - data.completed) / data.total) * 100).toFixed(2) : "0.00",
    }))
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  return NextResponse.json({ dailyStats });
}
