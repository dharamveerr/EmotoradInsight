import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import getDb from "@/lib/db";
import { JOURNEY_STEPS } from "@/lib/types";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = await getDb();

  // Get all user-journey sessions grouped by date
  const rows = await db
    .prepare(`
      SELECT
        DATE(timestamp) as date,
        userId,
        journey,
        MAX(step) as lastStep,
        COUNT(*) as stepCount
      FROM events
      GROUP BY DATE(timestamp), userId, journey
      ORDER BY date DESC
    `)
    .all<{ date: string; userId: string; journey: string; lastStep: string; stepCount: number }>();

  // Calculate daily stats grouped by date and journey
  const dailyMap = new Map<string, Map<string, { reach: Set<string>; completed: number; total: number }>>();

  rows.forEach((row) => {
    const key = row.date;
    if (!dailyMap.has(key)) {
      dailyMap.set(key, new Map());
    }

    const journeyMap = dailyMap.get(key)!;
    if (!journeyMap.has(row.journey)) {
      journeyMap.set(row.journey, { reach: new Set(), completed: 0, total: 0 });
    }

    const day = journeyMap.get(row.journey)!;
    day.reach.add(row.userId);
    day.total++;

    // Check if completed
    const steps = JOURNEY_STEPS[row.journey] || [];
    const lastExpectedStep = steps[steps.length - 1];
    if (row.lastStep === lastExpectedStep) {
      day.completed++;
    }
  });

  // Convert to array with journey info
  const dailyStats = Array.from(dailyMap.entries())
    .flatMap(([date, journeyMap]) =>
      Array.from(journeyMap.entries()).map(([journey, data]) => ({
        date,
        journey,
        reach: data.reach.size,
        completionRate: data.total > 0 ? ((data.completed / data.total) * 100).toFixed(2) : "0.00",
        dropoffRate: data.total > 0 ? (((data.total - data.completed) / data.total) * 100).toFixed(2) : "0.00",
      }))
    )
    .sort((a, b) => {
      const dateCompare = new Date(b.date).getTime() - new Date(a.date).getTime();
      return dateCompare !== 0 ? dateCompare : a.journey.localeCompare(b.journey);
    });

  return NextResponse.json({ dailyStats });
}
