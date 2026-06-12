import { NextRequest, NextResponse } from "next/server";
import getDb from "@/lib/db";

const CODE_TTL_MS = 10 * 60 * 1000;

// Validates the signup code WITHOUT consuming it — the account is only
// created in /signup/complete (which re-validates and then deletes it).
export async function POST(req: NextRequest) {
  const { email, code } = await req.json();
  const cleanEmail = String(email || "").trim().toLowerCase();

  if (!cleanEmail || !code?.trim()) {
    return NextResponse.json({ error: "Email and code are required" }, { status: 400 });
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

  return NextResponse.json({ ok: true });
}
