import { NextRequest, NextResponse } from "next/server";
import getDb from "@/lib/db";
import { v4 as uuidv4 } from "uuid";

const PAGE_LABELS: Record<string, string> = {
  "/": "Overview",
  "/product-insights": "Journey Insights",
  "/journeys": "Journey Funnels",
  "/heatmap": "Time Heatmap",
  "/dropoff": "Drop-off Analysis",
  "/sessions": "MIS Report",
  "/create-tree": "Create Tree",
  "/user-management": "User Management",
};

export async function POST(req: NextRequest) {
  const identifier = req.headers.get("x-user-name") || "";
  const role = req.headers.get("x-user-role") || "admin";

  if (!identifier) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const page: string = body.page || "/";
  const clientPublicIp: string | null = body.publicIp || null;

  const db = await getDb();
  const now = new Date().toISOString();

  // Prefer client-reported public IP (real WAN address). Fall back to proxy headers
  // (production reverse proxy), then to "unknown" (pure localhost with no proxy).
  const ip =
    clientPublicIp ||
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
    req.headers.get("x-real-ip") ||
    "unknown";

  const user = await db
    .prepare("SELECT id FROM app_users WHERE username = ? OR email = ?")
    .get<{ id: string }>(identifier, identifier);

  const label = PAGE_LABELS[page] || page;

  await db.prepare(
    `INSERT INTO activity_log (id, user_id, identifier, role, page, page_label, timestamp, ip_address)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(uuidv4(), user?.id || null, identifier, role, page, label, now, ip);

  return NextResponse.json({ ok: true });
}
