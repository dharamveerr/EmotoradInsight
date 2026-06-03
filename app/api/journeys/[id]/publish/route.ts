import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import getDb from "@/lib/db";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = params;

  const db = getDb();
  const journey = db
    .prepare("SELECT * FROM journeys WHERE id = ?")
    .get(id) as any;

  if (!journey) {
    return NextResponse.json({ error: "Journey not found" }, { status: 404 });
  }

  const now = new Date().toISOString();

  // If journey is already published, unpublish it (toggle)
  if (journey.status === "published") {
    db.prepare("UPDATE journeys SET status = 'draft', published_at = NULL WHERE id = ?").run(id);
    return NextResponse.json({
      id,
      status: "draft",
      published_at: null,
    });
  }

  // Otherwise, publish it
  // Unpublish any other published journey
  db.prepare("UPDATE journeys SET status = 'draft', published_at = NULL WHERE status = 'published'").run();

  db.prepare(
    "UPDATE journeys SET status = 'published', published_at = ? WHERE id = ?"
  ).run(now, id);

  return NextResponse.json({
    id,
    status: "published",
    published_at: now,
  });
}
