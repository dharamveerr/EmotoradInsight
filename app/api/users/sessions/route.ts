import { NextRequest, NextResponse } from "next/server";
import getDb from "@/lib/db";

export async function GET(req: NextRequest) {
  const role = req.headers.get("x-user-role");
  if (role !== "super_admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const db = await getDb();
  const identifier = req.nextUrl.searchParams.get("identifier");

  const params = identifier ? [identifier, identifier] : [];

  // UNION login/logout events + page visit events, unified timeline
  const sessions = await db
    .prepare(
      `SELECT
         id,
         user_id,
         identifier,
         role,
         action,
         NULL AS page,
         NULL AS page_label,
         timestamp,
         ip_address
       FROM login_sessions
       ${identifier ? "WHERE identifier = ?" : ""}

       UNION ALL

       SELECT
         id,
         user_id,
         identifier,
         role,
         'visit' AS action,
         page,
         page_label,
         timestamp,
         ip_address
       FROM activity_log
       ${identifier ? "WHERE identifier = ?" : ""}

       ORDER BY timestamp DESC
       LIMIT 300`
    )
    .all(...params);

  return NextResponse.json({ sessions });
}
