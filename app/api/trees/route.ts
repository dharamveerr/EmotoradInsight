import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import getDb from "@/lib/db";
import { v4 as uuidv4 } from "uuid";
import { getActiveClientId } from "@/lib/client-context";

// Trees are containers for journeys, scoped to a client. One tree may be
// published per client — that client's published tree drives its dashboard.

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const clientId = await getActiveClientId();
  if (!clientId) return NextResponse.json({ trees: [] });

  const db = await getDb();
  const trees = await db
    .prepare(
      `SELECT t.id, t.name, t.description, t.status, t.published_at, t.created_at, t.updated_at,
              (SELECT COUNT(*) FROM journeys j WHERE j.tree_id = t.id) AS journey_count
       FROM trees t
       WHERE t.client_id = ?
       ORDER BY t.updated_at DESC`
    )
    .all(clientId);

  return NextResponse.json({ trees });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const clientId = await getActiveClientId();
  if (!clientId) {
    return NextResponse.json({ error: "No client selected. Create or select a client first." }, { status: 400 });
  }

  const { name, description } = await req.json();
  const cleanName = String(name || "").trim();
  if (!cleanName) {
    return NextResponse.json({ error: "Tree name is required" }, { status: 400 });
  }

  const db = await getDb();

  // Name unique within the client
  const clash = await db
    .prepare("SELECT id FROM trees WHERE client_id = ? AND LOWER(name) = LOWER(?)")
    .get<{ id: string }>(clientId, cleanName);
  if (clash) {
    return NextResponse.json({ error: "A tree with this name already exists for this client" }, { status: 409 });
  }

  const id = uuidv4();
  const now = new Date().toISOString();
  await db.prepare(
    `INSERT INTO trees (id, name, description, status, client_id, created_at, updated_at)
     VALUES (?, ?, ?, 'draft', ?, ?, ?)`
  ).run(id, cleanName, description || null, clientId, now, now);

  return NextResponse.json({ id, name: cleanName, status: "draft", created_at: now }, { status: 201 });
}

export async function PUT(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id, name, description } = await req.json();
  const cleanName = String(name || "").trim();
  if (!id || !cleanName) {
    return NextResponse.json({ error: "Missing id or name" }, { status: 400 });
  }

  const db = await getDb();

  const clash = await db
    .prepare("SELECT id FROM trees WHERE LOWER(name) = LOWER(?) AND id != ?")
    .get<{ id: string }>(cleanName, id);
  if (clash) {
    return NextResponse.json({ error: "A tree with this name already exists" }, { status: 409 });
  }

  const now = new Date().toISOString();
  await db.prepare(
    "UPDATE trees SET name = ?, description = ?, updated_at = ? WHERE id = ?"
  ).run(cleanName, description || null, now, id);

  return NextResponse.json({ id, name: cleanName, updated_at: now });
}

export async function DELETE(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const db = await getDb();
  const tree = await db.prepare("SELECT status FROM trees WHERE id = ?").get<{ status: string }>(id);
  if (!tree) return NextResponse.json({ error: "Tree not found" }, { status: 404 });
  if (tree.status === "published") {
    return NextResponse.json(
      { error: "Cannot delete a published tree. Unpublish it first." },
      { status: 400 }
    );
  }

  // Journeys inside the tree are deleted with it
  await db.prepare("DELETE FROM journeys WHERE tree_id = ?").run(id);
  await db.prepare("DELETE FROM trees WHERE id = ?").run(id);

  return NextResponse.json({ success: true });
}
