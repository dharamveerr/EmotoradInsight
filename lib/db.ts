import { createClient, Client, InValue, ResultSet } from "@libsql/client";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import { v4 as uuidv4 } from "uuid";

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto
    .pbkdf2Sync(password, salt, 100000, 64, "sha512")
    .toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const computed = crypto
    .pbkdf2Sync(password, salt, 100000, 64, "sha512")
    .toString("hex");
  return computed === hash;
}

// Statement adapter — mimics better-sqlite3 API but async
export class Statement {
  constructor(private client: Client, private sql: string) {}

  private toArgs(args: unknown[]): InValue[] {
    // Flatten if first arg is array (legacy support)
    if (args.length === 1 && Array.isArray(args[0])) {
      return args[0] as InValue[];
    }
    return args as InValue[];
  }

  async get<T = Record<string, unknown>>(...args: unknown[]): Promise<T | undefined> {
    const r: ResultSet = await this.client.execute({
      sql: this.sql,
      args: this.toArgs(args),
    });
    return (r.rows[0] as unknown as T) ?? undefined;
  }

  async all<T = Record<string, unknown>>(...args: unknown[]): Promise<T[]> {
    const r: ResultSet = await this.client.execute({
      sql: this.sql,
      args: this.toArgs(args),
    });
    return r.rows as unknown as T[];
  }

  async run(...args: unknown[]): Promise<{ changes: number; lastInsertRowid: bigint | undefined }> {
    const r: ResultSet = await this.client.execute({
      sql: this.sql,
      args: this.toArgs(args),
    });
    return {
      changes: r.rowsAffected,
      lastInsertRowid: r.lastInsertRowid,
    };
  }
}

// DB adapter — wraps libsql client with prepare/exec
export class DB {
  constructor(public client: Client) {}

  prepare(sql: string): Statement {
    return new Statement(this.client, sql);
  }

  async exec(sql: string): Promise<void> {
    // Split multi-statement SQL by `;` and execute each
    const statements = sql
      .split(";")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    for (const stmt of statements) {
      await this.client.execute(stmt);
    }
  }
}

let cachedDb: DB | null = null;
let initPromise: Promise<DB> | null = null;

async function initDb(): Promise<DB> {
  // Use Turso if env vars set, otherwise local file
  const url = process.env.TURSO_DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;

  let client: Client;
  if (url && authToken) {
    client = createClient({ url, authToken });
  } else {
    // Local fallback
    const DB_PATH = path.join(process.cwd(), "data", "insights.db");
    const dir = path.dirname(DB_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    client = createClient({ url: `file:${DB_PATH}` });
  }

  const db = new DB(client);

  // Create tables
  const ddl = [
    `CREATE TABLE IF NOT EXISTS events (
      id TEXT PRIMARY KEY,
      userId TEXT NOT NULL,
      journey TEXT NOT NULL,
      step TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      metadata TEXT
    )`,
    `CREATE INDEX IF NOT EXISTS idx_journey ON events(journey)`,
    `CREATE INDEX IF NOT EXISTS idx_timestamp ON events(timestamp)`,
    `CREATE INDEX IF NOT EXISTS idx_user_journey ON events(userId, journey)`,

    `CREATE TABLE IF NOT EXISTS otp_requests (
      id TEXT PRIMARY KEY,
      contact TEXT NOT NULL UNIQUE,
      type TEXT NOT NULL,
      code TEXT NOT NULL,
      created_at TEXT NOT NULL,
      verified INTEGER DEFAULT 0
    )`,
    `CREATE INDEX IF NOT EXISTS idx_contact ON otp_requests(contact)`,

    `CREATE TABLE IF NOT EXISTS google_users (
      id TEXT PRIMARY KEY,
      google_id TEXT NOT NULL UNIQUE,
      email TEXT NOT NULL,
      name TEXT,
      picture TEXT,
      created_at TEXT NOT NULL
    )`,
    `CREATE INDEX IF NOT EXISTS idx_google_id ON google_users(google_id)`,

    `CREATE TABLE IF NOT EXISTS tree_configs (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      structure TEXT NOT NULL,
      status TEXT DEFAULT 'draft',
      published_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`,
    `CREATE INDEX IF NOT EXISTS idx_tree_status ON tree_configs(status)`,

    `CREATE TABLE IF NOT EXISTS app_users (
      id TEXT PRIMARY KEY,
      username TEXT,
      email TEXT UNIQUE,
      name TEXT,
      picture TEXT,
      phone_number TEXT,
      role TEXT NOT NULL DEFAULT 'admin',
      is_active INTEGER NOT NULL DEFAULT 1,
      password_hash TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`,
    `CREATE INDEX IF NOT EXISTS idx_app_users_username ON app_users(username)`,
    `CREATE INDEX IF NOT EXISTS idx_app_users_email ON app_users(email)`,
    `CREATE INDEX IF NOT EXISTS idx_app_users_role ON app_users(role)`,

    `CREATE TABLE IF NOT EXISTS login_sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      identifier TEXT NOT NULL,
      role TEXT,
      action TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      ip_address TEXT
    )`,
    `CREATE INDEX IF NOT EXISTS idx_login_sessions_identifier ON login_sessions(identifier)`,
    `CREATE INDEX IF NOT EXISTS idx_login_sessions_timestamp ON login_sessions(timestamp)`,

    `CREATE TABLE IF NOT EXISTS activity_log (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      identifier TEXT NOT NULL,
      role TEXT,
      page TEXT NOT NULL,
      page_label TEXT,
      timestamp TEXT NOT NULL,
      ip_address TEXT
    )`,
    `CREATE INDEX IF NOT EXISTS idx_activity_log_identifier ON activity_log(identifier)`,
    `CREATE INDEX IF NOT EXISTS idx_activity_log_timestamp ON activity_log(timestamp)`,

    `CREATE TABLE IF NOT EXISTS variables (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      description TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`,
    `CREATE INDEX IF NOT EXISTS idx_variables_name ON variables(name)`,

    `CREATE TABLE IF NOT EXISTS journeys (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      structure TEXT NOT NULL,
      status TEXT DEFAULT 'draft',
      published_at TEXT,
      tree_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`,
    `CREATE INDEX IF NOT EXISTS idx_journey_status ON journeys(status)`,

    `CREATE TABLE IF NOT EXISTS trees (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      status TEXT DEFAULT 'draft',
      published_at TEXT,
      client_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`,
    `CREATE INDEX IF NOT EXISTS idx_trees_status ON trees(status)`,

    `CREATE TABLE IF NOT EXISTS clients (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      slug TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`,
    `CREATE INDEX IF NOT EXISTS idx_clients_slug ON clients(slug)`,

    `CREATE TABLE IF NOT EXISTS client_variables (
      id TEXT PRIMARY KEY,
      client_id TEXT NOT NULL,
      name TEXT NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE(client_id, name)
    )`,
    `CREATE INDEX IF NOT EXISTS idx_client_variables ON client_variables(client_id)`,

    `CREATE TABLE IF NOT EXISTS source_fetch_log (
      client_id TEXT NOT NULL,
      day TEXT NOT NULL,
      fetched_at TEXT NOT NULL,
      PRIMARY KEY (client_id, day)
    )`,

    // Agent statistics — one row per (client, agent, customer) conversation,
    // delivered by N8N from the source agent console. Replaced wholesale on each
    // sync (it is a snapshot, not additive). Per-agent counts are aggregated in
    // SQL for the Agent Statistics view.
    `CREATE TABLE IF NOT EXISTS agent_stats (
      id TEXT PRIMARY KEY,
      client_id TEXT NOT NULL,
      agent_name TEXT,
      customer_contact TEXT,
      campaign_id TEXT,
      is_customer_replied INTEGER DEFAULT 0,
      customer_last_reply TEXT,
      customer_last_reply_at TEXT,
      is_agent_replied INTEGER DEFAULT 0,
      agent_last_reply TEXT,
      agent_last_reply_at TEXT,
      is_open INTEGER DEFAULT 0,
      source_created_at TEXT,
      synced_at TEXT
    )`,
    `CREATE INDEX IF NOT EXISTS idx_agent_stats_client ON agent_stats(client_id)`,
  ];

  for (const stmt of ddl) {
    await client.execute(stmt);
  }

  // Migrations: add columns that may post-date an existing table.
  // CREATE INDEX on a missing column throws, so ALTER must run first.
  const addColumn = async (sql: string) => {
    try { await client.execute(sql); } catch { /* column exists */ }
  };
  await addColumn("ALTER TABLE journeys ADD COLUMN tree_id TEXT");
  await addColumn("ALTER TABLE trees ADD COLUMN client_id TEXT");
  await addColumn("ALTER TABLE app_users ADD COLUMN client_id TEXT");
  await addColumn("ALTER TABLE events ADD COLUMN client_id TEXT");
  // Source identity for N8N-ingested events (idempotent upserts)
  await addColumn("ALTER TABLE events ADD COLUMN source_id TEXT");
  // External tenant identity used to pull data from the source Postgres
  await addColumn("ALTER TABLE clients ADD COLUMN org_id TEXT");
  await addColumn("ALTER TABLE clients ADD COLUMN source_client_id TEXT");
  await addColumn("ALTER TABLE clients ADD COLUMN subdomain TEXT");
  await addColumn("ALTER TABLE clients ADD COLUMN last_synced_at TEXT");
  // Flag synced variables added in the most recent sync (shown as "New")
  await addColumn("ALTER TABLE client_variables ADD COLUMN is_new INTEGER DEFAULT 0");
  // Per-user report permissions (JSON array of permission keys, e.g. ["journey_analytics"])
  await addColumn("ALTER TABLE app_users ADD COLUMN permissions TEXT");
  // One-time backfill: rows predating this column (NULL) keep their current
  // access by granting journey_analytics. New self-signups insert '[]' so they
  // start with no report access until a super admin grants it.
  await client.execute(
    "UPDATE app_users SET permissions = '[\"journey_analytics\"]' WHERE permissions IS NULL"
  );

  // Migrate client_variables to be template-scoped + carry a value (one-time).
  // Variables are distinct per bot_template_id, so the uniqueness key changes
  // from (client_id, name) to (client_id, bot_template_id, name).
  const cvCols = await client.execute("PRAGMA table_info(client_variables)");
  const hasTpl = (cvCols.rows as unknown as { name: string }[]).some((c) => c.name === "bot_template_id");
  if (!hasTpl) {
    await client.execute("ALTER TABLE client_variables RENAME TO client_variables_old");
    await client.execute(`CREATE TABLE client_variables (
      id TEXT PRIMARY KEY,
      client_id TEXT NOT NULL,
      bot_template_id TEXT,
      name TEXT NOT NULL,
      value TEXT,
      created_at TEXT NOT NULL,
      is_new INTEGER DEFAULT 0,
      UNIQUE(client_id, bot_template_id, name)
    )`);
    await client.execute(
      "INSERT INTO client_variables (id, client_id, bot_template_id, name, value, created_at, is_new) SELECT id, client_id, NULL, name, NULL, created_at, is_new FROM client_variables_old"
    );
    await client.execute("DROP TABLE client_variables_old");
    await client.execute("CREATE INDEX IF NOT EXISTS idx_client_variables ON client_variables(client_id)");
  }

  // Migrate variables table to be client-scoped (one-time, safe)
  const varCols = await client.execute("PRAGMA table_info(variables)");
  const hasVarClientId = (varCols.rows as unknown as { name: string }[]).some((c) => c.name === "client_id");
  if (!hasVarClientId) {
    await client.execute("ALTER TABLE variables RENAME TO variables_old");
    await client.execute(`CREATE TABLE variables (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      client_id TEXT,
      description TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(client_id, name)
    )`);
    await client.execute("INSERT INTO variables SELECT id, name, NULL, description, created_at, updated_at FROM variables_old");
    await client.execute("DROP TABLE variables_old");
    await client.execute("CREATE INDEX IF NOT EXISTS idx_variables_name ON variables(name)");
  }
  await client.execute("CREATE INDEX IF NOT EXISTS idx_journey_tree ON journeys(tree_id)");
  await client.execute("CREATE INDEX IF NOT EXISTS idx_trees_client ON trees(client_id)");
  await client.execute("CREATE INDEX IF NOT EXISTS idx_app_users_client ON app_users(client_id)");
  await client.execute("CREATE INDEX IF NOT EXISTS idx_events_client ON events(client_id)");
  // Dedup ingested rows; partial-style uniqueness (NULL source_id rows allowed many)
  await client.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_events_source ON events(source_id) WHERE source_id IS NOT NULL");
  await client.execute("CREATE INDEX IF NOT EXISTS idx_clients_source ON clients(org_id, source_client_id)");

  // One-time backfill: single-tenant data predates clients. If no clients
  // exist yet but there is tree/event data, fold it all into a default
  // "Emotorad" client so nothing is orphaned.
  const clientCount = Number(
    ((await client.execute("SELECT COUNT(*) as c FROM clients")).rows[0] as unknown as { c: number }).c
  );
  if (clientCount === 0) {
    const treeRows = Number(((await client.execute("SELECT COUNT(*) as c FROM trees")).rows[0] as unknown as { c: number }).c);
    const eventRows = Number(((await client.execute("SELECT COUNT(*) as c FROM events")).rows[0] as unknown as { c: number }).c);
    if (treeRows > 0 || eventRows > 0) {
      const cid = uuidv4();
      const now = new Date().toISOString();
      await client.execute({
        sql: "INSERT INTO clients (id, name, slug, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
        args: [cid, "Emotorad", "emotorad", now, now],
      });
      await client.execute({ sql: "UPDATE trees SET client_id = ? WHERE client_id IS NULL", args: [cid] });
      await client.execute({ sql: "UPDATE events SET client_id = ? WHERE client_id IS NULL", args: [cid] });
      // Existing client admins were implicitly Emotorad; super_admin stays global (null)
      await client.execute({ sql: "UPDATE app_users SET client_id = ? WHERE client_id IS NULL AND role != 'super_admin'", args: [cid] });
    }
  }

  // Seed super_admin from env vars if no users exist yet
  const countRes = await client.execute("SELECT COUNT(*) as c FROM app_users");
  const count = Number((countRes.rows[0] as unknown as { c: number }).c);
  if (count === 0) {
    const adminUser = process.env.ADMIN_USER || "admin";
    const adminPass = process.env.ADMIN_PASS || "emotorad2024";
    const now = new Date().toISOString();
    await client.execute({
      sql: `INSERT INTO app_users (id, username, name, role, is_active, password_hash, created_at, updated_at)
            VALUES (?, ?, ?, 'super_admin', 1, ?, ?, ?)`,
      args: [uuidv4(), adminUser, adminUser, hashPassword(adminPass), now, now],
    });
  }

  return db;
}

async function getDb(): Promise<DB> {
  if (cachedDb) return cachedDb;
  if (!initPromise) {
    initPromise = initDb().then((db) => {
      cachedDb = db;
      return db;
    });
  }
  return initPromise;
}

export default getDb;
