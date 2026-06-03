import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import getDb from "@/lib/db";
import { TreeConfig } from "@/lib/types";
import { v4 as uuidv4 } from "uuid";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = getDb();
  const { searchParams } = new URL(req.url);
  const activeOnly = searchParams.get("active") === "true";

  if (activeOnly) {
    // Get active/published tree
    const tree = db
      .prepare("SELECT * FROM tree_configs WHERE status = 'published' LIMIT 1")
      .get() as any;

    if (!tree) return NextResponse.json({ tree: null });

    return NextResponse.json({
      tree: {
        ...tree,
        structure: JSON.parse(tree.structure),
      },
    });
  }

  // List all trees
  const trees = db
    .prepare("SELECT id, name, description, status, published_at, created_at, updated_at FROM tree_configs ORDER BY updated_at DESC")
    .all() as any[];

  return NextResponse.json({ trees });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { name, description, structure } = body;

  if (!name || !structure) {
    return NextResponse.json({ error: "Missing name or structure" }, { status: 400 });
  }

  const db = getDb();
  const id = uuidv4();
  const now = new Date().toISOString();

  db.prepare(
    `INSERT INTO tree_configs (id, name, description, structure, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'draft', ?, ?)`
  ).run(id, name, description || null, JSON.stringify(structure), now, now);

  return NextResponse.json({ id, name, status: "draft", created_at: now });
}

export async function PUT(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { id, name, description, structure } = body;

  if (!id || !name || !structure) {
    return NextResponse.json({ error: "Missing id, name, or structure" }, { status: 400 });
  }

  const db = getDb();
  const now = new Date().toISOString();

  db.prepare(
    `UPDATE tree_configs SET name = ?, description = ?, structure = ?, updated_at = ? WHERE id = ?`
  ).run(name, description || null, JSON.stringify(structure), now, id);

  return NextResponse.json({ id, name, status: "draft", updated_at: now });
}

export async function DELETE(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { id } = body;

  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  const db = getDb();
  const tree = db.prepare("SELECT status FROM tree_configs WHERE id = ?").get(id) as any;

  if (!tree) {
    return NextResponse.json({ error: "Tree not found" }, { status: 404 });
  }

  if (tree.status === "published") {
    return NextResponse.json(
      { error: "Cannot delete published tree. Unpublish first." },
      { status: 400 }
    );
  }

  db.prepare("DELETE FROM tree_configs WHERE id = ?").run(id);

  return NextResponse.json({ success: true });
}
