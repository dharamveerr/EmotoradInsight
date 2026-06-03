import { v4 as uuidv4 } from "uuid";
import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

const DB_PATH = path.join(process.cwd(), "data", "insights.db");
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
`);

const JOURNEY_STEPS: Record<string, string[]> = {
  product_enquiry: ["start", "model_selected", "specs_viewed", "price_checked", "enquiry_submitted"],
  test_ride: ["start", "city_selected", "dealer_selected", "date_picked", "confirmed"],
  support: ["start", "issue_type", "description_given", "ticket_created", "resolved"],
  dealer_locator: ["start", "city_entered", "dealers_shown", "dealer_selected"],
  emi_calculator: ["start", "model_selected", "tenure_selected", "result_shown", "apply_clicked"],
};

// Drop weights: probability user continues to next step
const DROP_WEIGHTS: Record<string, number[]> = {
  product_enquiry: [1, 0.85, 0.7, 0.55, 0.3],
  test_ride:       [1, 0.9, 0.75, 0.6, 0.45],
  support:         [1, 0.95, 0.85, 0.7, 0.5],
  dealer_locator:  [1, 0.9, 0.8, 0.6],
  emi_calculator:  [1, 0.88, 0.72, 0.6, 0.35],
};

const insert = db.prepare(
  "INSERT OR IGNORE INTO events (id, userId, journey, step, timestamp, metadata) VALUES (?, ?, ?, ?, ?, ?)"
);

const insertMany = db.transaction((rows: Parameters<typeof insert["run"]>[]) => {
  for (const row of rows) insert.run(...row);
});

function randomDate(daysBack: number): Date {
  const now = Date.now();
  const past = now - daysBack * 24 * 60 * 60 * 1000;
  return new Date(past + Math.random() * (now - past));
}

const rows: Parameters<typeof insert["run"]>[] = [];
const NUM_USERS = 500;

for (let u = 0; u < NUM_USERS; u++) {
  const userId = uuidv4();
  const journeys = Object.keys(JOURNEY_STEPS);
  // Each user tries 1-3 journeys
  const numJourneys = 1 + Math.floor(Math.random() * 3);
  const pickedJourneys = [...journeys].sort(() => 0.5 - Math.random()).slice(0, numJourneys);

  for (const journey of pickedJourneys) {
    const steps = JOURNEY_STEPS[journey];
    const weights = DROP_WEIGHTS[journey];
    const baseDate = randomDate(30);

    for (let s = 0; s < steps.length; s++) {
      if (Math.random() > weights[s]) break; // drop off
      const ts = new Date(baseDate.getTime() + s * (30 + Math.random() * 120) * 1000);
      rows.push([uuidv4(), userId, journey, steps[s], ts.toISOString(), null]);
    }
  }
}

insertMany(rows as Parameters<typeof insert["run"]>[]);
console.log(`Seeded ${rows.length} events for ${NUM_USERS} users.`);
db.close();
