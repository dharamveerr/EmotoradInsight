import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

const SECRET = new TextEncoder().encode(
  process.env.AUTH_SECRET || "super-secret-key-change-in-production"
);
const COOKIE = "ei_session";

export async function proxy(req: NextRequest) {
  const token = req.cookies.get(COOKIE)?.value;
  if (!token) {
    return NextResponse.redirect(new URL("/login", req.url));
  }
  try {
    const { payload } = await jwtVerify(token, SECRET);
    const username = (payload.username as string) || "";
    const role = (payload.role as string) || "admin";

    // Protect /user-management — super_admin only
    if (
      req.nextUrl.pathname.startsWith("/user-management") &&
      role !== "super_admin"
    ) {
      return NextResponse.redirect(new URL("/", req.url));
    }

    // Inject user info into request headers for API routes
    const requestHeaders = new Headers(req.headers);
    requestHeaders.set("x-user-name", username);
    requestHeaders.set("x-user-role", role);

    return NextResponse.next({ request: { headers: requestHeaders } });
  } catch {
    return NextResponse.redirect(new URL("/login", req.url));
  }
}

export const config = {
  matcher: ["/((?!login|api/auth|api/webhook|_next|.*\\.).*)"],
};
