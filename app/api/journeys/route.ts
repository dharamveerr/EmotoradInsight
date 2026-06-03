import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import getDb from "@/lib/db";
import { Journey } from "@/lib/types";
import { v4 as uuidv4 } from "uuid";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const activeOnly = searchParams.get("active") === "true";

  const db = getDb();

  // Auto-delete draft journeys older than 24 hours
  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  db.prepare(
    "DELETE FROM journeys WHERE status = 'draft' AND created_at < ?"
  ).run(twentyFourHoursAgo);

  if (activeOnly) {
    const journey = db
      .prepare("SELECT * FROM journeys WHERE status = 'published' LIMIT 1")
      .get() as any;

    if (!journey) return NextResponse.json({ journey: null });

    return NextResponse.json({
      journey: {
        ...journey,
        structure: JSON.parse(journey.structure),
      },
    });
  }

  const journeys = db
    .prepare(
      "SELECT id, name, description, status, published_at, created_at, updated_at FROM journeys ORDER BY updated_at DESC"
    )
    .all() as any[];

  return NextResponse.json({ journeys });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { name, description, steps } = body;

  if (!name) {
    return NextResponse.json({ error: "Missing name" }, { status: 400 });
  }

  if (!steps) {
    return NextResponse.json({ error: "Missing steps" }, { status: 400 });
  }

  const db = getDb();
  const id = uuidv4();
  const now = new Date().toISOString();

  const structure = { steps };

  db.prepare(
    `INSERT INTO journeys (id, name, description, structure, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'draft', ?, ?)`
  ).run(id, name, description || null, JSON.stringify(structure), now, now);

  return NextResponse.json(
    { id, name, status: "draft", created_at: now },
    { status: 201 }
  );
}

export async function PUT(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { id, name, description, steps } = body;

  if (!id || !name || !steps) {
    return NextResponse.json(
      { error: "Missing id, name, or steps" },
      { status: 400 }
    );
  }

  const db = getDb();
  const now = new Date().toISOString();

  const structure = { steps };

  db.prepare(
    `UPDATE journeys SET name = ?, description = ?, structure = ?, updated_at = ? WHERE id = ?`
  ).run(name, description || null, JSON.stringify(structure), now, id);

  return NextResponse.json({ id, name, updated_at: now });
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
  const journey = db
    .prepare("SELECT status FROM journeys WHERE id = ?")
    .get(id) as any;

  if (!journey) {
    return NextResponse.json({ error: "Journey not found" }, { status: 404 });
  }

  if (journey.status === "published") {
    return NextResponse.json(
      { error: "Cannot delete published journey. Unpublish first." },
      { status: 400 }
    );
  }

  db.prepare("DELETE FROM journeys WHERE id = ?").run(id);

  return NextResponse.json({ success: true });
}
