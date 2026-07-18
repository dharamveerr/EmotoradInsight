import getDb from "@/lib/db";
import { journeyKeyFromName } from "@/lib/journey-config";
import type { JourneyStep } from "@/lib/types";

// Standard journey attribution: every journey's data is derived ONLY from its
// own tree definition — a user counts at a step when their captured metadata
// contains one of that step's configured variables. events.journey/step tags
// are irrelevant here, so any journey (new, renamed, copied) reports data
// from its own structure with identical logic to every other journey.
export type TreeStep = { name: string; vars: string[]; optionLabels: Map<string, string> };
export type TreeJourney = { key: string; name: string; steps: TreeStep[] };

export async function loadTreeJourneys(
  db: Awaited<ReturnType<typeof getDb>>,
  clientId: string | null
): Promise<TreeJourney[]> {
  if (!clientId) return [];
  const tree = await db
    .prepare("SELECT id FROM trees WHERE status = 'published' AND client_id = ? LIMIT 1")
    .get<{ id: string }>(clientId);
  if (!tree) return [];
  const rows = await db
    .prepare("SELECT name, structure FROM journeys WHERE tree_id = ? ORDER BY created_at ASC")
    .all<{ name: string; structure: string }>(tree.id);
  return rows.map((r) => {
    let parsed: { steps?: JourneyStep[] } = {};
    try { parsed = JSON.parse(r.structure); } catch { /* empty journey */ }
    const steps: TreeStep[] = [];
    const walk = (list: JourneyStep[]) => {
      for (const s of list) {
        if (s.name?.trim()) {
          const vars = new Set<string>();
          const optionLabels = new Map<string, string>();
          for (const o of s.options || []) {
            if (o.storesInVariable) vars.add(o.storesInVariable);
            for (const v of o.storesInVariables || []) vars.add(v);
            if (o.label?.trim()) optionLabels.set(o.label.trim().toLowerCase(), o.label.trim());
          }
          steps.push({ name: s.name.trim(), vars: [...vars], optionLabels });
        }
        if (s.children?.length) walk(s.children);
      }
    };
    walk(parsed.steps || []);
    return { key: journeyKeyFromName(r.name), name: r.name, steps };
  });
}

export type ParsedEvent = { userId: string; meta: Record<string, string> };

// Users at a step = distinct userIds whose metadata holds any of the step's
// variables (with a non-empty value). One user counts once.
export function usersAtStep(events: ParsedEvent[], step: TreeStep): Set<string> {
  const set = new Set<string>();
  if (step.vars.length === 0) return set;
  for (const e of events) {
    for (const v of step.vars) {
      const val = e.meta[v];
      if (val !== undefined && val !== null && String(val).trim() !== "") {
        set.add(e.userId);
        break;
      }
    }
  }
  return set;
}

// For every journey in the published tree, walk its steps in order and
// intersect each step's user set with the running (rolling) set from every
// prior step — the same sequential-funnel logic as the Funnel chart. Returns
// variable name → allowed user set, so a step's variable can never report a
// user who didn't also complete every step before it. A step's count can
// therefore never exceed its predecessor's.
export async function computeVariableAllowedUsers(
  db: Awaited<ReturnType<typeof getDb>>,
  clientId: string | null,
  events: ParsedEvent[]
): Promise<Map<string, Set<string>>> {
  const journeys = await loadTreeJourneys(db, clientId);
  const allowed = new Map<string, Set<string>>();
  for (const tj of journeys) {
    let rolling: Set<string> = new Set();
    let first = true;
    for (const step of tj.steps) {
      if (step.vars.length === 0) continue;
      const stepSet = usersAtStep(events, step);
      rolling = first ? stepSet : new Set([...rolling].filter((u) => stepSet.has(u)));
      first = false;
      for (const v of step.vars) {
        // A variable name should belong to one step, but if it's reused,
        // union the allowed sets rather than overwrite.
        const existing = allowed.get(v);
        if (existing) { for (const u of rolling) existing.add(u); }
        else allowed.set(v, new Set(rolling));
      }
    }
  }
  return allowed;
}
