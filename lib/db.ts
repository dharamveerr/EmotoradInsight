import { Pool, PoolClient, types } from "pg";
import crypto from "crypto";
import { v4 as uuidv4 } from "uuid";

// The app was built against SQLite/libsql, where every column is just TEXT —
// callers get plain strings and do their own date math/formatting. Postgres's
// driver auto-parses DATE/TIMESTAMP/TIMESTAMPTZ into JS Date objects, which
// then serialize as things like "2026-06-30T18:30:00.000Z" instead of
// "2026-06-30" — breaking chart labels and string-based date logic throughout
// the app. Disable that parsing globally so those types come back as the raw
// string Postgres would otherwise print, matching the old behavior exactly.
types.setTypeParser(1082, (v) => v); // DATE
types.setTypeParser(1114, (v) => v); // TIMESTAMP WITHOUT TIME ZONE
types.setTypeParser(1184, (v) => v); // TIMESTAMPTZ

// Postgres returns COUNT(*)/COUNT(DISTINCT ...) as `bigint`, which the driver
// parses as a string by default (safe against precision loss on huge values).
// SQLite always gave these back as plain JS numbers, and the app's charts/math
// assume that — a string count silently breaks numeric chart rendering
// (Recharts computes 0-height bars from "197" in some code paths) without
// throwing anywhere. Our counts never approach Number.MAX_SAFE_INTEGER, so
// parsing as a number here is safe and matches the old behavior exactly.
types.setTypeParser(20, (v) => parseInt(v, 10)); // BIGINT / COUNT(*)

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

// The rest of the app was written against SQLite/libsql's `?` positional
// placeholder style. Rather than touch 40+ call sites, this converts `?` to
// Postgres's `$1, $2, ...` at the query layer, in left-to-right order —
// skipping `?` inside single-quoted string literals so it can't misfire.
function toPgSql(sql: string): string {
  let out = "";
  let paramIndex = 0;
  let inString = false;
  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i];
    if (ch === "'") {
      inString = !inString;
      out += ch;
      continue;
    }
    if (ch === "?" && !inString) {
      paramIndex++;
      out += "$" + paramIndex;
      continue;
    }
    out += ch;
  }
  return out;
}

// Statement adapter — mimics the better-sqlite3-style API the app was built
// against (prepare().get/all/run()), backed by node-postgres underneath.
export class Statement {
  constructor(private pool: Pool, private sql: string) {}

  private toArgs(args: unknown[]): unknown[] {
    // Flatten if first arg is array (legacy support)
    if (args.length === 1 && Array.isArray(args[0])) {
      return args[0] as unknown[];
    }
    return args;
  }

  async get<T = Record<string, unknown>>(...args: unknown[]): Promise<T | undefined> {
    const r = await this.pool.query(toPgSql(this.sql), this.toArgs(args));
    return (r.rows[0] as T) ?? undefined;
  }

  async all<T = Record<string, unknown>>(...args: unknown[]): Promise<T[]> {
    const r = await this.pool.query(toPgSql(this.sql), this.toArgs(args));
    return r.rows as T[];
  }

  async run(...args: unknown[]): Promise<{ changes: number; lastInsertRowid: bigint | undefined }> {
    const r = await this.pool.query(toPgSql(this.sql), this.toArgs(args));
    return {
      changes: r.rowCount ?? 0,
      lastInsertRowid: undefined, // no callers read this; Postgres PKs here are all uuidv4 TEXT
    };
  }
}

// DB adapter — wraps a pg Pool with the same prepare/exec/batch surface the
// rest of the app already calls.
export class DB {
  constructor(public pool: Pool) {}

  prepare(sql: string): Statement {
    return new Statement(this.pool, sql);
  }

  async exec(sql: string): Promise<void> {
    // A bare string with no params uses Postgres's simple query protocol,
    // which runs multiple `;`-separated statements in one round trip.
    await this.pool.query(sql);
  }

  // Run many parameterised statements in one transaction (one connection
  // checkout) — mirrors the old libsql batch(), which sent everything in one
  // network round trip. Consecutive statements sharing identical SQL (the only
  // real caller shape: N rows into the same INSERT) are collapsed into a
  // single multi-row `VALUES (...),(...),...` statement so bulk upserts don't
  // pay per-row network latency. Anything that doesn't fit that exact shape
  // falls back to one round trip per statement (still correct, just slower).
  async batch(stmts: { sql: string; args: unknown[] }[]): Promise<void> {
    if (stmts.length === 0) return;
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      let i = 0;
      while (i < stmts.length) {
        let j = i + 1;
        while (j < stmts.length && stmts[j].sql === stmts[i].sql) j++;
        await this.execRun(client, stmts.slice(i, j));
        i = j;
      }
      await client.query("COMMIT");
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  }

  // Runs a batch of statements that all share identical SQL text as ONE
  // multi-row INSERT when the SQL has the shape `... VALUES (?, ?, ...) ...`
  // with no other `?` outside that single tuple. Otherwise runs them one by
  // one (still correct — just the slow path).
  private async execRun(client: PoolClient, run: { sql: string; args: unknown[] }[]): Promise<void> {
    if (run.length === 1) {
      await client.query(toPgSql(run[0].sql), run[0].args);
      return;
    }

    const sql = run[0].sql;
    const match = /VALUES\s*\(([^)]*)\)/i.exec(sql);
    const prefix = match ? sql.slice(0, match.index) : "";
    const suffix = match ? sql.slice(match.index + match[0].length) : "";
    const colsPerRow = match ? (match[1].match(/\?/g) || []).length : 0;

    if (!match || prefix.includes("?") || suffix.includes("?") || colsPerRow === 0) {
      // Doesn't fit the single-VALUES-tuple shape — fall back to per-row.
      for (const s of run) await client.query(toPgSql(s.sql), s.args);
      return;
    }

    const tuples = run.map((_, r) => {
      const params = Array.from({ length: colsPerRow }, (_, c) => `$${r * colsPerRow + c + 1}`);
      return `(${params.join(",")})`;
    });
    const combinedSql = `${prefix}VALUES ${tuples.join(",")}${suffix}`;
    const combinedArgs = run.flatMap((s) => s.args);
    await client.query(combinedSql, combinedArgs);
  }
}

let cachedDb: DB | null = null;
let initPromise: Promise<DB> | null = null;

async function initDb(): Promise<DB> {
  const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL is not set. Add the Postgres (Neon) connection string to .env.local / Vercel env vars."
    );
  }

  const pool = new Pool({ connectionString, ssl: { rejectUnauthorized: false } });
  const db = new DB(pool);

  // Create tables. TEXT/INTEGER/PRIMARY KEY/UNIQUE/composite keys and partial
  // unique indexes all work unchanged in Postgres.
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

    // variables / client_variables are created directly in their final shape —
    // this is a fresh database, so there's no legacy shape to migrate from.
    `CREATE TABLE IF NOT EXISTS variables (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      client_id TEXT,
      description TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(client_id, name)
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
      org_id TEXT,
      source_client_id TEXT,
      subdomain TEXT,
      last_synced_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`,
    `CREATE INDEX IF NOT EXISTS idx_clients_slug ON clients(slug)`,

    `CREATE TABLE IF NOT EXISTS client_variables (
      id TEXT PRIMARY KEY,
      client_id TEXT NOT NULL,
      bot_template_id TEXT,
      name TEXT NOT NULL,
      value TEXT,
      created_at TEXT NOT NULL,
      is_new INTEGER DEFAULT 0,
      UNIQUE(client_id, bot_template_id, name)
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

    // Tracks the latest Variable Report fetch job per client so the UI can show
    // "fetching in progress" and let the user poll (Sync) without blocking.
    `CREATE TABLE IF NOT EXISTS variable_sync_jobs (
      client_id TEXT PRIMARY KEY,
      from_date TEXT,
      to_date TEXT,
      status TEXT,
      count INTEGER DEFAULT 0,
      error TEXT,
      started_at TEXT,
      finished_at TEXT
    )`,
  ];

  for (const stmt of ddl) {
    await pool.query(stmt);
  }

  // Compatibility shim: the app's insights queries were written against
  // SQLite's strftime('%w'|'%H', timestamp). Postgres has no strftime() at
  // all (so no overload-resolution ambiguity), so this lets those call sites
  // stay unchanged rather than rewriting every query by hand.
  await pool.query(`
    CREATE OR REPLACE FUNCTION strftime(fmt text, ts text) RETURNS text AS $$
      SELECT CASE fmt
        WHEN '%w' THEN EXTRACT(DOW  FROM (ts)::timestamptz)::text
        WHEN '%H' THEN LPAD(EXTRACT(HOUR FROM (ts)::timestamptz)::text, 2, '0')
        ELSE NULL
      END;
    $$ LANGUAGE SQL IMMUTABLE;
  `);

  // Add columns that may post-date an existing table. Postgres supports
  // IF NOT EXISTS on ADD COLUMN directly — no need to swallow errors.
  const addColumn = (sql: string) => pool.query(sql);
  await addColumn("ALTER TABLE journeys ADD COLUMN IF NOT EXISTS tree_id TEXT");
  await addColumn("ALTER TABLE trees ADD COLUMN IF NOT EXISTS client_id TEXT");
  await addColumn("ALTER TABLE app_users ADD COLUMN IF NOT EXISTS client_id TEXT");
  await addColumn("ALTER TABLE events ADD COLUMN IF NOT EXISTS client_id TEXT");
  // Source identity for N8N-ingested events (idempotent upserts)
  await addColumn("ALTER TABLE events ADD COLUMN IF NOT EXISTS source_id TEXT");
  // External tenant identity used to pull data from the source Postgres
  await addColumn("ALTER TABLE clients ADD COLUMN IF NOT EXISTS org_id TEXT");
  await addColumn("ALTER TABLE clients ADD COLUMN IF NOT EXISTS source_client_id TEXT");
  await addColumn("ALTER TABLE clients ADD COLUMN IF NOT EXISTS subdomain TEXT");
  await addColumn("ALTER TABLE clients ADD COLUMN IF NOT EXISTS last_synced_at TEXT");
  // Flag synced variables added in the most recent sync (shown as "New")
  await addColumn("ALTER TABLE client_variables ADD COLUMN IF NOT EXISTS is_new INTEGER DEFAULT 0");
  // Per-user report permissions (JSON array of permission keys, e.g. ["journey_analytics"])
  await addColumn("ALTER TABLE app_users ADD COLUMN IF NOT EXISTS permissions TEXT");

  // One-time backfill: rows predating this column (NULL) keep their current
  // access by granting journey_analytics. New self-signups insert '[]' so they
  // start with no report access until a super admin grants it.
  await pool.query(
    "UPDATE app_users SET permissions = '[\"journey_analytics\"]' WHERE permissions IS NULL"
  );

  await pool.query("CREATE INDEX IF NOT EXISTS idx_journey_tree ON journeys(tree_id)");
  await pool.query("CREATE INDEX IF NOT EXISTS idx_trees_client ON trees(client_id)");
  await pool.query("CREATE INDEX IF NOT EXISTS idx_app_users_client ON app_users(client_id)");
  await pool.query("CREATE INDEX IF NOT EXISTS idx_events_client ON events(client_id)");
  // Dedup ingested rows; partial unique index (NULL source_id rows allowed many)
  await pool.query("CREATE UNIQUE INDEX IF NOT EXISTS idx_events_source ON events(source_id) WHERE source_id IS NOT NULL");
  await pool.query("CREATE INDEX IF NOT EXISTS idx_clients_source ON clients(org_id, source_client_id)");

  // One-time backfill: single-tenant data predates clients. If no clients
  // exist yet but there is tree/event data, fold it all into a default
  // "Emotorad" client so nothing is orphaned.
  const clientCount = Number((await db.prepare("SELECT COUNT(*) as c FROM clients").get<{ c: number }>())!.c);
  if (clientCount === 0) {
    const treeRows = Number((await db.prepare("SELECT COUNT(*) as c FROM trees").get<{ c: number }>())!.c);
    const eventRows = Number((await db.prepare("SELECT COUNT(*) as c FROM events").get<{ c: number }>())!.c);
    if (treeRows > 0 || eventRows > 0) {
      const cid = uuidv4();
      const now = new Date().toISOString();
      await db.prepare("INSERT INTO clients (id, name, slug, created_at, updated_at) VALUES (?, ?, ?, ?, ?)")
        .run(cid, "Emotorad", "emotorad", now, now);
      await db.prepare("UPDATE trees SET client_id = ? WHERE client_id IS NULL").run(cid);
      await db.prepare("UPDATE events SET client_id = ? WHERE client_id IS NULL").run(cid);
      // Existing client admins were implicitly Emotorad; super_admin stays global (null)
      await db.prepare("UPDATE app_users SET client_id = ? WHERE client_id IS NULL AND role != 'super_admin'").run(cid);
    }
  }

  // Seed super_admin from env vars if no users exist yet
  const count = Number((await db.prepare("SELECT COUNT(*) as c FROM app_users").get<{ c: number }>())!.c);
  if (count === 0) {
    const adminUser = process.env.ADMIN_USER || "admin";
    const adminPass = process.env.ADMIN_PASS || "emotorad2024";
    const now = new Date().toISOString();
    await db.prepare(
      `INSERT INTO app_users (id, username, name, role, is_active, password_hash, created_at, updated_at)
       VALUES (?, ?, ?, 'super_admin', 1, ?, ?, ?)`
    ).run(uuidv4(), adminUser, adminUser, hashPassword(adminPass), now, now);
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
