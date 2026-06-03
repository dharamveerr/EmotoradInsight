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
  const db = getDb();
  const now = new Date().toISOString();

  // Unpublish all other trees
  db.prepare("UPDATE tree_configs SET status = 'draft', published_at = NULL WHERE status = 'published'").run();

  // Publish the selected tree
  db.prepare("UPDATE tree_configs SET status = 'published', published_at = ? WHERE id = ?").run(
    now,
    id
  );

  return NextResponse.json({ id, status: "published", published_at: now });
}
