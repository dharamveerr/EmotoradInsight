import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import getDb from "@/lib/db";

// Publish a tree: it becomes the single active tree driving all dashboard
// analytics. Any previously published tree reverts to draft. POST with
// {"action":"unpublish"} reverts this tree to draft instead.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const action = body?.action === "unpublish" ? "unpublish" : "publish";

  const db = await getDb();
  const tree = await db.prepare("SELECT id, status, client_id FROM trees WHERE id = ?").get<{ id: string; status: string; client_id: string | null }>(id);
  if (!tree) return NextResponse.json({ error: "Tree not found" }, { status: 404 });

  const now = new Date().toISOString();

  if (action === "unpublish") {
    await db.prepare(
      "UPDATE trees SET status = 'draft', published_at = NULL, updated_at = ? WHERE id = ?"
    ).run(now, id);
    return NextResponse.json({ id, status: "draft" });
  }

  const journeyCount = await db
    .prepare("SELECT COUNT(*) AS c FROM journeys WHERE tree_id = ?")
    .get<{ c: number }>(id);
  if (!journeyCount || Number(journeyCount.c) === 0) {
    return NextResponse.json(
      { error: "Cannot publish an empty tree. Add at least one journey first." },
      { status: 400 }
    );
  }

  // One published tree per client: draft any other live tree of this client
  await db.prepare("UPDATE trees SET status = 'draft', published_at = NULL WHERE status = 'published' AND client_id IS ?").run(tree.client_id);
  await db.prepare(
    "UPDATE trees SET status = 'published', published_at = ?, updated_at = ? WHERE id = ?"
  ).run(now, now, id);
  // Journeys inside the published tree are considered live
  await db.prepare(
    "UPDATE journeys SET status = 'published', published_at = ?, updated_at = ? WHERE tree_id = ?"
  ).run(now, now, id);

  return NextResponse.json({ id, status: "published", published_at: now });
}
