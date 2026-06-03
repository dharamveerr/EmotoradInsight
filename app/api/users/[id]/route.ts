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
  const db = getDb();

  const user = db.prepare("SELECT * FROM app_users WHERE id = ?").get(id) as
    | { id: string }
    | undefined;
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const allowed = ["role", "is_active", "name"] as const;
  const updates: string[] = [];
  const values: unknown[] = [];

  for (const key of allowed) {
    if (key in body) {
      if (key === "role" && !["admin", "super_admin"].includes(body.role)) {
        return NextResponse.json({ error: "Invalid role" }, { status: 400 });
      }
      updates.push(`${key} = ?`);
      values.push(body[key]);
    }
  }

  if (updates.length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  updates.push("updated_at = ?");
  values.push(new Date().toISOString());
  values.push(id);

  db.prepare(`UPDATE app_users SET ${updates.join(", ")} WHERE id = ?`).run(
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
  const db = getDb();

  const user = db.prepare("SELECT * FROM app_users WHERE id = ?").get(id) as
    | { id: string; username: string | null; email: string | null }
    | undefined;
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  // Prevent self-deletion
  if (user.username === currentUser || user.email === currentUser) {
    return NextResponse.json(
      { error: "Cannot delete your own account" },
      { status: 400 }
    );
  }

  db.prepare("DELETE FROM app_users WHERE id = ?").run(id);
  return NextResponse.json({ ok: true });
}
