import { NextRequest, NextResponse } from "next/server";
import getDb from "@/lib/db";
import { getSessionUser, getActiveClient, ACTIVE_CLIENT_COOKIE } from "@/lib/client-context";

// GET: which client is currently active for this user (drives the switcher UI).
export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const active = await getActiveClient();
  return NextResponse.json({
    active,
    role: user.role,
    canSwitch: user.role === "super_admin",
  });
}

// POST: super admin picks the active client (stored in a cookie).
export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "super_admin") {
    return NextResponse.json({ error: "Only super admin can switch clients" }, { status: 403 });
  }

  const { clientId } = await req.json();
  if (!clientId) return NextResponse.json({ error: "Missing clientId" }, { status: 400 });

  const db = await getDb();
  const c = await db.prepare("SELECT id FROM clients WHERE id = ?").get<{ id: string }>(clientId);
  if (!c) return NextResponse.json({ error: "Client not found" }, { status: 404 });

  const res = NextResponse.json({ ok: true, clientId });
  res.cookies.set(ACTIVE_CLIENT_COOKIE, clientId, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return res;
}
