import { NextRequest, NextResponse } from "next/server";
import { COOKIE, getSessionPayload } from "@/lib/auth";
import getDb from "@/lib/db";
import { v4 as uuidv4 } from "uuid";

export async function POST(req: NextRequest) {
  const token = req.cookies.get(COOKIE)?.value;

  if (token) {
    try {
      const payload = await getSessionPayload(token);
      if (payload) {
        const db = getDb();
        const ip = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "unknown";

        // Find user_id
        const user = db
          .prepare("SELECT id FROM app_users WHERE username = ? OR email = ?")
          .get(payload.username, payload.username) as { id: string } | undefined;

        db.prepare(
          `INSERT INTO login_sessions (id, user_id, identifier, role, action, timestamp, ip_address)
           VALUES (?, ?, ?, ?, 'logout', ?, ?)`
        ).run(
          uuidv4(),
          user?.id || null,
          payload.username,
          payload.role,
          new Date().toISOString(),
          ip
        );
      }
    } catch {
      // ignore errors during logout logging
    }
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.delete(COOKIE);
  return res;
}
