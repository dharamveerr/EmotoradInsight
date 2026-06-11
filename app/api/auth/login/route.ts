import { NextRequest, NextResponse } from "next/server";
import { createSession, COOKIE } from "@/lib/auth";
import getDb, { verifyPassword } from "@/lib/db";
import { v4 as uuidv4 } from "uuid";

export async function POST(req: NextRequest) {
  const { username, password, publicIp } = await req.json();

  if (!username || !password) {
    return NextResponse.json({ error: "Missing credentials" }, { status: 400 });
  }

  const ip =
    publicIp ||
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
    req.headers.get("x-real-ip") ||
    "unknown";

  // === ENV VAR SUPER ADMIN BYPASS ===
  // Always-available login path that doesn't require a working DB. Critical for
  // production environments where the DB might be unreachable or out of sync.
  // Defaults to admin / emotorad2024 if env vars aren't set (legacy local dev).
  const envAdminUser = process.env.ADMIN_USER || "admin";
  const envAdminPass = process.env.ADMIN_PASS || "emotorad2024";
  if (username === envAdminUser && password === envAdminPass) {
    // Best-effort: log session if DB is reachable, but never block login on it
    try {
      const db = await getDb();
      const existing = await db
        .prepare("SELECT id FROM app_users WHERE username = ?")
        .get<{ id: string }>(username);
      await db.prepare(
        `INSERT INTO login_sessions (id, user_id, identifier, role, action, timestamp, ip_address)
         VALUES (?, ?, ?, ?, 'login', ?, ?)`
      ).run(uuidv4(), existing?.id || null, username, "super_admin", new Date().toISOString(), ip);
    } catch (e) {
      console.warn("login: failed to log session (env bypass)", e);
    }

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

  // === REGULAR DB-BACKED LOGIN ===
  let db;
  try {
    db = await getDb();
  } catch (e) {
    console.error("login: DB unreachable", e);
    return NextResponse.json({ error: "Service temporarily unavailable" }, { status: 503 });
  }

  const user = await db
    .prepare("SELECT * FROM app_users WHERE username = ?")
    .get<{
      id: string;
      username: string;
      role: string;
      is_active: number;
      password_hash: string | null;
    }>(username);

  if (!user) {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }

  if (!user.password_hash || !verifyPassword(password, user.password_hash)) {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }
  if (!user.is_active) {
    return NextResponse.json({ error: "Account access denied" }, { status: 403 });
  }

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
