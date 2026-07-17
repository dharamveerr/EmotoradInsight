import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import getDb from "@/lib/db";
import { v4 as uuidv4 } from "uuid";
import { getActiveClientId } from "@/lib/client-context";

// Duplicate a tree (and all its journeys) within the same client/subdomain.
// Lands as a new draft tree with fresh ids — the original is untouched.
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const clientId = await getActiveClientId();
  if (!clientId) {
    return NextResponse.json({ error: "No client selected" }, { status: 400 });
  }

  const { treeId, name: requestedName } = await req.json();
  if (!treeId) {
    return NextResponse.json({ error: "treeId is required" }, { status: 400 });
  }

  const db = await getDb();

  const tree = await db
    .prepare("SELECT id, name, description, client_id FROM trees WHERE id = ?")
    .get<{ id: string; name: string; description: string | null; client_id: string | null }>(treeId);
  if (!tree) return NextResponse.json({ error: "Tree not found" }, { status: 404 });
  if (tree.client_id !== clientId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Use the caller's chosen name if given, otherwise append "(Copy)".
  // Either way, keep it unique within the client by appending numbers.
  const baseName = String(requestedName || `${tree.name} (Copy)`).trim() || `${tree.name} (Copy)`;
  let candidate = baseName;
  let n = 2;
  while (
    await db
      .prepare("SELECT id FROM trees WHERE client_id = ? AND LOWER(name) = LOWER(?)")
      .get<{ id: string }>(clientId, candidate)
  ) {
    candidate = `${baseName} (${n})`;
    n++;
  }

  const now = new Date().toISOString();
  const newTreeId = uuidv4();
  await db
    .prepare(
      `INSERT INTO trees (id, name, description, status, client_id, created_at, updated_at)
       VALUES (?, ?, ?, 'draft', ?, ?, ?)`
    )
    .run(newTreeId, candidate, tree.description || null, clientId, now, now);

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
    journeysCopied: journeys.length,
  }, { status: 201 });
}
