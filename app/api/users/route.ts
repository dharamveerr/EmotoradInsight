import { NextRequest, NextResponse } from "next/server";
import getDb, { hashPassword } from "@/lib/db";
import { v4 as uuidv4 } from "uuid";

function requireSuperAdmin(req: NextRequest) {
  const role = req.headers.get("x-user-role");
  if (role !== "super_admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return null;
}

export async function GET(req: NextRequest) {
  const denied = requireSuperAdmin(req);
  if (denied) return denied;

  const db = await getDb();

  const users = await db
    .prepare(
      `SELECT u.id, u.username, u.email, u.name, u.picture, u.role, u.is_active, u.created_at,
       (SELECT timestamp FROM login_sessions WHERE identifier = COALESCE(u.username, u.email) AND action = 'login' ORDER BY timestamp DESC LIMIT 1) AS last_login
       FROM app_users u ORDER BY u.created_at ASC`
    )
    .all();

  return NextResponse.json({ users });
}

export async function POST(req: NextRequest) {
  const denied = requireSuperAdmin(req);
  if (denied) return denied;

  const body = await req.json();
  const { username, email, name, password, role } = body;

  if (!password) {
    return NextResponse.json({ error: "Password required" }, { status: 400 });
  }
  if (!username && !email) {
    return NextResponse.json({ error: "Username or email required" }, { status: 400 });
  }
  if (!["admin", "super_admin"].includes(role)) {
    return NextResponse.json({ error: "Invalid role" }, { status: 400 });
  }

  const db = await getDb();
  const now = new Date().toISOString();

  try {
    await db.prepare(
      `INSERT INTO app_users (id, username, email, name, role, is_active, password_hash, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?)`
    ).run(uuidv4(), username || null, email || null, name || username || email, role, hashPassword(password), now, now);

    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("UNIQUE")) {
      return NextResponse.json({ error: "User already exists" }, { status: 409 });
    }
    return NextResponse.json({ error: "Failed to create user" }, { status: 500 });
  }
}
