import { v4 as uuidv4 } from "uuid";
import { createClient, Client } from "@libsql/client";
import path from "path";
import fs from "fs";

const url = process.env.TURSO_DATABASE_URL;
const authToken = process.env.TURSO_AUTH_TOKEN;

let client: Client;
if (url && authToken) {
  client = createClient({ url, authToken });
} else {
  const DB_PATH = path.join(process.cwd(), "data", "insights.db");
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  client = createClient({ url: `file:${DB_PATH}` });
}

async function main() {
  await client.execute(`
    CREATE TABLE IF NOT EXISTS events (
      id TEXT PRIMARY KEY,
      userId TEXT NOT NULL,
      journey TEXT NOT NULL,
      step TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      metadata TEXT
    )
  `);
  await client.execute("CREATE INDEX IF NOT EXISTS idx_journey ON events(journey)");
  await client.execute("CREATE INDEX IF NOT EXISTS idx_timestamp ON events(timestamp)");
  await client.execute("CREATE INDEX IF NOT EXISTS idx_user_journey ON events(userId, journey)");

  const JOURNEY_STEPS: Record<string, string[]> = {
    product_enquiry: ["start", "model_selected", "specs_viewed", "price_checked", "enquiry_submitted"],
    test_ride: ["start", "city_selected", "dealer_selected", "date_picked", "confirmed"],
    support: ["start", "issue_type", "description_given", "ticket_created", "resolved"],
    dealer_locator: ["start", "city_entered", "dealers_shown", "dealer_selected"],
    emi_calculator: ["start", "model_selected", "tenure_selected", "result_shown", "apply_clicked"],
  };

  const DROP_WEIGHTS: Record<string, number[]> = {
    product_enquiry: [1, 0.85, 0.7, 0.55, 0.3],
    test_ride:       [1, 0.9, 0.75, 0.6, 0.45],
    support:         [1, 0.95, 0.85, 0.7, 0.5],
    dealer_locator:  [1, 0.9, 0.8, 0.6],
    emi_calculator:  [1, 0.88, 0.72, 0.6, 0.35],
  };

  function randomDate(daysBack: number): Date {
    const now = Date.now();
    const past = now - daysBack * 24 * 60 * 60 * 1000;
    return new Date(past + Math.random() * (now - past));
  }

  const NUM_USERS = 500;
  const batch: Array<{ sql: string; args: (string | null)[] }> = [];

  for (let u = 0; u < NUM_USERS; u++) {
    const userId = uuidv4();
    const journeys = Object.keys(JOURNEY_STEPS);
    const numJourneys = 1 + Math.floor(Math.random() * 3);
    const pickedJourneys = [...journeys].sort(() => 0.5 - Math.random()).slice(0, numJourneys);

    for (const journey of pickedJourneys) {
      const steps = JOURNEY_STEPS[journey];
      const weights = DROP_WEIGHTS[journey];
      const baseDate = randomDate(30);

      for (let s = 0; s < steps.length; s++) {
        if (Math.random() > weights[s]) break;
        const ts = new Date(baseDate.getTime() + s * (30 + Math.random() * 120) * 1000);
        batch.push({
          sql: "INSERT OR IGNORE INTO events (id, userId, journey, step, timestamp, metadata) VALUES (?, ?, ?, ?, ?, ?)",
          args: [uuidv4(), userId, journey, steps[s], ts.toISOString(), null],
        });
      }
    }
  }

  // Execute in chunks of 100
  for (let i = 0; i < batch.length; i += 100) {
    const chunk = batch.slice(i, i + 100);
    await client.batch(chunk, "write");
  }

  console.log(`Seeded ${batch.length} events for ${NUM_USERS} users.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
