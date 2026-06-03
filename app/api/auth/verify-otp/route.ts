import { NextRequest, NextResponse } from "next/server";
import { createSession, COOKIE } from "@/lib/auth";
import getDb from "@/lib/db";
import { v4 as uuidv4 } from "uuid";

export async function POST(req: NextRequest) {
  const { contact, code } = await req.json();

  if (!contact || !code) {
    return NextResponse.json({ error: "Missing contact or code" }, { status: 400 });
  }

  const db = getDb();
  const row = db
    .prepare("SELECT * FROM otp_requests WHERE contact = ? ORDER BY created_at DESC LIMIT 1")
    .get(contact) as { code: string; created_at: string } | undefined;

  if (!row) {
    return NextResponse.json({ error: "No OTP found" }, { status: 400 });
  }

  // Check expiry (5 min)
  const ageMs = Date.now() - new Date(row.created_at).getTime();
  if (ageMs > 5 * 60 * 1000) {
    return NextResponse.json({ error: "OTP expired" }, { status: 400 });
  }

  if (row.code !== code) {
    return NextResponse.json({ error: "Invalid OTP" }, { status: 400 });
  }

  // Mark verified
  db.prepare("UPDATE otp_requests SET verified = 1 WHERE contact = ?").run(contact);

  // Check/upsert in app_users
  const now = new Date().toISOString();
  let appUser = db
    .prepare("SELECT * FROM app_users WHERE email = ? OR username = ?")
    .get(contact, contact) as { id: string; role: string; is_active: number } | undefined;

  if (!appUser) {
    const newId = uuidv4();
    const isEmail = contact.includes("@");
    db.prepare(
      `INSERT INTO app_users (id, ${isEmail ? "email" : "username"}, role, is_active, created_at, updated_at)
       VALUES (?, ?, 'admin', 1, ?, ?)`
    ).run(newId, contact, now, now);
    appUser = { id: newId, role: "admin", is_active: 1 };
  }

  if (!appUser.is_active) {
    return NextResponse.json({ error: "Account access denied" }, { status: 403 });
  }

  // Log session
  const ip = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "unknown";
  db.prepare(
    `INSERT INTO login_sessions (id, user_id, identifier, role, action, timestamp, ip_address)
     VALUES (?, ?, ?, ?, 'login', ?, ?)`
  ).run(uuidv4(), appUser.id, contact, appUser.role, now, ip);

  const token = await createSession(contact, appUser.role);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 8,
  });
  return res;
}
