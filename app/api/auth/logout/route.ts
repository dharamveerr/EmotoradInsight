import { NextRequest, NextResponse } from "next/server";
import { COOKIE, getSessionPayload } from "@/lib/auth";
import getDb from "@/lib/db";
import { v4 as uuidv4 } from "uuid";

export async function POST(req: NextRequest) {
  const token = req.cookies.get(COOKIE)?.value;

  let publicIp: string | null = null;
  try {
    const body = await req.json();
    publicIp = body?.publicIp || null;
  } catch {
    // body may be empty on legacy callers
  }

  if (token) {
    try {
      const payload = await getSessionPayload(token);
      if (payload) {
        const db = await getDb();
        const ip =
          publicIp ||
          req.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
          req.headers.get("x-real-ip") ||
          "unknown";

        // Find user_id
        const user = await db
          .prepare("SELECT id FROM app_users WHERE username = ? OR email = ?")
          .get<{ id: string }>(payload.username, payload.username);

        await db.prepare(
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
