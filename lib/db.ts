import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import { v4 as uuidv4 } from "uuid";

const DB_PATH = path.join(process.cwd(), "data", "insights.db");

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

function getDb() {
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");

  db.exec(`
    CREATE TABLE IF NOT EXISTS events (
      id TEXT PRIMARY KEY,
      userId TEXT NOT NULL,
      journey TEXT NOT NULL,
      step TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      metadata TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_journey ON events(journey);
    CREATE INDEX IF NOT EXISTS idx_timestamp ON events(timestamp);
    CREATE INDEX IF NOT EXISTS idx_user_journey ON events(userId, journey);

    CREATE TABLE IF NOT EXISTS otp_requests (
      id TEXT PRIMARY KEY,
      contact TEXT NOT NULL UNIQUE,
      type TEXT NOT NULL,
      code TEXT NOT NULL,
      created_at TEXT NOT NULL,
      verified INTEGER DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_contact ON otp_requests(contact);

    CREATE TABLE IF NOT EXISTS google_users (
      id TEXT PRIMARY KEY,
      google_id TEXT NOT NULL UNIQUE,
      email TEXT NOT NULL,
      name TEXT,
      picture TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_google_id ON google_users(google_id);

    CREATE TABLE IF NOT EXISTS tree_configs (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      structure TEXT NOT NULL,
      status TEXT DEFAULT 'draft',
      published_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_tree_status ON tree_configs(status);

    CREATE TABLE IF NOT EXISTS app_users (
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
    );
    CREATE INDEX IF NOT EXISTS idx_app_users_username ON app_users(username);
    CREATE INDEX IF NOT EXISTS idx_app_users_email ON app_users(email);
    CREATE INDEX IF NOT EXISTS idx_app_users_role ON app_users(role);

    CREATE TABLE IF NOT EXISTS login_sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      identifier TEXT NOT NULL,
      role TEXT,
      action TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      ip_address TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_login_sessions_identifier ON login_sessions(identifier);
    CREATE INDEX IF NOT EXISTS idx_login_sessions_timestamp ON login_sessions(timestamp);

    CREATE TABLE IF NOT EXISTS variables (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      description TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_variables_name ON variables(name);

    CREATE TABLE IF NOT EXISTS journeys (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      structure TEXT NOT NULL,
      status TEXT DEFAULT 'draft',
      published_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_journey_status ON journeys(status);
  `);

  // Seed super_admin from env vars if no users exist yet
  const count = (
    db.prepare("SELECT COUNT(*) as c FROM app_users").get() as { c: number }
  ).c;
  if (count === 0) {
    const adminUser = process.env.ADMIN_USER || "admin";
    const adminPass = process.env.ADMIN_PASS || "emotorad2024";
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO app_users (id, username, name, role, is_active, password_hash, created_at, updated_at)
       VALUES (?, ?, ?, 'super_admin', 1, ?, ?, ?)`
    ).run(uuidv4(), adminUser, adminUser, hashPassword(adminPass), now, now);
  }

  return db;
}

export default getDb;
