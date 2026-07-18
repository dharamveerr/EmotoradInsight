import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import getDb from "@/lib/db";
import { Journey } from "@/lib/types";
import { v4 as uuidv4 } from "uuid";
import { denyIfNoReports } from "@/lib/permissions";
import { journeyKeyFromName } from "@/lib/journey-config";

// Every report query pivots on journeyKeyFromName(name), not the raw name —
// so two journeys whose names normalize to the same key are indistinguishable
// in every funnel/breakdown, even if their display names differ cosmetically
// (e.g. "Remarketing by Shivam sir" vs "remarketing by shivam sir!"). Checked
// on every create/rename so a tree can never end up in that state.
async function findJourneyKeyClash(
  db: Awaited<ReturnType<typeof getDb>>,
  treeId: string,
  candidateName: string,
  excludeJourneyId?: string
): Promise<string | null> {
  const candidateKey = journeyKeyFromName(candidateName);
  const rows = await db
    .prepare("SELECT id, name FROM journeys WHERE tree_id = ?")
    .all<{ id: string; name: string }>(treeId);
  for (const row of rows) {
    if (row.id === excludeJourneyId) continue;
    if (journeyKeyFromName(row.name) === candidateKey) return row.name;
  }
  return null;
}

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const denied = await denyIfNoReports(req);
  if (denied) return denied;

  const { searchParams } = new URL(req.url);
  const activeOnly = searchParams.get("active") === "true";

  const db = await getDb();

  if (activeOnly) {
    const journey = await db
      .prepare("SELECT * FROM journeys WHERE status = 'published' LIMIT 1")
      .get<{ structure: string; [k: string]: unknown }>();

    if (!journey) return NextResponse.json({ journey: null });

    return NextResponse.json({
      journey: {
        ...journey,
        structure: JSON.parse(journey.structure),
      },
    });
  }

  const treeId = searchParams.get("tree_id");
  if (treeId) {
    const journeys = await db
      .prepare(
        "SELECT id, name, description, status, published_at, tree_id, created_at, updated_at FROM journeys WHERE tree_id = ? ORDER BY created_at ASC"
      )
      .all(treeId);
    return NextResponse.json({ journeys });
  }

  const journeys = await db
    .prepare(
      "SELECT id, name, description, status, published_at, tree_id, created_at, updated_at FROM journeys ORDER BY updated_at DESC"
    )
    .all();

  return NextResponse.json({ journeys });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { name, description, steps, tree_id } = body;

  if (!name) {
    return NextResponse.json({ error: "Missing name" }, { status: 400 });
  }

  if (!steps) {
    return NextResponse.json({ error: "Missing steps" }, { status: 400 });
  }

  const db = await getDb();

  if (tree_id) {
    const tree = await db.prepare("SELECT id FROM trees WHERE id = ?").get<{ id: string }>(tree_id);
    if (!tree) return NextResponse.json({ error: "Tree not found" }, { status: 404 });

    const clash = await findJourneyKeyClash(db, tree_id, name);
    if (clash) {
      return NextResponse.json(
        { error: `A journey with an equivalent name already exists in this tree: "${clash}". Reports key events by journey name, so two journeys that resolve to the same key can't be told apart.` },
        { status: 409 }
      );
    }
  }

  const id = uuidv4();
  const now = new Date().toISOString();

  const structure = { steps };

  await db.prepare(
    `INSERT INTO journeys (id, name, description, structure, status, tree_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'draft', ?, ?, ?)`
  ).run(id, name, description || null, JSON.stringify(structure), tree_id || null, now, now);

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

  const db = await getDb();
  const now = new Date().toISOString();

  // Renaming a journey changes the key every report query filters events by
  // (journeyKeyFromName derives it from the name). Without backfilling, all
  // historical events stay tagged under the old key and silently vanish from
  // every funnel/breakdown — capture the old name before it's overwritten.
  const existing = await db
    .prepare("SELECT name, tree_id FROM journeys WHERE id = ?")
    .get<{ name: string; tree_id: string | null }>(id);

  if (existing?.tree_id && existing.name !== name) {
    const clash = await findJourneyKeyClash(db, existing.tree_id, name, id);
    if (clash) {
      return NextResponse.json(
        { error: `A journey with an equivalent name already exists in this tree: "${clash}". Reports key events by journey name, so two journeys that resolve to the same key can't be told apart.` },
        { status: 409 }
      );
    }
  }

  const structure = { steps };

  await db.prepare(
    `UPDATE journeys SET name = ?, description = ?, structure = ?, updated_at = ? WHERE id = ?`
  ).run(name, description || null, JSON.stringify(structure), now, id);

  if (existing && existing.name !== name) {
    const oldKey = journeyKeyFromName(existing.name);
    const newKey = journeyKeyFromName(name);
    if (oldKey !== newKey && existing.tree_id) {
      const tree = await db
        .prepare("SELECT client_id FROM trees WHERE id = ?")
        .get<{ client_id: string | null }>(existing.tree_id);
      if (tree?.client_id) {
        await db
          .prepare("UPDATE events SET journey = ? WHERE client_id = ? AND journey = ?")
          .run(newKey, tree.client_id, oldKey);
      }
    }
  }

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

  const db = await getDb();
  const journey = await db
    .prepare("SELECT status FROM journeys WHERE id = ?")
    .get<{ status: string }>(id);

  if (!journey) {
    return NextResponse.json({ error: "Journey not found" }, { status: 404 });
  }

  if (journey.status === "published") {
    return NextResponse.json(
      { error: "Cannot delete published journey. Unpublish first." },
      { status: 400 }
    );
  }

  await db.prepare("DELETE FROM journeys WHERE id = ?").run(id);

  return NextResponse.json({ success: true });
}
