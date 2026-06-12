import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";

const SECRET = new TextEncoder().encode(
  process.env.AUTH_SECRET || "super-secret-key-change-in-production"
);
const COOKIE = "ei_session";
const PENDING_COOKIE = "ei_pending_google";

export async function createSession(identifier: string, role: string) {
  const token = await new SignJWT({ username: identifier, role })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("8h")
    .sign(SECRET);
  return token;
}

export async function getSession() {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, SECRET);
    return payload as { username: string; role: string };
  } catch {
    return null;
  }
}

export async function getSessionPayload(token: string) {
  try {
    const { payload } = await jwtVerify(token, SECRET);
    return payload as { username: string; role: string };
  } catch {
    return null;
  }
}

export { COOKIE, SECRET, PENDING_COOKIE };
