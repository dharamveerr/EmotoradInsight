import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import getDb from "@/lib/db";

function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export async function POST(req: NextRequest) {
  const { contact, type } = await req.json();

  if (!contact || !["mobile", "email"].includes(type)) {
    return NextResponse.json({ error: "Invalid contact or type" }, { status: 400 });
  }

  const db = await getDb();
  const code = generateOTP();
  const id = uuidv4();

  // Delete old OTP for this contact
  await db.prepare("DELETE FROM otp_requests WHERE contact = ?").run(contact);

  // Insert new OTP
  await db.prepare(
    "INSERT INTO otp_requests (id, contact, type, code, created_at) VALUES (?, ?, ?, ?, ?)"
  ).run(id, contact, type, code, new Date().toISOString());

  // Mock: print to console (real SMS/Email would send here)
  console.log(`\n📱 OTP for ${contact} (${type}): ${code}\n`);

  return NextResponse.json({
    success: true,
    message: `OTP sent to ${type}. Check console for mock OTP.`,
  });
}
