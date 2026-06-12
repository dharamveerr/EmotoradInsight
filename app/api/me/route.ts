import { NextRequest, NextResponse } from "next/server";
import getDb from "@/lib/db";
import { createSession, COOKIE } from "@/lib/auth";

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
    username: user?.username || username,
    role,
    name: user?.name || username,
    email: user?.email || null,
    picture: user?.picture || null,
    phone_number: user?.phone_number || null,
    is_active: user?.is_active ?? 1,
  });
}

export async function PATCH(req: NextRequest) {
  const identifier = req.headers.get("x-user-name") || "";
  const role = req.headers.get("x-user-role") || "admin";
  const db = await getDb();

  const user = await db
    .prepare("SELECT id, username, email FROM app_users WHERE username = ? OR email = ?")
    .get<{ id: string; username: string | null; email: string | null }>(identifier, identifier);

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const body = await req.json();
  // Email is intentionally NOT editable — it is the login identity for Google sign-in
  const allowed = ["name", "picture", "phone_number", "username"] as const;
  const updates: string[] = [];
  const values: unknown[] = [];

  for (const key of allowed) {
    if (key in body) {
      // Username is login identity — reject blanking it out
      if (key === "username" && !String(body[key] || "").trim()) continue;
      updates.push(`${key} = ?`);
      values.push(key === "username" ? String(body[key]).trim() : body[key]);
    }
  }

  if (updates.length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  // Username must be unique
  if (body.username?.trim()) {
    const clash = await db
      .prepare("SELECT id FROM app_users WHERE (username = ? OR email = ?) AND id != ?")
      .get<{ id: string }>(body.username.trim(), body.username.trim(), user.id);
    if (clash) return NextResponse.json({ error: "This username already exists" }, { status: 409 });
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

  const res = NextResponse.json({
    id: updated.id,
    username: updated.username,
    role: updated.role,
    name: updated.name,
    email: updated.email,
    picture: updated.picture,
    phone_number: updated.phone_number,
    is_active: updated.is_active,
  });

  // If the login identity (username/email) changed, re-issue the session
  // cookie with the new identifier so the user stays logged in.
  let newIdentifier = identifier;
  if (identifier === user.username && updated.username) newIdentifier = updated.username;
  else if (identifier === user.email && updated.email) newIdentifier = updated.email;
  if (newIdentifier !== identifier) {
    const token = await createSession(newIdentifier, role);
    res.cookies.set(COOKIE, token, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 8,
    });
  }

  return res;
}
