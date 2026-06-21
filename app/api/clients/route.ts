import { NextRequest, NextResponse } from "next/server";
import getDb from "@/lib/db";
import { v4 as uuidv4 } from "uuid";
import { getSessionUser } from "@/lib/client-context";
import { triggerVariableSync } from "@/lib/n8n";

// Clients = tenants. Super admin manages them; client admins see only their own.
export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = await getDb();
  if (user.role === "super_admin") {
    const clients = await db
      .prepare(
        `SELECT c.id, c.name, c.slug, c.subdomain, c.org_id, c.source_client_id, c.last_synced_at, c.created_at,
                (SELECT COUNT(*) FROM trees t WHERE t.client_id = c.id) AS tree_count,
                (SELECT COUNT(*) FROM app_users u WHERE u.client_id = c.id) AS user_count
         FROM clients c ORDER BY c.created_at ASC`
      )
      .all();
    return NextResponse.json({ clients, isSuperAdmin: true });
  }

  // Client admin: only their own client
  if (!user.client_id) return NextResponse.json({ clients: [], isSuperAdmin: false });
  const own = await db
    .prepare("SELECT id, name, slug, subdomain, org_id, source_client_id, last_synced_at, created_at FROM clients WHERE id = ?")
    .all(user.client_id);
  return NextResponse.json({ clients: own, isSuperAdmin: false });
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "super_admin") {
    return NextResponse.json({ error: "Only super admin can create clients" }, { status: 403 });
  }

  const { name, subdomain, org_id, client_id } = await req.json();
  const cleanName = String(name || "").trim();
  const orgId = String(org_id || "").trim();
  const sourceClientId = String(client_id || "").trim();
  const sub = String(subdomain || "").trim().toLowerCase();
  // All four are required at creation — subdomain/org_id/client_id are immutable
  // afterward (they bind the tenant to its source rows), so they must be set now.
  if (!cleanName || !sub || !orgId || !sourceClientId) {
    return NextResponse.json({ error: "name, subdomain, org_id and client_id are all required" }, { status: 400 });
  }

  const db = await getDb();
  // Display name may repeat across tenants — identity is (org_id, client_id),
  // not the name. Only that pair is enforced unique below.

  // (org_id, client_id) is the key N8N matches on — must be unique
  if (orgId && sourceClientId) {
    const dupSrc = await db
      .prepare("SELECT id FROM clients WHERE org_id = ? AND source_client_id = ?")
      .get<{ id: string }>(orgId, sourceClientId);
    if (dupSrc) return NextResponse.json({ error: "A client with this org_id + client_id already exists" }, { status: 409 });
  }

  const id = uuidv4();
  const now = new Date().toISOString();
  const slug = cleanName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  await db.prepare(
    "INSERT INTO clients (id, name, slug, subdomain, org_id, source_client_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
  ).run(id, cleanName, slug, sub || null, orgId || null, sourceClientId || null, now, now);

  // Kick off variable discovery via N8N (DISTINCT variable_name, last 15 days).
  if (orgId && sourceClientId) triggerVariableSync(orgId, sourceClientId);

  return NextResponse.json({ id, name: cleanName, slug, subdomain: sub, org_id: orgId, source_client_id: sourceClientId, created_at: now }, { status: 201 });
}

export async function PUT(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "super_admin") {
    return NextResponse.json({ error: "Only super admin can edit clients" }, { status: 403 });
  }

  // Only the display name is editable. subdomain/org_id/client_id are immutable
  // after creation — they bind the tenant to its source rows in chat_log_variable.
  const { id, name } = await req.json();
  const cleanName = String(name || "").trim();
  if (!id || !cleanName) return NextResponse.json({ error: "Missing id or name" }, { status: 400 });

  const db = await getDb();
  // Duplicate display names allowed — no name-uniqueness check.

  const now = new Date().toISOString();
  await db.prepare("UPDATE clients SET name = ?, updated_at = ? WHERE id = ?")
    .run(cleanName, now, id);
  return NextResponse.json({ id, name: cleanName });
}

export async function DELETE(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "super_admin") {
    return NextResponse.json({ error: "Only super admin can delete clients" }, { status: 403 });
  }

  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const db = await getDb();
  const treeCount = await db.prepare("SELECT COUNT(*) AS c FROM trees WHERE client_id = ?").get<{ c: number }>(id);
  if (treeCount && Number(treeCount.c) > 0) {
    return NextResponse.json(
      { error: "Cannot delete a client that still has trees. Delete its trees first." },
      { status: 400 }
    );
  }
  // Unassign any users tied to this client
  await db.prepare("UPDATE app_users SET client_id = NULL WHERE client_id = ?").run(id);
  await db.prepare("DELETE FROM clients WHERE id = ?").run(id);
  return NextResponse.json({ success: true });
}
