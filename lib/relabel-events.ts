import getDb from "@/lib/db";
import { getVariableStepMap, getJourneyConfig } from "@/lib/journey-config";

/**
 * Relabels events for a client whose journey/step fields were stored as raw
 * chatbot UUIDs (bot_template_id / chat_flow_node_id) rather than the
 * published tree's friendly journey key and step name.
 *
 * Derives the mapping via client_variables (each variable knows which
 * bot_template_id it came from) cross-referenced with the published tree's
 * variable-step map. Events whose metadata contains a variable that belongs
 * to a specific step get relabeled to that step; all others fall back to the
 * journey's first step.
 */
export async function relabelEventsForClient(
  clientId: string
): Promise<{ updated: number }> {
  const db = await getDb();

  // What variables belong to which (journey, step) in the published tree?
  const varStepMap = await getVariableStepMap(clientId);
  if (Object.keys(varStepMap).length === 0) return { updated: 0 };

  // Which bot_template_id does each variable come from?
  const cvRows = await db
    .prepare(
      "SELECT DISTINCT name, bot_template_id FROM client_variables WHERE client_id = ? AND bot_template_id IS NOT NULL"
    )
    .all<{ name: string; bot_template_id: string }>(clientId);

  if (cvRows.length === 0) return { updated: 0 };

  // Build: bot_template_id → journey_key (first matching variable wins)
  const tplToJourney = new Map<string, string>();
  for (const cv of cvRows) {
    if (tplToJourney.has(cv.bot_template_id)) continue;
    const info = varStepMap[cv.name];
    if (info) tplToJourney.set(cv.bot_template_id, info.journey);
  }

  // Fallback: if no variable in client_variables matched the tree, map all
  // bot_template_ids to the first published journey.
  if (tplToJourney.size === 0) {
    const { steps } = await getJourneyConfig();
    const fallbackJourney = Object.keys(steps)[0];
    if (!fallbackJourney) return { updated: 0 };
    const seen = new Set<string>();
    for (const cv of cvRows) {
      if (!seen.has(cv.bot_template_id)) {
        tplToJourney.set(cv.bot_template_id, fallbackJourney);
        seen.add(cv.bot_template_id);
      }
    }
  }

  // Group variables by journey → step for CASE expression construction.
  // journeyStepVars: { journeyKey → { stepName → varName[] } }
  const journeyStepVars: Record<string, Record<string, string[]>> = {};
  for (const [varName, info] of Object.entries(varStepMap)) {
    if (!journeyStepVars[info.journey]) journeyStepVars[info.journey] = {};
    if (!journeyStepVars[info.journey][info.step])
      journeyStepVars[info.journey][info.step] = [];
    journeyStepVars[info.journey][info.step].push(varName);
  }

  const { steps: JOURNEY_STEPS } = await getJourneyConfig();
  let totalUpdated = 0;

  for (const [tplId, journeyKey] of tplToJourney.entries()) {
    const stepVarGroups = journeyStepVars[journeyKey] ?? {};
    const stepEntries = Object.entries(stepVarGroups); // [[stepName, [var1, …]], …]
    const defaultStep =
      JOURNEY_STEPS[journeyKey]?.[0] ??
      stepEntries[0]?.[0] ??
      journeyKey;

    // Escape single quotes for safe embedding in SQL string literals.
    const esc = (s: string) => s.replace(/'/g, "''");

    let stepExpr: string;
    if (stepEntries.length <= 1) {
      // Single (or zero) step: every event maps to the same step.
      stepExpr = `'${esc(defaultStep)}'`;
    } else {
      // Multiple steps: derive from metadata variable presence.
      // Uses (metadata::jsonb -> '@key') IS NOT NULL instead of the `?`
      // operator to avoid conflicts with the db adapter's `?` placeholder.
      const cases = stepEntries
        .map(([stepName, vars]) => {
          const checks = vars
            .map((v) => `(metadata::jsonb -> '${esc(v)}') IS NOT NULL`)
            .join(" OR ");
          return `WHEN (${checks}) THEN '${esc(stepName)}'`;
        })
        .join(" ");
      stepExpr = `CASE ${cases} ELSE '${esc(defaultStep)}' END`;
    }

    const sql = `
      UPDATE events
      SET journey = ?, step = ${stepExpr}
      WHERE client_id = ? AND journey = ?
    `;
    const result = await db.prepare(sql).run(journeyKey, clientId, tplId);
    totalUpdated += result.changes ?? 0;
  }

  return { updated: totalUpdated };
}

/**
 * Reconciles event step labels against what each event's metadata actually
 * contains, for every journey in the published tree — not a one-off fix for
 * a single journey. Two passes, applied per journey:
 *
 *  1. Reassign: an event tagged with the wrong step gets moved to whichever
 *     step actually owns the one variable its metadata holds (e.g. an event
 *     mislabeled "Intake" that carries `@budget` moves to "Budget"). Guarded
 *     by purity — the event must not also carry another step's variable, so
 *     genuinely ambiguous events are left alone.
 *  2. Revert false positives: an event tagged with a step's name but whose
 *     metadata does NOT contain that step's variable at all (e.g. a bot
 *     "menu render" event carrying a scattered dump of many steps' option
 *     labels, not a real single answer) is moved back to the journey's
 *     default first step, so it stops inflating that step's count.
 *
 * Safe to re-run — each pass only touches events that still disagree with
 * their metadata, so a clean dataset sees zero changes.
 */
export async function reconcileEventSteps(
  clientId: string
): Promise<{ reassigned: number; reverted: number }> {
  const db = await getDb();
  const varStepMap = await getVariableStepMap(clientId);
  const { steps: JOURNEY_STEPS } = await getJourneyConfig();

  const esc = (s: string) => s.replace(/'/g, "''");

  // Group owned variables by journey → step, same shape as relabelEventsForClient.
  const journeyStepVars: Record<string, Record<string, string[]>> = {};
  for (const [varName, info] of Object.entries(varStepMap)) {
    if (!journeyStepVars[info.journey]) journeyStepVars[info.journey] = {};
    if (!journeyStepVars[info.journey][info.step]) journeyStepVars[info.journey][info.step] = [];
    journeyStepVars[info.journey][info.step].push(varName);
  }

  let reassigned = 0;
  let reverted = 0;

  for (const [journeyKey, stepVarGroups] of Object.entries(journeyStepVars)) {
    const stepEntries = Object.entries(stepVarGroups).filter(([, vars]) => vars.length > 0);
    if (stepEntries.length === 0) continue;

    const defaultStep = JOURNEY_STEPS[journeyKey]?.[0] ?? stepEntries[0][0];
    const hasVar = (v: string) => `(metadata::jsonb -> '${esc(v)}') IS NOT NULL`;

    // Pass 1 — reassign pure single-step events to their real owning step,
    // regardless of current (possibly wrong) label.
    for (const [step, vars] of stepEntries) {
      const otherVars = stepEntries.filter(([s]) => s !== step).flatMap(([, v]) => v);
      const ownVarCheck = vars.map(hasVar).join(" OR ");
      const otherVarCheck = otherVars.length ? otherVars.map(hasVar).join(" OR ") : "FALSE";
      const sql = `
        UPDATE events SET step = ?
        WHERE client_id = ? AND journey = ? AND step != ?
          AND (${ownVarCheck})
          AND NOT (${otherVarCheck})
      `;
      const result = await db.prepare(sql).run(step, clientId, journeyKey, step);
      reassigned += result.changes ?? 0;
    }

    // Pass 2 — revert events tagged with a step name but missing that step's
    // defining variable entirely (bot config/menu dumps, not real answers).
    for (const [step, vars] of stepEntries) {
      if (step === defaultStep) continue;
      const ownVarCheck = vars.map(hasVar).join(" OR ");
      const sql = `
        UPDATE events SET step = ?
        WHERE client_id = ? AND journey = ? AND step = ?
          AND NOT (${ownVarCheck})
      `;
      const result = await db.prepare(sql).run(defaultStep, clientId, journeyKey, step);
      reverted += result.changes ?? 0;
    }
  }

  return { reassigned, reverted };
}
