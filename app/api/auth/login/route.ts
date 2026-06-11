import { NextRequest, NextResponse } from "next/server";
import { createSession, COOKIE } from "@/lib/auth";
import getDb, { verifyPassword } from "@/lib/db";
import { v4 as uuidv4 } from "uuid";

export async function POST(req: NextRequest) {
  const { username, password, publicIp } = await req.json();

  if (!username || !password) {
    return NextResponse.json({ error: "Missing credentials" }, { status: 400 });
  }

  const db = await getDb();
  const ip =
    publicIp ||
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
    req.headers.get("x-real-ip") ||
    "unknown";

  // Look up user in app_users table
  const user = await db
    .prepare("SELECT * FROM app_users WHERE username = ?")
    .get<{
      id: string;
      username: string;
      role: string;
      is_active: number;
      password_hash: string | null;
    }>(username);

  if (user) {
    // Verify password and active status
    if (!user.password_hash || !verifyPassword(password, user.password_hash)) {
      return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
    }
    if (!user.is_active) {
      return NextResponse.json({ error: "Account access denied" }, { status: 403 });
    }

    // Log login session
    await db.prepare(
      `INSERT INTO login_sessions (id, user_id, identifier, role, action, timestamp, ip_address)
       VALUES (?, ?, ?, ?, 'login', ?, ?)`
    ).run(uuidv4(), user.id, username, user.role, new Date().toISOString(), ip);

    const token = await createSession(username, user.role);
    const res = NextResponse.json({ ok: true });
    res.cookies.set(COOKIE, token, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 8,
    });
    return res;
  }

  // Fallback: env vars bootstrap (only if no users exist — should not happen after first boot)
  if (
    username === process.env.ADMIN_USER &&
    password === process.env.ADMIN_PASS
  ) {
    const token = await createSession(username, "super_admin");
    const res = NextResponse.json({ ok: true });
    res.cookies.set(COOKIE, token, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 8,
    });
    return res;
  }

  return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
}
