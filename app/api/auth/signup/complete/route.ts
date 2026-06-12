import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { createSession, COOKIE } from "@/lib/auth";
import getDb, { hashPassword } from "@/lib/db";

const CODE_TTL_MS = 10 * 60 * 1000;

// Step 2 of signup: code + password (+ optional username; defaults to email)
export async function POST(req: NextRequest) {
  const { email, code, username, password, name, publicIp } = await req.json();
  const cleanEmail = String(email || "").trim().toLowerCase();
  const cleanUsername = String(username || "").trim() || cleanEmail;
  const cleanName = String(name || "").trim() || "User";

  if (!cleanEmail || !code?.trim() || !password) {
    return NextResponse.json({ error: "All fields are required" }, { status: 400 });
  }
  if (String(password).trim().length < 6) {
    return NextResponse.json({ error: "Password must be at least 6 characters" }, { status: 400 });
  }

  const db = await getDb();

  const otp = await db
    .prepare("SELECT code, created_at FROM otp_requests WHERE contact = ? AND type = 'signup'")
    .get<{ code: string; created_at: string }>(cleanEmail);

  if (!otp || otp.code !== String(code).trim()) {
    return NextResponse.json({ error: "Invalid verification code" }, { status: 401 });
  }
  if (Date.now() - new Date(otp.created_at).getTime() > CODE_TTL_MS) {
    return NextResponse.json({ error: "Code expired. Start the sign up again." }, { status: 401 });
  }

  // Re-check uniqueness (email might have registered meanwhile; username must be free)
  const emailClash = await db
    .prepare("SELECT id FROM app_users WHERE email = ?")
    .get<{ id: string }>(cleanEmail);
  if (emailClash) {
    return NextResponse.json({ error: "This email is already registered. Please log in instead." }, { status: 409 });
  }
  const usernameClash = await db
    .prepare("SELECT id FROM app_users WHERE username = ? OR email = ?")
    .get<{ id: string }>(cleanUsername, cleanUsername);
  if (usernameClash) {
    return NextResponse.json({ error: "This username is not available" }, { status: 409 });
  }

  const now = new Date().toISOString();
  const ip =
    publicIp ||
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
    req.headers.get("x-real-ip") ||
    "unknown";

  const newId = uuidv4();
  await db.prepare(
    `INSERT INTO app_users (id, username, email, name, role, is_active, password_hash, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'admin', 1, ?, ?, ?)`
  ).run(newId, cleanUsername, cleanEmail, cleanName, hashPassword(String(password).trim()), now, now);

  await db.prepare("DELETE FROM otp_requests WHERE contact = ?").run(cleanEmail);

  await db.prepare(
    `INSERT INTO login_sessions (id, user_id, identifier, role, action, timestamp, ip_address)
     VALUES (?, ?, ?, 'admin', 'login', ?, ?)`
  ).run(uuidv4(), newId, cleanEmail, now, ip);

  const token = await createSession(cleanEmail, "admin");
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 8,
  });
  return res;
}
