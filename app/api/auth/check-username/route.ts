import { NextRequest, NextResponse } from "next/server";
import getDb from "@/lib/db";

export async function POST(req: NextRequest) {
  const { username } = await req.json();
  const clean = String(username || "").trim();

  if (!clean) {
    return NextResponse.json({ available: true });
  }
  if (/\s/.test(clean)) {
    return NextResponse.json({ available: false, error: "Username cannot contain spaces" });
  }

  const db = await getDb();
  const existing = await db
    .prepare("SELECT id FROM app_users WHERE username = ? OR email = ?")
    .get<{ id: string }>(clean, clean);

  if (existing) {
    return NextResponse.json({ available: false, error: "This username is not available" });
  }

  return NextResponse.json({ available: true });
}
