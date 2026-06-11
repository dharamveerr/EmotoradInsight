import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import getDb from "@/lib/db";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const db = await getDb();
  const journey = await db
    .prepare("SELECT * FROM journeys WHERE id = ?")
    .get<{ status: string }>(id);

  if (!journey) {
    return NextResponse.json({ error: "Journey not found" }, { status: 404 });
  }

  const now = new Date().toISOString();

  // If journey is already published, unpublish it (toggle to saved)
  if (journey.status === "published") {
    await db.prepare("UPDATE journeys SET status = 'saved', published_at = NULL WHERE id = ?").run(id);
    return NextResponse.json({
      id,
      status: "saved",
      published_at: null,
    });
  }

  // Otherwise, publish it
  // Change any other published journey to saved
  await db.prepare("UPDATE journeys SET status = 'saved', published_at = NULL WHERE status = 'published'").run();

  await db.prepare(
    "UPDATE journeys SET status = 'published', published_at = ? WHERE id = ?"
  ).run(now, id);

  return NextResponse.json({
    id,
    status: "published",
    published_at: now,
  });
}
