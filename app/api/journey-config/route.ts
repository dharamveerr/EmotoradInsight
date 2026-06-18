import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getJourneyConfig } from "@/lib/journey-config";
import { denyIfNoReports } from "@/lib/permissions";

// Frontend pages use this to render journey dropdowns and funnels from the
// published tree (falls back to the static Emotorad config).
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const denied = await denyIfNoReports(req);
  if (denied) return denied;

  const config = await getJourneyConfig();
  return NextResponse.json(config);
}
