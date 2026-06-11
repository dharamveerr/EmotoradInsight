import { NextRequest, NextResponse } from "next/server";
import getDb from "@/lib/db";

export async function GET(req: NextRequest) {
  const username = req.headers.get("x-user-name") || "";
  const role = req.headers.get("x-user-role") || "admin";

  const db = await getDb();
  const user = await db
    .prepare("SELECT id, username, email, name, picture, phone_number, role, is_active FROM app_users WHERE username = ? OR email = ?")
    .get<{
      id: string;
      username: string | null;
      email: string | null;
      name: string | null;
      picture: string | null;
      phone_number: string | null;
      role: string;
      is_active: number;
    }>(username, username);

  return NextResponse.json({
    id: user?.id || "",
    username,
    role,
    name: user?.name || username,
    email: user?.email || null,
    picture: user?.picture || null,
    phone_number: user?.phone_number || null,
    is_active: user?.is_active ?? 1,
  });
}

export async function PATCH(req: NextRequest) {
  const username = req.headers.get("x-user-name") || "";
  const db = await getDb();

  const user = await db
    .prepare("SELECT id FROM app_users WHERE username = ? OR email = ?")
    .get<{ id: string }>(username, username);

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const body = await req.json();
  const allowed = ["name", "email", "picture", "phone_number"] as const;
  const updates: string[] = [];
  const values: unknown[] = [];

  for (const key of allowed) {
    if (key in body) {
      updates.push(`${key} = ?`);
      values.push(body[key]);
    }
  }

  if (updates.length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  updates.push("updated_at = ?");
  values.push(new Date().toISOString());
  values.push(user.id);

  await db.prepare(`UPDATE app_users SET ${updates.join(", ")} WHERE id = ?`).run(...values);

  const updated = await db
    .prepare("SELECT id, username, email, name, picture, phone_number, role, is_active FROM app_users WHERE id = ?")
    .get<{
      id: string;
      username: string | null;
      email: string | null;
      name: string | null;
      picture: string | null;
      phone_number: string | null;
      role: string;
      is_active: number;
    }>(user.id);

  if (!updated) {
    return NextResponse.json({ error: "User not found after update" }, { status: 404 });
  }

  return NextResponse.json({
    id: updated.id,
    username: updated.username,
    role: updated.role,
    name: updated.name,
    email: updated.email,
    picture: updated.picture,
    phone_number: updated.phone_number,
    is_active: updated.is_active,
  });
}
