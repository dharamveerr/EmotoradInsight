import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import getDb from "@/lib/db";
import { v4 as uuidv4 } from "uuid";
import { getSessionUser } from "@/lib/client-context";

// Copy a tree (and all its journeys) from one client to another.
// Super admin only. The copy lands as a draft in the target client — the
// target picks its own published tree separately. Journey structures are
// copied verbatim (variable references are by name/@-key, which resolve per
// client), with fresh ids and draft status.
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await getSessionUser();
  if (user?.role !== "super_admin") {
    return NextResponse.json({ error: "Only super admin can copy trees" }, { status: 403 });
  }

  const { treeId, targetClientId } = await req.json();
  if (!treeId || !targetClientId) {
    return NextResponse.json({ error: "treeId and targetClientId are required" }, { status: 400 });
  }

  const db = await getDb();

  const tree = await db
    .prepare("SELECT id, name, description, client_id FROM trees WHERE id = ?")
    .get<{ id: string; name: string; description: string | null; client_id: string | null }>(treeId);
  if (!tree) return NextResponse.json({ error: "Source tree not found" }, { status: 404 });

  if (tree.client_id === targetClientId) {
    return NextResponse.json({ error: "Source and target client are the same" }, { status: 400 });
  }

  const target = await db
    .prepare("SELECT id, name FROM clients WHERE id = ?")
    .get<{ id: string; name: string }>(targetClientId);
  if (!target) return NextResponse.json({ error: "Target client not found" }, { status: 404 });

  // Unique name within the target client — append "(copy)", then numbers.
  let baseName = tree.name;
  let candidate = baseName;
  let n = 1;
  while (
    await db
      .prepare("SELECT id FROM trees WHERE client_id = ? AND LOWER(name) = LOWER(?)")
      .get<{ id: string }>(targetClientId, candidate)
  ) {
    candidate = `${baseName} (copy${n > 1 ? " " + n : ""})`;
    n++;
  }

  const now = new Date().toISOString();
  const newTreeId = uuidv4();
  await db
    .prepare(
      `INSERT INTO trees (id, name, description, status, client_id, created_at, updated_at)
       VALUES (?, ?, ?, 'draft', ?, ?, ?)`
    )
    .run(newTreeId, candidate, tree.description || null, targetClientId, now, now);

  // Copy every journey under the source tree as a fresh draft.
  const journeys = await db
    .prepare("SELECT name, description, structure FROM journeys WHERE tree_id = ?")
    .all<{ name: string; description: string | null; structure: string }>(treeId);

  for (const j of journeys) {
    await db
      .prepare(
        `INSERT INTO journeys (id, name, description, structure, status, tree_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'draft', ?, ?, ?)`
      )
      .run(uuidv4(), j.name, j.description || null, j.structure, newTreeId, now, now);
  }

  return NextResponse.json({
    id: newTreeId,
    name: candidate,
    targetClient: target.name,
    journeysCopied: journeys.length,
  }, { status: 201 });
}
