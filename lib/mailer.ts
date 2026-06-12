import nodemailer from "nodemailer";

// Sends email via SMTP if configured (SMTP_USER + SMTP_PASS in env),
// otherwise logs to console (dev fallback).
// For Gmail: SMTP_USER = your gmail, SMTP_PASS = app password
// (myaccount.google.com/apppasswords).
export async function sendMail(to: string[], subject: string, html: string): Promise<boolean> {
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!user || !pass || to.length === 0) {
    console.log(`\n📧 [mail fallback] To: ${to.join(", ") || "(none)"}\nSubject: ${subject}\n${html.replace(/<[^>]+>/g, " ")}\n`);
    return false;
  }

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || "smtp.gmail.com",
    port: Number(process.env.SMTP_PORT || 465),
    secure: (process.env.SMTP_PORT || "465") === "465",
    auth: { user, pass },
  });

  await transporter.sendMail({
    from: `"Emotorad Insight" <${user}>`,
    to: to.join(", "),
    subject,
    html,
  });
  return true;
}
