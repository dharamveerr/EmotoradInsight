import { NextRequest, NextResponse } from "next/server";
import getDb from "@/lib/db";

function requireSuperAdmin(req: NextRequest) {
  const role = req.headers.get("x-user-role");
  if (role !== "super_admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return null;
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = requireSuperAdmin(req);
  if (denied) return denied;

  const { id } = await params;
  const body = await req.json();
  const db = await getDb();

  const user = await db.prepare("SELECT * FROM app_users WHERE id = ?").get<{ id: string; role: string; is_active: number }>(id);
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  // Guard: never allow the last active super_admin to be demoted or deactivated
  const demoting = "role" in body && body.role !== "super_admin";
  const deactivating = "is_active" in body && !body.is_active;
  if (user.role === "super_admin" && user.is_active && (demoting || deactivating)) {
    const { c } = (await db
      .prepare("SELECT COUNT(*) as c FROM app_users WHERE role = 'super_admin' AND is_active = 1")
      .get<{ c: number }>())!;
    if (Number(c) <= 1) {
      return NextResponse.json(
        { error: "Cannot change role: at least one active Super Admin is required" },
        { status: 400 }
      );
    }
  }

  const allowed = ["role", "is_active", "name", "client_id"] as const;
  const updates: string[] = [];
  const values: unknown[] = [];

  for (const key of allowed) {
    if (key in body) {
      if (key === "role" && !["admin", "super_admin"].includes(body.role)) {
        return NextResponse.json({ error: "Invalid role" }, { status: 400 });
      }
      updates.push(`${key} = ?`);
      values.push(key === "client_id" ? (body[key] || null) : body[key]);
    }
  }

  if (updates.length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  updates.push("updated_at = ?");
  values.push(new Date().toISOString());
  values.push(id);

  await db.prepare(`UPDATE app_users SET ${updates.join(", ")} WHERE id = ?`).run(
    ...values
  );

  return NextResponse.json({ ok: true });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = requireSuperAdmin(req);
  if (denied) return denied;

  const { id } = await params;
  const currentUser = req.headers.get("x-user-name") || "";
  const db = await getDb();

  const user = await db.prepare("SELECT * FROM app_users WHERE id = ?").get<{ id: string; username: string | null; email: string | null; role: string; is_active: number }>(id);
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  // Guard: never allow the last active super_admin to be deleted
  if (user.role === "super_admin" && user.is_active) {
    const { c } = (await db
      .prepare("SELECT COUNT(*) as c FROM app_users WHERE role = 'super_admin' AND is_active = 1")
      .get<{ c: number }>())!;
    if (Number(c) <= 1) {
      return NextResponse.json(
        { error: "Cannot delete: at least one active Super Admin is required" },
        { status: 400 }
      );
    }
  }

  // Prevent self-deletion
  if (user.username === currentUser || user.email === currentUser) {
    return NextResponse.json(
      { error: "Cannot delete your own account" },
      { status: 400 }
    );
  }

  await db.prepare("DELETE FROM app_users WHERE id = ?").run(id);
  return NextResponse.json({ ok: true });
}
