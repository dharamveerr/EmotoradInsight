import { NextRequest, NextResponse } from "next/server";
import getDb from "@/lib/db";

export async function GET(req: NextRequest) {
  const role = req.headers.get("x-user-role");
  if (role !== "super_admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const db = getDb();
  const identifier = req.nextUrl.searchParams.get("identifier");

  const sessions = identifier
    ? db
        .prepare(
          "SELECT * FROM login_sessions WHERE identifier = ? ORDER BY timestamp DESC LIMIT 200"
        )
        .all(identifier)
    : db
        .prepare(
          "SELECT * FROM login_sessions ORDER BY timestamp DESC LIMIT 200"
        )
        .all();

  return NextResponse.json({ sessions });
}
