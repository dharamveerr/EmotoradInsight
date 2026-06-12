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

    const db = await getDb();

    // Check/upsert in google_users (legacy table)
    let googleUser = await db
      .prepare("SELECT * FROM google_users WHERE google_id = ?")
      .get<{ id: string }>(googleId);

    if (!googleUser) {
      const userId = uuidv4();
      await db.prepare(
        "INSERT INTO google_users (id, google_id, email, name, picture, created_at) VALUES (?, ?, ?, ?, ?, ?)"
      ).run(userId, googleId, email, name, picture, new Date().toISOString());
      googleUser = { id: userId };
    }

    // Check in app_users — existing users log in directly
    const now = new Date().toISOString();
    const appUser = await db
      .prepare("SELECT * FROM app_users WHERE email = ?")
      .get<{ id: string; role: string; is_active: number }>(email);

    if (!appUser) {
      // NEW Google user → ask for consent first; the login page shows
      // "You're new here — create an account?" and only then sends the code.
      return NextResponse.redirect(new URL(`/login?newuser=1&email=${encodeURIComponent(email)}`, req.url));
    }

    // Update name/picture if changed
    await db.prepare("UPDATE app_users SET name = ?, picture = ?, updated_at = ? WHERE email = ?")
      .run(name, picture, now, email);

    if (!appUser.is_active) {
      return NextResponse.redirect(new URL("/login?error=access_denied", req.url));
    }

    // Log session
    await db.prepare(
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
