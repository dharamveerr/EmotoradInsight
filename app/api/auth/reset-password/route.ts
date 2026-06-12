import { NextRequest, NextResponse } from "next/server";
import getDb, { hashPassword } from "@/lib/db";

const CODE_TTL_MS = 10 * 60 * 1000;

export async function POST(req: NextRequest) {
  const { identifier, code, newPassword } = await req.json();
  if (!identifier?.trim() || !code?.trim() || !newPassword) {
    return NextResponse.json({ error: "All fields are required" }, { status: 400 });
  }
  if (newPassword.trim().length < 6) {
    return NextResponse.json({ error: "Password must be at least 6 characters" }, { status: 400 });
  }

  const db = await getDb();
  const user = await db
    .prepare("SELECT id, email, is_active FROM app_users WHERE username = ? OR email = ?")
    .get<{ id: string; email: string | null; is_active: number }>(identifier.trim(), identifier.trim());

  if (!user || !user.is_active || !user.email) {
    return NextResponse.json({ error: "No account found" }, { status: 404 });
  }

  const otp = await db
    .prepare("SELECT code, created_at FROM otp_requests WHERE contact = ? AND type = 'password_reset'")
    .get<{ code: string; created_at: string }>(user.email);

  if (!otp || otp.code !== String(code).trim()) {
    return NextResponse.json({ error: "Invalid reset code" }, { status: 401 });
  }
  if (Date.now() - new Date(otp.created_at).getTime() > CODE_TTL_MS) {
    return NextResponse.json({ error: "Code expired. Request a new one." }, { status: 401 });
  }

  await db.prepare("UPDATE app_users SET password_hash = ?, updated_at = ? WHERE id = ?")
    .run(hashPassword(newPassword.trim()), new Date().toISOString(), user.id);
  await db.prepare("DELETE FROM otp_requests WHERE contact = ?").run(user.email);

  return NextResponse.json({ ok: true });
}
