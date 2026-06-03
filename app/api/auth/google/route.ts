import { NextRequest, NextResponse } from "next/server";
import { OAuth2Client } from "google-auth-library";
import { v4 as uuidv4 } from "uuid";
import { createSession, COOKIE } from "@/lib/auth";
import getDb from "@/lib/db";

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");

  if (!code) {
    return NextResponse.redirect(new URL("/login?error=no_code", req.url));
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI || "http://localhost:3100/api/auth/google";

  if (!clientId || !clientSecret) {
    return NextResponse.redirect(new URL("/login?error=config", req.url));
  }

  try {
    const client = new OAuth2Client(clientId, clientSecret, redirectUri);
    const { tokens } = await client.getToken(code);
    const ticket = await client.verifyIdToken({
      idToken: tokens.id_token || "",
      audience: clientId,
    });
    const gPayload = ticket.getPayload();

    if (!gPayload) {
      return NextResponse.redirect(new URL("/login?error=invalid_token", req.url));
    }

    const googleId = gPayload.sub;
    const email = gPayload.email || "";
    const name = gPayload.name || "";
    const picture = gPayload.picture || "";
    const ip = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "unknown";

    const db = getDb();

    // Check/upsert in google_users (legacy table)
    let googleUser = db
      .prepare("SELECT * FROM google_users WHERE google_id = ?")
      .get(googleId) as { id: string } | undefined;

    if (!googleUser) {
      const userId = uuidv4();
      db.prepare(
        "INSERT INTO google_users (id, google_id, email, name, picture, created_at) VALUES (?, ?, ?, ?, ?, ?)"
      ).run(userId, googleId, email, name, picture, new Date().toISOString());
      googleUser = { id: userId };
    }

    // Check/upsert in app_users
    const now = new Date().toISOString();
    let appUser = db
      .prepare("SELECT * FROM app_users WHERE email = ?")
      .get(email) as { id: string; role: string; is_active: number } | undefined;

    if (!appUser) {
      const newId = uuidv4();
      db.prepare(
        `INSERT INTO app_users (id, email, name, picture, role, is_active, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'admin', 1, ?, ?)`
      ).run(newId, email, name, picture, now, now);
      appUser = { id: newId, role: "admin", is_active: 1 };
    } else {
      // Update name/picture if changed
      db.prepare("UPDATE app_users SET name = ?, picture = ?, updated_at = ? WHERE email = ?")
        .run(name, picture, now, email);
    }

    if (!appUser.is_active) {
      return NextResponse.redirect(new URL("/login?error=access_denied", req.url));
    }

    // Log session
    db.prepare(
      `INSERT INTO login_sessions (id, user_id, identifier, role, action, timestamp, ip_address)
       VALUES (?, ?, ?, ?, 'login', ?, ?)`
    ).run(uuidv4(), appUser.id, email, appUser.role, now, ip);

    const token = await createSession(email || googleId, appUser.role);
    const res = NextResponse.redirect(new URL("/", req.url));
    res.cookies.set(COOKIE, token, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 8,
    });
    return res;
  } catch (err) {
    console.error("Google OAuth error:", err);
    return NextResponse.redirect(new URL("/login?error=auth_failed", req.url));
  }
}
