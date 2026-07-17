import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getActiveClientId } from "@/lib/client-context";
import { relabelEventsForClient, reconcileEventSteps } from "@/lib/relabel-events";

// Manually trigger event relabeling for the active client.
// Converts events stored with raw bot_template_id UUIDs to the published
// tree's friendly journey key / step name, then reconciles every journey's
// step labels against what each event's metadata actually contains — so all
// reports show correct data across every journey, not just newly-ingested rows.
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "super_admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const clientId = await getActiveClientId();
  if (!clientId) {
    return NextResponse.json({ error: "No active client" }, { status: 400 });
  }

  const relabelResult = await relabelEventsForClient(clientId);
  const reconcileResult = await reconcileEventSteps(clientId);
  return NextResponse.json({ clientId, ...relabelResult, ...reconcileResult });
}
