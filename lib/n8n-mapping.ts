// Maps rows from the source `chat_log_variable` Postgres table (delivered by
// N8N) into EmotoradInsight `events`.
//
// ⚠️ TUNE THIS when the real `chat_log_variable` schema is confirmed. Every
// field below tries a list of candidate column names and uses the first
// present — so it tolerates several likely shapes until the exact one is known.
// Adjust the candidate arrays (or hardcode the real column) once known.

export type SourceRow = Record<string, unknown>;

export type MappedEvent = {
  userId: string;
  journey: string;
  step: string;
  timestamp: string; // ISO 8601
  metadata: Record<string, string>;
  sourceId: string;
};

// Candidate source columns per target field (first non-empty wins).
const FIELDS = {
  rowId:       ["id", "uuid", "row_id", "log_id"],
  userId:      ["user_id", "phone", "phone_number", "wa_id", "contact", "contact_number", "session_id", "conversation_id"],
  journey:     ["journey", "journey_name", "flow", "flow_name", "workflow", "workflow_name"],
  step:        ["step", "step_name", "node", "node_name", "state", "stage"],
  timestamp:   ["created_at", "createdAt", "timestamp", "time", "logged_at"],
  varName:     ["variable_name", "var_name", "key", "name"],
  varValue:    ["variable_value", "var_value", "value", "val"],
  // If the source already packs all vars into one JSON column:
  variablesJson: ["variables", "metadata", "data", "payload"],
} as const;

const IDENTITY_COLS = new Set<string>([
  ...FIELDS.rowId, ...FIELDS.userId, ...FIELDS.journey, ...FIELDS.step,
  ...FIELDS.timestamp, ...FIELDS.varName, ...FIELDS.varValue, ...FIELDS.variablesJson,
  "org_id", "client_id", "source_client_id",
]);

function pick(row: SourceRow, candidates: readonly string[]): string | undefined {
  for (const c of candidates) {
    const v = row[c];
    if (v !== undefined && v !== null && String(v).trim() !== "") return String(v);
  }
  return undefined;
}

function toIso(v: string | undefined): string {
  if (!v) return new Date().toISOString();
  const d = new Date(v);
  return isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}

// Ensure variable keys carry the project's "@" convention.
function normVarName(name: string): string {
  const t = name.trim();
  return t.startsWith("@") ? t : `@${t}`;
}

// Pull the variable(s) a single source row contributes.
function extractVars(row: SourceRow): Record<string, string> {
  const out: Record<string, string> = {};
  // Long format: one variable per row
  const vn = pick(row, FIELDS.varName);
  const vv = pick(row, FIELDS.varValue);
  if (vn) { out[normVarName(vn)] = vv ?? ""; return out; }
  // JSON column holding many vars
  const json = pick(row, FIELDS.variablesJson);
  if (json) {
    try {
      const obj = typeof json === "string" ? JSON.parse(json) : json;
      if (obj && typeof obj === "object") {
        for (const [k, val] of Object.entries(obj)) out[normVarName(k)] = val == null ? "" : String(val);
        return out;
      }
    } catch { /* not JSON — fall through */ }
  }
  // Catch-all: any non-identity column becomes a variable
  for (const [k, val] of Object.entries(row)) {
    if (!IDENTITY_COLS.has(k) && val != null && String(val).trim() !== "") {
      out[normVarName(k)] = String(val);
    }
  }
  return out;
}

/**
 * Group source rows into events. Rows sharing (userId, journey, step,
 * timestamp) are merged into a single event whose metadata combines all their
 * variables. Returns events + any rows that couldn't be mapped (missing keys).
 */
export function mapRows(rows: SourceRow[]): { events: MappedEvent[]; skipped: number } {
  const groups = new Map<string, MappedEvent>();
  let skipped = 0;

  for (const row of rows) {
    const userId = pick(row, FIELDS.userId);
    const journey = pick(row, FIELDS.journey) || "unknown";
    const step = pick(row, FIELDS.step) || journey;
    const ts = toIso(pick(row, FIELDS.timestamp));
    if (!userId) { skipped++; continue; }

    // Group key: same user at same step+time = one event. Time included so a
    // user re-entering the same step later is a distinct event.
    const key = `${userId}::${journey}::${step}::${ts}`;
    const vars = extractVars(row);

    const existing = groups.get(key);
    if (existing) {
      Object.assign(existing.metadata, vars);
    } else {
      groups.set(key, { userId, journey, step, timestamp: ts, metadata: vars, sourceId: key });
    }
  }

  return { events: [...groups.values()], skipped };
}
