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

  // UNION login/logout events + page visit events, unified timeline.
  // LEFT JOIN app_users → clients so super admin sees which tenant each user belongs to.
  const sessions = await db
    .prepare(
      `SELECT
         ls.id,
         ls.user_id,
         ls.identifier,
         ls.role,
         ls.action,
         NULL AS page,
         NULL AS page_label,
         ls.timestamp,
         ls.ip_address,
         c.name AS client_name
       FROM login_sessions ls
       LEFT JOIN app_users u ON u.id = ls.user_id
       LEFT JOIN clients c ON c.id = u.client_id
       ${identifier ? "WHERE ls.identifier = ?" : ""}

       UNION ALL

       SELECT
         al.id,
         al.user_id,
         al.identifier,
         al.role,
         'visit' AS action,
         al.page,
         al.page_label,
         al.timestamp,
         al.ip_address,
         c.name AS client_name
       FROM activity_log al
       LEFT JOIN app_users u ON u.id = al.user_id
       LEFT JOIN clients c ON c.id = u.client_id
       ${identifier ? "WHERE al.identifier = ?" : ""}

       ORDER BY timestamp DESC
       LIMIT 300`
    )
    .all(...params);

  return NextResponse.json({ sessions });
}
