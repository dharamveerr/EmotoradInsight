// One-off: upsert the "admin" app user (role: admin, password: emotorad2026)
// into both the local SQLite DB and Turso so environments stay in sync.
// Usage: node scripts/upsert-admin.mjs
import { createClient } from "@libsql/client";
import crypto from "node:crypto";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const USERNAME = "admin";
const PASSWORD = "emotorad2026";
const ROLE = "admin";

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.pbkdf2Sync(password, salt, 100000, 64, "sha512").toString("hex");
  return `${salt}:${hash}`;
}

function loadEnv() {
  const env = {};
  for (const line of fs.readFileSync(".env.local", "utf8").split("\n")) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m) env[m[1]] = m[2];
  }
  return env;
}

async function upsert(client, label) {
  const now = new Date().toISOString();
  const hash = hashPassword(PASSWORD);
  const existing = await client.execute({
    sql: "SELECT id FROM app_users WHERE username = ?",
    args: [USERNAME],
  });
  if (existing.rows.length > 0) {
    await client.execute({
      sql: "UPDATE app_users SET password_hash = ?, role = ?, is_active = 1, updated_at = ? WHERE username = ?",
      args: [hash, ROLE, now, USERNAME],
    });
    console.log(`[${label}] updated existing "${USERNAME}" → role=${ROLE}`);
  } else {
    await client.execute({
      sql: `INSERT INTO app_users (id, username, name, role, is_active, password_hash, created_at, updated_at)
            VALUES (?, ?, ?, ?, 1, ?, ?, ?)`,
      args: [randomUUID(), USERNAME, USERNAME, ROLE, hash, now, now],
    });
    console.log(`[${label}] created "${USERNAME}" → role=${ROLE}`);
  }
}

const env = loadEnv();

// Local SQLite
const localPath = path.resolve("data/insights.db");
if (fs.existsSync(localPath)) {
  const local = createClient({ url: `file:${localPath}` });
  await upsert(local, "local");
} else {
  console.log("[local] data/insights.db not found, skipped");
}

// Turso
if (env.TURSO_DATABASE_URL && env.TURSO_AUTH_TOKEN) {
  const turso = createClient({ url: env.TURSO_DATABASE_URL, authToken: env.TURSO_AUTH_TOKEN });
  await upsert(turso, "turso");
} else {
  console.log("[turso] TURSO_DATABASE_URL/TURSO_AUTH_TOKEN missing, skipped");
}
