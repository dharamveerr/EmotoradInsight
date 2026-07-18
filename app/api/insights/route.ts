import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import getDb from "@/lib/db";
import { getJourneyConfig, journeyKeyFromName } from "@/lib/journey-config";
import { getActiveClientId } from "@/lib/client-context";
import { ensureHydrated } from "@/lib/source-fetch";
import { denyIfNoReports } from "@/lib/permissions";
import type { JourneyStep } from "@/lib/types";

// Helper: returns SQL clause + params for optional date range filtering
function df(from: string, to: string) {
  return from && to
    ? { clause: "AND (timestamp)::date BETWEEN ?::date AND ?::date", p: [from, to] as string[] }
    : { clause: "", p: [] as string[] };
}

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const denied = await denyIfNoReports(req);
  if (denied) return denied;

  const { searchParams } = new URL(req.url);
  const type    = searchParams.get("type")    || "overview";
  const journey = searchParams.get("journey") || "";
  const from    = searchParams.get("from")    || "";
  const to      = searchParams.get("to")      || "";

  // Lazily pull this range from the source (via N8N) before reading local events.
  // Default range = current date. No-op when sync isn't configured.
  await ensureHydrated(from, to);

  const db = await getDb();
  const { clause: dc, p: dp } = df(from, to);
  // Journey labels/steps come from the active client's published tree (static fallback)
  const { steps: JOURNEY_STEPS } = await getJourneyConfig();

  // Every events query is scoped to the active client's data.
  const clientId = await getActiveClientId();
  const cf = clientId ? " AND client_id = ?" : "";
  const cp: string[] = clientId ? [clientId] : [];

  // Aggregate queries that don't target one journey are restricted to the
  // published tree's journeys, so non-published data never appears in reports.
  const journeyKeys = Object.keys(JOURNEY_STEPS);
  const js = journeyKeys.length ? ` AND journey IN (${journeyKeys.map(() => "?").join(",")})` : "";
  const jp: string[] = journeyKeys.length ? journeyKeys : [];

  // ── Standard journey attribution ──────────────────────────────────────
  // Every journey is fully independent: its data is derived ONLY from its own
  // tree definition. A user counts at a step when their captured metadata
  // contains one of that step's configured variables — the events.journey /
  // events.step tags are irrelevant here, so a newly created or copied
  // journey immediately reports data per its own structure, with the exact
  // same logic as every other journey.
  type TreeStep = { name: string; vars: string[]; optionLabels: Map<string, string> };
  type TreeJourney = { key: string; name: string; steps: TreeStep[] };

  const loadTreeJourneys = async (): Promise<TreeJourney[]> => {
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
  };

  // All of the client's events in range, parsed once and shared by every
  // journey computation. metadata drives attribution, so parse it up front;
  // date/hour ride along so journey-scoped trends don't need tag filters.
  type ParsedEvent = { userId: string; meta: Record<string, string>; date: string; hour: number };
  let cachedEvents: ParsedEvent[] | null = null;
  const loadClientEvents = async (): Promise<ParsedEvent[]> => {
    if (cachedEvents) return cachedEvents;
    const rows = await db
      .prepare(`SELECT userId AS "userId", metadata, (timestamp)::date::text AS date, EXTRACT(HOUR FROM (timestamp)::timestamp)::int AS hour FROM events WHERE 1=1 ${dc}${cf}`)
      .all<{ userId: string; metadata: string | null; date: string; hour: number }>(...dp, ...cp);
    const out: ParsedEvent[] = [];
    for (const r of rows) {
      if (!r.metadata) continue;
      try {
        const meta = JSON.parse(r.metadata) as Record<string, string>;
        out.push({ userId: r.userId, meta, date: r.date, hour: Number(r.hour) });
      } catch { /* skip malformed */ }
    }
    cachedEvents = out;
    return out;
  };

  // Users at a step = distinct userIds whose metadata holds any of the step's
  // variables (with a non-empty value). One user counts once.
  const usersAtStep = (events: ParsedEvent[], step: TreeStep): Set<string> => {
    const set = new Set<string>();
    if (step.vars.length === 0) return set;
    for (const e of events) {
      for (const v of step.vars) {
        const val = e.meta[v];
        if (val !== undefined && val !== null && String(val).trim() !== "") { set.add(e.userId); break; }
      }
    }
    return set;
  };

  // No published tree → return empty/zero for report types that need a
  // journey/step funnel to mean anything. Overview is exempt: its top-line
  // numbers (unique users, daily trend) come straight from raw events via
  // the fetched variable report and don't depend on a published tree —
  // only its journey-funnel cards do, and those already zero out naturally
  // when JOURNEY_STEPS is empty (see below).
  if (journeyKeys.length === 0 && !journey) {
    if (type === "funnel") return NextResponse.json({ funnel: [] });
    if (type === "heatmap") return NextResponse.json({ heatmap: [] });
    if (type === "dropoff") return NextResponse.json({ dropoff: [], journey: "all" });
    if (type === "product-analytics") return NextResponse.json({ funnel: [], byDate: [], byHour: [], productDistribution: [], priceDistribution: [], kpis: { uniqueUsers: 0, totalCount: 0, started: 0, completed: 0, dropped: 0 } });
    if (type === "option-breakdown") return NextResponse.json({ steps: [] });
  }

  // ── OVERVIEW ──────────────────────────────────────────────────────────
  if (type === "overview") {
    // dc/dp are already set from df(from, to) above:
    //   • from+to present → filter by that range
    //   • both empty      → no date clause → all-time data (previous behaviour)
    const activeJourneys = { c: journeyKeys.length };

    // Count ALL distinct users for the client — no journey filter — so this
    // matches what the Variable Report shows (all users who interacted with the bot).
    const totalReach = (await db
      .prepare(`SELECT COUNT(DISTINCT userId) as c FROM events WHERE 1=1 ${dc}${cf}`)
      .get<{ c: number }>(...dp, ...cp))!;

    // Per-journey funnel: each journey computes independently from its OWN
    // tree definition (step variables in metadata) — no events.journey tag,
    // so every journey, including freshly created ones, uses the exact same
    // logic. Sequential: step N's count only includes users who also hit
    // every step before it. entries = step 1, completed = final step.
    const treeJourneys = await loadTreeJourneys();
    const allEvents = treeJourneys.length ? await loadClientEvents() : [];
    const journeyBreakdown = treeJourneys.map((tj) => {
      if (tj.steps.length === 0) return { journey: tj.key, entries: 0, completed: 0, conversionRate: 0 };
      let rolling: Set<string> = new Set();
      let entries = 0;
      let completed = 0;
      for (let i = 0; i < tj.steps.length; i++) {
        const stepSet = usersAtStep(allEvents, tj.steps[i]);
        rolling = i === 0 ? stepSet : new Set([...rolling].filter((u) => stepSet.has(u)));
        if (i === 0) entries = rolling.size;
        if (i === tj.steps.length - 1) completed = rolling.size;
      }
      const conversionRate = entries > 0 ? Math.round((completed / entries) * 100) : 0;
      return { journey: tj.key, entries, completed, conversionRate };
    });
    const totalUsers     = journeyBreakdown.reduce((s, r) => s + r.entries, 0);
    const totalCompleted = journeyBreakdown.reduce((s, r) => s + r.completed, 0);
    const completionRate = totalUsers > 0 ? Math.round((totalCompleted / totalUsers) * 100) : 0;

    const last7Days = await db
      .prepare(`SELECT (timestamp)::date as date, COUNT(DISTINCT userId || journey) as count FROM events WHERE 1=1 ${dc}${cf} GROUP BY (timestamp)::date ORDER BY date`)
      .all<{ date: string; count: number }>(...dp, ...cp);

    const journeyDist = await db
      .prepare(`SELECT journey, COUNT(DISTINCT userId) as count FROM events WHERE 1=1 ${dc}${cf} GROUP BY journey ORDER BY count DESC`)
      .all<{ journey: string; count: number }>(...dp, ...cp);

    return NextResponse.json({ todaySessions: Number(totalReach.c), activeJourneys: Number(activeJourneys.c), completionRate, dropoffRate: 100 - completionRate, last7Days, journeyDist, journeyBreakdown });
  }

  // ── FUNNEL ────────────────────────────────────────────────────────────
  // Per-step user counts derived from each journey's own tree definition
  // (step variables present in metadata) — the same standard logic for every
  // journey, so a new/copied journey reports data immediately. Steps with no
  // matching users still appear as 0-count bars instead of vanishing.
  if (type === "funnel") {
    const treeJourneys = await loadTreeJourneys();
    const targets = journey ? treeJourneys.filter((tj) => tj.key === journey) : treeJourneys;
    if (targets.length === 0) return NextResponse.json({ funnel: [] });
    const allEvents = await loadClientEvents();

    // Each journey computes its own rolling (sequential-intersection) user set
    // per step first — same logic as OVERVIEW — so a step's users are always a
    // subset of every prior step's users WITHIN that journey.
    //
    // A step name can only be safely merged across journeys when every journey
    // that owns it reaches it via the SAME predecessor chain (e.g. two clones
    // of the same journey). If two journeys reach a same-named step through
    // different predecessors (e.g. "Budget" following "Country" in one journey
    // but "MBBS Country" in another), unioning them would make that step's
    // count exceed either predecessor alone — so instead each journey's
    // occurrence gets its own row, labelled with the journey name to
    // disambiguate. This guarantees every row's count is a subset of the row
    // directly above it, for every journey, without fabricating false merges.
    const predecessorChainByName = new Map<string, string>(); // step name -> chain signature
    for (const tj of targets) {
      let chain = "";
      for (const step of tj.steps) {
        const existing = predecessorChainByName.get(step.name);
        if (existing === undefined) predecessorChainByName.set(step.name, chain);
        else if (existing !== chain) predecessorChainByName.set(step.name, "__AMBIGUOUS__");
        chain = chain ? `${chain}>${step.name}` : step.name;
      }
    }

    const stepUserSets = new Map<string, Set<string>>();
    const stepOrder: string[] = [];
    for (const tj of targets) {
      let rolling: Set<string> = new Set();
      let first = true;
      for (const step of tj.steps) {
        const stepSet = usersAtStep(allEvents, step);
        rolling = first ? stepSet : new Set([...rolling].filter((u) => stepSet.has(u)));
        first = false;
        const ambiguous = predecessorChainByName.get(step.name) === "__AMBIGUOUS__" && targets.length > 1;
        const label = ambiguous ? `${step.name} (${tj.name})` : step.name;
        if (!stepUserSets.has(label)) {
          stepUserSets.set(label, new Set());
          stepOrder.push(label);
        }
        const merged = stepUserSets.get(label)!;
        for (const u of rolling) merged.add(u);
      }
    }
    const funnel = stepOrder.map((name) => ({ step: name, count: stepUserSets.get(name)!.size }));
    return NextResponse.json({ funnel });
  }

  // ── HEATMAP ───────────────────────────────────────────────────────────
  if (type === "heatmap") {
    const whereParts: string[] = [];
    const params: (string | number)[] = [];
    if (journey) { whereParts.push("journey = ?"); params.push(journey); }
    else if (journeyKeys.length) { whereParts.push(`journey IN (${journeyKeys.map(() => "?").join(",")})`); params.push(...journeyKeys); }
    if (from && to) { whereParts.push("(timestamp)::date BETWEEN ?::date AND ?::date"); params.push(from, to); }
    if (clientId) { whereParts.push("client_id = ?"); params.push(clientId); }
    const where = whereParts.length ? "WHERE " + whereParts.join(" AND ") : "";

    const rows = await db
      .prepare(`SELECT CAST(strftime('%w', timestamp) AS INTEGER) as day, CAST(strftime('%H', timestamp) AS INTEGER) as hour, COUNT(*) as count FROM events ${where} GROUP BY day, hour`)
      .all<{ day: number; hour: number; count: number }>(...params);
    return NextResponse.json({ heatmap: rows });
  }

  // ── DROPOFF ───────────────────────────────────────────────────────────
  if (type === "dropoff") {
    if (!journey) {
      const rows = await db
        .prepare(`SELECT step, COUNT(DISTINCT userId) as entered FROM events WHERE 1=1 ${dc}${cf}${js} GROUP BY step ORDER BY entered DESC LIMIT 20`)
        .all<{ step: string; entered: number }>(...dp, ...cp, ...jp);
      const dropoff = rows.map((row, i) => {
        const nextEntered = rows[i + 1]?.entered ?? 0;
        const exited  = Math.max(0, Number(row.entered) - Number(nextEntered));
        const dropRate = Number(row.entered) > 0 ? Math.round((exited / Number(row.entered)) * 100) : 0;
        return { step: row.step, entered: Number(row.entered), exited, dropRate };
      });
      return NextResponse.json({ dropoff, journey: "all" });
    }

    const steps = JOURNEY_STEPS[journey] || [];
    const dropoff = await Promise.all(
      steps.map(async (step, i) => {
        const entered  = (await db.prepare(`SELECT COUNT(DISTINCT userId) as c FROM events WHERE journey = ? AND step = ? ${dc}${cf}`).get<{ c: number }>(journey, step, ...dp, ...cp))!;
        const nextStep = steps[i + 1];
        const nextCount = nextStep
          ? Number(((await db.prepare(`SELECT COUNT(DISTINCT userId) as c FROM events WHERE journey = ? AND step = ? ${dc}${cf}`).get<{ c: number }>(journey, nextStep, ...dp, ...cp))!).c)
          : 0;
        const enteredC = Number(entered.c);
        const exited   = enteredC - nextCount;
        const dropRate = enteredC > 0 ? Math.round((exited / enteredC) * 100) : 0;
        return { step, entered: enteredC, exited: exited > 0 ? exited : 0, dropRate };
      })
    );
    return NextResponse.json({ dropoff, journey });
  }

  // ── PRODUCT-ANALYTICS ─────────────────────────────────────────────────
  // Same standard journey attribution as overview/funnel: everything is
  // derived from the tree definition + metadata variables, never from the
  // events.journey/step tags — so every journey behaves identically.
  if (type === "product-analytics") {
    const allJourneys   = !journey;
    const targetJourney = journey || "";

    const treeJourneys = await loadTreeJourneys();
    const targets = allJourneys ? treeJourneys : treeJourneys.filter((tj) => tj.key === targetJourney);
    const allEvents = targets.length ? await loadClientEvents() : [];

    // Funnel: per unique step name, users whose metadata holds that step's vars.
    const seenSteps = new Set<string>();
    const funnel: { step: string; count: number }[] = [];
    for (const tj of targets) {
      for (const step of tj.steps) {
        if (seenSteps.has(step.name)) continue;
        seenSteps.add(step.name);
        funnel.push({ step: step.name, count: usersAtStep(allEvents, step).size });
      }
    }

    // Scope: users attributed to the selected journey(s) — anyone whose
    // metadata matches any step of any target journey.
    const scopeUsers = new Set<string>();
    for (const tj of targets) {
      for (const step of tj.steps) {
        for (const u of usersAtStep(allEvents, step)) scopeUsers.add(u);
      }
    }

    // By date / by hour: distinct scoped users per bucket, computed in JS
    // from the shared event cache (no journey-tag SQL filter).
    const dateUsers: Record<string, Set<string>> = {};
    const hourUsers: Record<number, Set<string>> = {};
    for (const e of allEvents) {
      if (!scopeUsers.has(e.userId)) continue;
      (dateUsers[e.date] ||= new Set()).add(e.userId);
      (hourUsers[e.hour] ||= new Set()).add(e.userId);
    }
    const byDate = Object.entries(dateUsers)
      .map(([date, users]) => ({ date, count: users.size }))
      .sort((a, b) => a.date.localeCompare(b.date));
    const byHour = Object.entries(hourUsers)
      .map(([hour, users]) => ({ hour: Number(hour), count: users.size }))
      .sort((a, b) => a.hour - b.hour);

    // Product distribution
    const productRows = allJourneys
      ? await db.prepare(`SELECT metadata FROM events WHERE step = 'product_type_selected' ${dc}${cf}`).all<{ metadata: string | null }>(...dp, ...cp)
      : await db.prepare(`SELECT metadata FROM events WHERE journey = ? AND step = 'product_type_selected' ${dc}${cf}`).all<{ metadata: string | null }>(targetJourney, ...dp, ...cp);

    const productCounts: Record<string, number> = {};
    productRows.forEach((row) => {
      if (row.metadata) {
        try { const meta = JSON.parse(row.metadata); const product = meta.product || "Unknown"; productCounts[product] = (productCounts[product] || 0) + 1; } catch { /* skip */ }
      }
    });
    const productDistribution = Object.entries(productCounts).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, 6);

    // Price distribution
    const priceRows = allJourneys
      ? await db.prepare(`SELECT metadata FROM events WHERE step = 'price_filter_set' ${dc}${cf}`).all<{ metadata: string | null }>(...dp, ...cp)
      : await db.prepare(`SELECT metadata FROM events WHERE journey = ? AND step = 'price_filter_set' ${dc}${cf}`).all<{ metadata: string | null }>(targetJourney, ...dp, ...cp);

    const priceCounts: Record<string, number> = {};
    priceRows.forEach((row) => {
      if (row.metadata) {
        try { const meta = JSON.parse(row.metadata); const price = meta.price || "Unknown"; priceCounts[price] = (priceCounts[price] || 0) + 1; } catch { /* skip */ }
      }
    });
    const priceDistribution = Object.entries(priceCounts).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);

    // ── KPI metrics ─────────────────────────────────────────────────────
    // uniqueUsers  = distinct mobile numbers attributed to the journey(s)
    // totalCount   = total interactions (event rows) by those users
    // started      = users at each journey's first step
    // completed    = sequential-funnel survivors at each journey's last step
    // dropped      = started − completed (began but never finished)
    // Same math as the Overview journey cards, so the two reports agree.
    const uniqueUsers = scopeUsers.size;
    let totalCount = 0;
    for (const e of allEvents) if (scopeUsers.has(e.userId)) totalCount++;

    let started = 0, completed = 0;
    for (const tj of targets) {
      if (tj.steps.length === 0) continue;
      let rolling: Set<string> = new Set();
      for (let i = 0; i < tj.steps.length; i++) {
        const stepSet = usersAtStep(allEvents, tj.steps[i]);
        rolling = i === 0 ? stepSet : new Set([...rolling].filter((u) => stepSet.has(u)));
        if (i === 0) started += rolling.size;
        if (i === tj.steps.length - 1) completed += rolling.size;
      }
    }
    const dropped = Math.max(0, started - completed);
    const kpis = { uniqueUsers, totalCount, started, completed, dropped };

    return NextResponse.json({ funnel, byDate, byHour, productDistribution, priceDistribution, kpis });
  }

  // ── OPTION-BREAKDOWN ──────────────────────────────────────────────────
  // For each step in the requested journey (or all journeys), count unique
  // users per configured option — attributed by the step's variables in
  // metadata (standard journey logic), never by events.journey/step tags.
  if (type === "option-breakdown") {
    const treeJourneys = await loadTreeJourneys();
    const targets = journey ? treeJourneys.filter((tj) => tj.key === journey) : treeJourneys;
    if (targets.length === 0) return NextResponse.json({ steps: [], journeys: [] });
    const allEvents = await loadClientEvents();

    const result: { journeyKey: string; journeyName: string; step: string; variable: string; breakdown: { value: string; count: number }[]; total: number }[] = [];
    for (const tj of targets) {
      // Sequential rolling intersection — same logic as the funnel chart —
      // so a step's breakdown only counts users who actually completed every
      // prior step in this journey, not every user anywhere who ever had
      // this variable set (which inflates counts past the parent step).
      let rolling: Set<string> = new Set();
      let first = true;
      for (const step of tj.steps) {
        if (step.vars.length === 0) continue;
        const variable = step.vars[0];
        const stepSet = usersAtStep(allEvents, step);
        rolling = first ? stepSet : new Set([...rolling].filter((u) => stepSet.has(u)));
        first = false;

        // userId → last seen value, restricted to values that match one of
        // the step's actually-configured options — stray captured text (free
        // typing, bot menu dumps, junk like "STOP"/"N/A") isn't a real answer
        // choice and shouldn't appear in the breakdown. Option-label matching
        // also collapses casing variants into one canonical bucket.
        const userValue: Record<string, string> = {};
        for (const e of allEvents) {
          if (!rolling.has(e.userId)) continue;
          for (const v of step.vars) {
            const val = e.meta[v];
            if (val === undefined || val === null) continue;
            const canonical = step.optionLabels.get(String(val).trim().toLowerCase());
            if (canonical) { userValue[e.userId] = canonical; break; }
          }
        }

        const counts: Record<string, number> = {};
        for (const val of Object.values(userValue)) counts[val] = (counts[val] || 0) + 1;

        const breakdown = Object.entries(counts)
          .map(([value, count]) => ({ value, count }))
          .sort((a, b) => b.count - a.count);

        const total = breakdown.reduce((s, r) => s + r.count, 0);
        result.push({ journeyKey: tj.key, journeyName: tj.name, step: step.name, variable, breakdown, total });
      }
    }

    const withData = result.filter((s) => s.total > 0);

    // Group by journey for multi-journey mode.
    type JourneyBreakdown = { journeyKey: string; journeyName: string; steps: typeof withData };
    const byJourney: JourneyBreakdown[] = [];
    for (const item of withData) {
      let group = byJourney.find((g) => g.journeyKey === item.journeyKey);
      if (!group) { group = { journeyKey: item.journeyKey, journeyName: item.journeyName, steps: [] }; byJourney.push(group); }
      group.steps.push(item);
    }

    return NextResponse.json({ steps: withData, journeys: byJourney });
  }

  return NextResponse.json({ error: "Unknown type" }, { status: 400 });
}
