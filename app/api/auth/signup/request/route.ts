import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import getDb from "@/lib/db";
import { sendMail } from "@/lib/mailer";

// Step 1 of signup: email → verification code goes to the Super Admin(s)
export async function POST(req: NextRequest) {
  const { email } = await req.json();
  const cleanEmail = String(email || "").trim().toLowerCase();

  if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
    return NextResponse.json({ error: "A valid email is required" }, { status: 400 });
  }

  const db = await getDb();
  const existing = await db
    .prepare("SELECT id FROM app_users WHERE email = ?")
    .get<{ id: string }>(cleanEmail);

  if (existing) {
    return NextResponse.json({ error: "This email is already registered. Please log in instead." }, { status: 409 });
  }

  const code = Math.floor(100000 + Math.random() * 900000).toString();
  await db.prepare("DELETE FROM otp_requests WHERE contact = ?").run(cleanEmail);
  await db.prepare(
    "INSERT INTO otp_requests (id, contact, type, code, created_at) VALUES (?, ?, 'signup', ?, ?)"
  ).run(uuidv4(), cleanEmail, code, new Date().toISOString());

  const superAdmins = await db
    .prepare("SELECT email FROM app_users WHERE role = 'super_admin' AND is_active = 1 AND email IS NOT NULL")
    .all<{ email: string }>();

  console.log(`\n🔐 Signup verification code for ${cleanEmail}: ${code}\n`);
  try {
    await sendMail(
      superAdmins.map((s) => s.email),
      `Emotorad Insight — approve new user ${cleanEmail}`,
      `<p>A new user is trying to sign up:</p>
       <p><b>${cleanEmail}</b></p>
       <p>Verification code: <b style="font-size:20px;letter-spacing:3px">${code}</b></p>
       <p>Share this code with the user only if you approve their access. Code expires in 10 minutes.</p>`
    );
  } catch (e) {
    console.error("Failed to email signup code:", e);
  }

  return NextResponse.json({ ok: true });
}
