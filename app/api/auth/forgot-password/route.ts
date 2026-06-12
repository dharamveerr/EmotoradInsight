import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import getDb from "@/lib/db";
import { sendMail } from "@/lib/mailer";

export async function POST(req: NextRequest) {
  const { identifier } = await req.json();
  if (!identifier?.trim()) {
    return NextResponse.json({ error: "Enter your username or email" }, { status: 400 });
  }

  const db = await getDb();
  const user = await db
    .prepare("SELECT id, username, email, name, is_active FROM app_users WHERE username = ? OR email = ?")
    .get<{ id: string; username: string | null; email: string | null; name: string | null; is_active: number }>(
      identifier.trim(), identifier.trim()
    );

  if (!user || !user.is_active) {
    return NextResponse.json({ error: "No account found for that username or email" }, { status: 404 });
  }
  if (!user.email) {
    return NextResponse.json({ error: "This account has no email on file. Contact the Super Admin." }, { status: 400 });
  }

  const code = Math.floor(100000 + Math.random() * 900000).toString();
  await db.prepare("DELETE FROM otp_requests WHERE contact = ?").run(user.email);
  await db.prepare(
    "INSERT INTO otp_requests (id, contact, type, code, created_at) VALUES (?, ?, 'password_reset', ?, ?)"
  ).run(uuidv4(), user.email, code, new Date().toISOString());

  console.log(`\n🔑 Password reset code for ${user.email}: ${code}\n`);
  try {
    await sendMail(
      [user.email],
      "Emotorad Insight — password reset code",
      `<p>Hi ${user.name || ""},</p>
       <p>Your password reset code: <b style="font-size:20px;letter-spacing:3px">${code}</b></p>
       <p>It expires in 10 minutes. If you didn't request this, ignore this email.</p>`
    );
  } catch (e) {
    console.error("Failed to send reset email:", e);
    return NextResponse.json({ error: "Failed to send email. Try again later." }, { status: 500 });
  }

  // Mask the email for display: dh*****@chatbot.team
  const [local, domain] = user.email.split("@");
  const masked = `${local.slice(0, 2)}*****@${domain}`;
  return NextResponse.json({ ok: true, maskedEmail: masked });
}
