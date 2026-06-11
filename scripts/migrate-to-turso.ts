/**
 * Migrate local SQLite data to Turso.
 * Reads from data/insights.db (local) and writes to TURSO_DATABASE_URL.
 *
 * Run: npx tsx scripts/migrate-to-turso.ts
 */
import { createClient } from "@libsql/client";
import path from "path";
import fs from "fs";

const LOCAL_DB_PATH = path.join(process.cwd(), "data", "insights.db");

const TURSO_URL = process.env.TURSO_DATABASE_URL;
const TURSO_TOKEN = process.env.TURSO_AUTH_TOKEN;

if (!TURSO_URL || !TURSO_TOKEN) {
  console.error("Missing TURSO_DATABASE_URL or TURSO_AUTH_TOKEN env vars.");
  console.error("Make sure .env.local is loaded (e.g. via dotenv-cli or Next.js).");
  process.exit(1);
}

if (!fs.existsSync(LOCAL_DB_PATH)) {
  console.error(`Local DB not found at ${LOCAL_DB_PATH}`);
  process.exit(1);
}

async function main() {
  console.log("📦 Connecting to local SQLite...");
  const local = createClient({ url: `file:${LOCAL_DB_PATH}` });

  console.log("☁️  Connecting to Turso...");
  const turso = createClient({ url: TURSO_URL!, authToken: TURSO_TOKEN! });

  // Create schema on Turso first
  console.log("🔧 Creating schema on Turso...");
  const schemaStatements = [
    `CREATE TABLE IF NOT EXISTS events (id TEXT PRIMARY KEY, userId TEXT NOT NULL, journey TEXT NOT NULL, step TEXT NOT NULL, timestamp TEXT NOT NULL, metadata TEXT)`,
    `CREATE INDEX IF NOT EXISTS idx_journey ON events(journey)`,
    `CREATE INDEX IF NOT EXISTS idx_timestamp ON events(timestamp)`,
    `CREATE INDEX IF NOT EXISTS idx_user_journey ON events(userId, journey)`,
    `CREATE TABLE IF NOT EXISTS otp_requests (id TEXT PRIMARY KEY, contact TEXT NOT NULL UNIQUE, type TEXT NOT NULL, code TEXT NOT NULL, created_at TEXT NOT NULL, verified INTEGER DEFAULT 0)`,
    `CREATE INDEX IF NOT EXISTS idx_contact ON otp_requests(contact)`,
    `CREATE TABLE IF NOT EXISTS google_users (id TEXT PRIMARY KEY, google_id TEXT NOT NULL UNIQUE, email TEXT NOT NULL, name TEXT, picture TEXT, created_at TEXT NOT NULL)`,
    `CREATE INDEX IF NOT EXISTS idx_google_id ON google_users(google_id)`,
    `CREATE TABLE IF NOT EXISTS tree_configs (id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT, structure TEXT NOT NULL, status TEXT DEFAULT 'draft', published_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`,
    `CREATE INDEX IF NOT EXISTS idx_tree_status ON tree_configs(status)`,
    `CREATE TABLE IF NOT EXISTS app_users (id TEXT PRIMARY KEY, username TEXT, email TEXT UNIQUE, name TEXT, picture TEXT, phone_number TEXT, role TEXT NOT NULL DEFAULT 'admin', is_active INTEGER NOT NULL DEFAULT 1, password_hash TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`,
    `CREATE INDEX IF NOT EXISTS idx_app_users_username ON app_users(username)`,
    `CREATE INDEX IF NOT EXISTS idx_app_users_email ON app_users(email)`,
    `CREATE INDEX IF NOT EXISTS idx_app_users_role ON app_users(role)`,
    `CREATE TABLE IF NOT EXISTS login_sessions (id TEXT PRIMARY KEY, user_id TEXT, identifier TEXT NOT NULL, role TEXT, action TEXT NOT NULL, timestamp TEXT NOT NULL, ip_address TEXT)`,
    `CREATE INDEX IF NOT EXISTS idx_login_sessions_identifier ON login_sessions(identifier)`,
    `CREATE INDEX IF NOT EXISTS idx_login_sessions_timestamp ON login_sessions(timestamp)`,
    `CREATE TABLE IF NOT EXISTS activity_log (id TEXT PRIMARY KEY, user_id TEXT, identifier TEXT NOT NULL, role TEXT, page TEXT NOT NULL, page_label TEXT, timestamp TEXT NOT NULL, ip_address TEXT)`,
    `CREATE INDEX IF NOT EXISTS idx_activity_log_identifier ON activity_log(identifier)`,
    `CREATE INDEX IF NOT EXISTS idx_activity_log_timestamp ON activity_log(timestamp)`,
    `CREATE TABLE IF NOT EXISTS variables (id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE, description TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`,
    `CREATE INDEX IF NOT EXISTS idx_variables_name ON variables(name)`,
    `CREATE TABLE IF NOT EXISTS journeys (id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT, structure TEXT NOT NULL, status TEXT DEFAULT 'draft', published_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`,
    `CREATE INDEX IF NOT EXISTS idx_journey_status ON journeys(status)`,
  ];

  for (const stmt of schemaStatements) {
    await turso.execute(stmt);
  }

  // Tables to migrate (order matters for FK-like dependencies)
  const tables = [
    "events",
    "otp_requests",
    "google_users",
    "tree_configs",
    "app_users",
    "login_sessions",
    "activity_log",
    "variables",
    "journeys",
  ];

  for (const table of tables) {
    console.log(`\n📋 Migrating ${table}...`);

    // Get all rows from local
    const localRes = await local.execute(`SELECT * FROM ${table}`);
    const rows = localRes.rows;

    if (rows.length === 0) {
      console.log(`   (empty, skipping)`);
      continue;
    }

    // Clear remote table first
    await turso.execute(`DELETE FROM ${table}`);

    const columns = localRes.columns;
    const placeholders = columns.map(() => "?").join(", ");
    const sql = `INSERT INTO ${table} (${columns.join(", ")}) VALUES (${placeholders})`;

    // Batch insert in chunks
    const CHUNK = 50;
    let inserted = 0;
    for (let i = 0; i < rows.length; i += CHUNK) {
      const chunk = rows.slice(i, i + CHUNK);
      const batch = chunk.map((row) => ({
        sql,
        args: columns.map((c) => (row as Record<string, unknown>)[c]) as never,
      }));
      await turso.batch(batch, "write");
      inserted += chunk.length;
      process.stdout.write(`\r   ${inserted} / ${rows.length}`);
    }
    console.log(`\n   ✅ ${inserted} rows migrated`);
  }

  console.log("\n🎉 Migration complete!");
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
