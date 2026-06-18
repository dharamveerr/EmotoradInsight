import { NextRequest, NextResponse } from "next/server";
import getDb from "@/lib/db";

// Report permission keys.
//  - journey_analytics: Overview, Journey Insights, Funnels, Heatmap,
//    Drop-off, MIS Report, Create Tree.
//  - agent_statistics: agent performance reports.
// Add more keys here as new report groups are introduced.
export const PERMISSIONS = {
  JOURNEY_ANALYTICS: "journey_analytics",
  AGENT_STATISTICS: "agent_statistics",
} as const;

export type PermissionKey = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

// Every grantable report permission. A user with any one of these may enter
// the dashboard.
export const REPORT_PERMISSIONS: PermissionKey[] = [
  PERMISSIONS.JOURNEY_ANALYTICS,
  PERMISSIONS.AGENT_STATISTICS,
];

// Parse the JSON array stored in app_users.permissions. Tolerates null,
// malformed JSON, and legacy CSV — always returns a string[].
export function parsePermissions(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.map(String) : [];
  } catch {
    return raw.split(",").map((s) => s.trim()).filter(Boolean);
  }
}

// Super admins implicitly have every permission. Everyone else must be granted
// the specific key.
export function hasPermission(role: string, permissions: string[], key: PermissionKey): boolean {
  if (role === "super_admin") return true;
  return permissions.includes(key);
}

// Gate for entering the dashboard: super admin, or holds any report permission.
export function canViewReports(role: string, permissions: string[]): boolean {
  if (role === "super_admin") return true;
  return REPORT_PERMISSIONS.some((k) => permissions.includes(k));
}

// Server-side lookup of a user's role + permissions by login identifier
// (username or email). Used by the dashboard layout gate and report APIs.
export async function getUserAccess(
  identifier: string
): Promise<{ role: string; permissions: string[]; is_active: number } | null> {
  if (!identifier) return null;
  const db = await getDb();
  const user = await db
    .prepare(
      "SELECT role, permissions, is_active FROM app_users WHERE username = ? OR email = ?"
    )
    .get<{ role: string; permissions: string | null; is_active: number }>(identifier, identifier);
  if (!user) return null;
  return {
    role: user.role,
    permissions: parsePermissions(user.permissions),
    is_active: user.is_active,
  };
}

// API guard: returns a 403 response if the requester lacks report access,
// otherwise null. Reads identity from the proxy-injected headers. Use at the
// top of every report data route so data never leaks even on direct API calls.
export async function denyIfNoReports(req: NextRequest): Promise<NextResponse | null> {
  const role = req.headers.get("x-user-role") || "admin";
  if (role === "super_admin") return null;
  const identifier = req.headers.get("x-user-name") || "";
  const access = await getUserAccess(identifier);
  if (access && canViewReports(access.role, access.permissions)) return null;
  return NextResponse.json({ error: "No report access" }, { status: 403 });
}
