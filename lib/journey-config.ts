import getDb from "@/lib/db";
import { JOURNEY_LABELS, JOURNEY_STEPS, JourneyStep } from "@/lib/types";
import { getActiveClientId } from "@/lib/client-context";

export type JourneyConfig = {
  /** journey key → display label */
  labels: Record<string, string>;
  /** journey key → ordered step names */
  steps: Record<string, string[]>;
  /** id/name of the published tree, null when falling back to static config */
  tree: { id: string; name: string } | null;
};

// Events in the DB are keyed by these canonical journey keys. Journeys whose
// display name matches map onto the same keys so existing event data lines up.
const NAME_TO_KEY: Record<string, string> = Object.fromEntries(
  Object.entries(JOURNEY_LABELS).map(([key, label]) => [label.toLowerCase(), key])
);

export function journeyKeyFromName(name: string): string {
  const known = NAME_TO_KEY[name.trim().toLowerCase()];
  if (known) return known;
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function flattenSteps(steps: JourneyStep[]): string[] {
  const out: string[] = [];
  const walk = (list: JourneyStep[]) => {
    for (const s of list) {
      if (s.name?.trim()) out.push(s.name.trim());
      if (s.children?.length) walk(s.children);
    }
  };
  walk(steps);
  return out;
}

/**
 * Resolves the journey config that drives all analytics. If a tree is
 * published, its journeys define the labels and step funnels; otherwise the
 * hardcoded Emotorad config is used.
 */
export async function getJourneyConfig(): Promise<JourneyConfig> {
  const db = await getDb();

  const clientId = await getActiveClientId();
  if (!clientId) {
    return { labels: { ...JOURNEY_LABELS }, steps: { ...JOURNEY_STEPS }, tree: null };
  }

  const tree = await db
    .prepare("SELECT id, name FROM trees WHERE status = 'published' AND client_id = ? LIMIT 1")
    .get<{ id: string; name: string }>(clientId);

  if (!tree) {
    return { labels: { ...JOURNEY_LABELS }, steps: { ...JOURNEY_STEPS }, tree: null };
  }

  const journeys = await db
    .prepare("SELECT name, structure FROM journeys WHERE tree_id = ? ORDER BY created_at ASC")
    .all<{ name: string; structure: string }>(tree.id);

  const labels: Record<string, string> = {};
  const steps: Record<string, string[]> = {};

  for (const j of journeys) {
    const key = journeyKeyFromName(j.name);
    labels[key] = j.name;
    let parsed: { steps?: JourneyStep[] } = {};
    try {
      parsed = JSON.parse(j.structure);
    } catch {
      // malformed structure — journey appears with no steps
    }
    const flat = flattenSteps(parsed.steps || []);
    // Funnel = the journey's own steps exactly. Only fall back to the journey
    // name when the journey has no steps defined (avoids an extra phantom step).
    steps[key] = flat.length ? flat : [j.name];
  }

  // Published tree with zero journeys would blank the dashboard — fall back
  if (Object.keys(labels).length === 0) {
    return { labels: { ...JOURNEY_LABELS }, steps: { ...JOURNEY_STEPS }, tree: null };
  }

  return { labels, steps, tree };
}
