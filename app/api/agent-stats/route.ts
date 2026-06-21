import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getActiveClientId } from "@/lib/client-context";
import { getAgentStatRows, getAgentSummary } from "@/lib/agent-stats";
import { denyIfNoPermission, PERMISSIONS } from "@/lib/permissions";

// Agent Statistics data for the active client. Gated by the agent_statistics
// permission specifically (super admin bypasses). Returns per-agent aggregate
// counts (cards + charts) plus the raw conversation rows.
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const denied = await denyIfNoPermission(req, PERMISSIONS.AGENT_STATISTICS);
  if (denied) return denied;

  const clientId = await getActiveClientId();
  if (!clientId) {
    return NextResponse.json({ summary: [], rows: [], totals: emptyTotals() });
  }

  const from = req.nextUrl.searchParams.get("from");
  const to = req.nextUrl.searchParams.get("to");
  const range = { from, to };

  const [summary, rows] = await Promise.all([
    getAgentSummary(clientId, range),
    getAgentStatRows(clientId, range),
  ]);

  const totals = summary.reduce(
    (acc, s) => ({
      agents: acc.agents + 1,
      total_assignment: acc.total_assignment + (s.total_assignment || 0),
      open: acc.open + (s.open || 0),
      user_replies: acc.user_replies + (s.user_replies || 0),
      agent_replies: acc.agent_replies + (s.agent_replies || 0),
    }),
    emptyTotals()
  );

  return NextResponse.json({ summary, rows, totals });
}

function emptyTotals() {
  return { agents: 0, total_assignment: 0, open: 0, user_replies: 0, agent_replies: 0 };
}
