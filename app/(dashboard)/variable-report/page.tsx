"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import Topbar from "@/components/Topbar";
import TypewriterLoader from "@/components/TypewriterLoader";
import DateRangePicker from "@/components/DatePicker";
import ResetButton from "@/components/ResetButton";
import SelectGlass from "@/components/SelectGlass";
import { usePersistentState } from "@/lib/usePersistentState";
import { useActiveClientId } from "@/lib/useActiveClientId";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

const toLocalDateString = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

type Row = { mobile: string; variable: string; value: string; timestamp: string; journey: string };
type Job = { from: string; to: string; status: "pending" | "done" | "error"; count: number; error: string | null } | null;
type PivotRow = { mobile: string; vars: Record<string, string> };
type ValueCondition = "equals" | "contains" | "not_contains";
// `touched` distinguishes "value not chosen yet" (filter inactive) from an
// explicit pick of the "(blank)" option (filter active, matching empty values).
// `custom` switches the value field from the dropdown of known values to a
// free-text input, for matching values not present in the fetched data.
// `join` says how this condition combines with the accumulated result of
// every condition before it (evaluated left-to-right); ignored on the first
// condition, which always starts the chain.
type ValueFilter = { id: string; variable: string; condition: ValueCondition; value: string; touched?: boolean; custom?: boolean; join?: "AND" | "OR" };
const CUSTOM_VALUE_OPTION = "__custom__";

export default function VariableReportPage() {
  const today = toLocalDateString();
  const defFrom = toLocalDateString(new Date(Date.now() - 6 * 86400000)); // last 7 days
  const [fromDate, setFromDate, resetFrom] = usePersistentState("filter:var-report:from", defFrom);
  const [toDate, setToDate, resetTo] = usePersistentState("filter:var-report:to", today);
  const isFiltered = fromDate !== defFrom || toDate !== today;

  // The range currently being viewed (per active client). Set when the user
  // clicks Fetch. Persisted, so a reload keeps showing that range without
  // re-running the slow N8N query — the GET just re-reads local events.
  const clientId = useActiveClientId();
  const [committed, setCommitted] = usePersistentState<{ from: string; to: string } | null>(
    `filter:var-report:committed:${clientId ?? "none"}`,
    null
  );

  // Local flag set the instant Fetch is clicked, before the first GET lands —
  // keeps the "in progress" UI immediate.
  const [starting, setStarting] = useState(false);
  // True only during a manual Sync click (not during background auto-poll), so
  // the Sync button shows "Checking…" solely when the user clicked it.
  const [syncing, setSyncing] = useState(false);

  const swrKey = clientId && committed ? `/api/variable-report?from=${committed.from}&to=${committed.to}` : null;
  const { data, isLoading, mutate } = useSWR<{ rows?: Row[]; count?: number; job?: Job; error?: string }>(
    swrKey,
    fetcher,
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      // Auto-poll ONLY while a fetch job is still running. Once done/idle, stop
      // — a reload with completed data never re-syncs on its own.
      refreshInterval: (d) => (d?.job?.status === "pending" || starting ? 3000 : 0),
    }
  );

  const rows = useMemo(() => data?.rows || [], [data]);
  const apiError = data?.error;
  const job = data?.job || null;
  const hasFetched = clientId != null && committed !== null;
  const inProgress = starting || job?.status === "pending";

  // Once a GET shows the job finished, clear the local starting flag.
  if (starting && job && job.status !== "pending") {
    setTimeout(() => setStarting(false), 0);
  }

  const [search, setSearch] = useState("");
  // Variable column filter. null = show all (default); an array = show exactly
  // those variables ([] = show none).
  const [pickedVars, setPickedVars, resetPickedVars] = usePersistentState<string[] | null>(
    `filter:var-report:picked-vars:${clientId ?? "none"}`,
    null
  );
  // Value filters: rows must match every condition (AND). Each condition
  // tests one variable's value against a typed string.
  const [valueFilters, setValueFilters, resetValueFilters] = usePersistentState<ValueFilter[]>(
    `filter:var-report:value-filters:${clientId ?? "none"}`,
    []
  );
  const [page, setPage] = useState(0);
  const PER_PAGE = 25;

  // Fetch = start a background job for the selected range, then poll.
  async function doFetch() {
    setPage(0);
    setCommitted({ from: fromDate, to: toDate });
    setStarting(true);
    try {
      const res = await fetch("/api/variable-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ from: fromDate, to: toDate }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setStarting(false);
        mutate({ rows: [], count: 0, job: { from: fromDate, to: toDate, status: "error", count: 0, error: j.error || "Failed to start fetch." } }, { revalidate: false });
        return;
      }
    } catch {
      setStarting(false);
    }
    mutate(); // pull events + job status
  }

  // Sync = manual re-check of the running job (re-GET events + status).
  async function doSync() {
    setSyncing(true);
    try { await mutate(); } finally { setSyncing(false); }
  }

  function resetRange() { resetFrom(); resetTo(); setCommitted(null); setStarting(false); setPage(0); resetPickedVars(); resetValueFilters(); }

  const q = search.trim().toLowerCase();

  // ── Pivot view (one row per mobile, one column per variable) ─────────
  // Collapse the long rows into a matrix: for each (mobile, variable) keep the
  // latest value by timestamp. Columns = sorted union of all variable names.
  const { variables, pivotRows } = useMemo(() => {
    const varSet = new Set<string>();
    const byMobile = new Map<string, Record<string, string>>();
    const latestTs = new Map<string, string>(); // `${mobile}|${variable}` → ts
    for (const r of rows) {
      if (!r.variable) continue;
      varSet.add(r.variable);
      const key = `${r.mobile}|${r.variable}`;
      const prev = latestTs.get(key);
      if (!prev || r.timestamp > prev) {
        latestTs.set(key, r.timestamp);
        let m = byMobile.get(r.mobile);
        if (!m) { m = {}; byMobile.set(r.mobile, m); }
        m[r.variable] = r.value;
      }
    }
    const lc = (a: string, b: string) => {
      const la = a.toLowerCase(), lb = b.toLowerCase();
      return la < lb ? -1 : la > lb ? 1 : 0;
    };
    return {
      variables: [...varSet].sort(lc),
      pivotRows: ([...byMobile.entries()].map(([mobile, vars]) => ({ mobile, vars })) as PivotRow[])
        .sort((a, b) => (a.mobile < b.mobile ? 1 : a.mobile > b.mobile ? -1 : 0)),
    };
  }, [rows]);

  const searched = q
    ? pivotRows.filter((pr) =>
        pr.mobile.toLowerCase().includes(q) ||
        Object.entries(pr.vars).some(([k, v]) => k.toLowerCase().includes(q) || (v || "").toLowerCase().includes(q))
      )
    : pivotRows;

  // Value filters — conditions combine left-to-right using each condition's
  // own `join` (AND/OR) against the running result, so the user can mix both
  // within one filter set (e.g. A OR B, then AND C). A filter is only active
  // once the user has explicitly picked a value (including "(blank)").
  const activeValueFilters = valueFilters.filter((f) => f.variable && f.touched);
  const testFilter = (f: ValueFilter, pr: PivotRow) => {
    const actual = (pr.vars[f.variable] ?? "").toLowerCase();
    const expected = f.value.trim().toLowerCase();
    if (expected === "") {
      const isBlank = actual === "";
      return f.condition === "not_contains" ? !isBlank : isBlank;
    }
    if (f.condition === "equals") return actual === expected;
    if (f.condition === "contains") return actual.includes(expected);
    return !actual.includes(expected); // not_contains
  };
  const pivotFiltered = activeValueFilters.length === 0
    ? searched
    : searched.filter((pr) =>
        activeValueFilters.reduce<boolean | null>((acc, f) => {
          const result = testFilter(f, pr);
          if (acc === null) return result;
          return f.join === "OR" ? acc || result : acc && result;
        }, null) ?? true
      );

  // Apply the variable column filter. null = show every variable.
  const effVariables = pickedVars === null ? variables : variables.filter((v) => pickedVars.includes(v));

  const activeCount = pivotFiltered.length;
  const pageCount = Math.max(1, Math.ceil(activeCount / PER_PAGE));
  const safePage = Math.min(page, pageCount - 1);
  const pagedPivot = pivotFiltered.slice(safePage * PER_PAGE, safePage * PER_PAGE + PER_PAGE);


  function exportCsv() {
    const esc = (s: string) => `"${String(s ?? "").replace(/"/g, '""')}"`;
    const head = ["Phone Number", ...effVariables];
    const body = pivotFiltered.map((pr) => [pr.mobile, ...effVariables.map((v) => pr.vars[v] ?? "")].map(esc).join(","));
    const blob = new Blob([[head.join(","), ...body].join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `variable-report-pivot_${fromDate}_to_${toDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <Topbar title="Variable Report" subtitle="Per-user variable values over time" />
      <TypewriterLoader isLoading={isLoading && !hasFetched} messages={["Loading…", "Reading per-user values…", "Building the report…", "Almost ready…"]} />
      <main className="flex-1 overflow-auto p-4 sm:p-6 lg:p-7 space-y-5">
        {/* Controls: date range left, fetch/sync/export right */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3 flex-wrap">
            {/* Free date range selection — pick any window up to today. */}
            <DateRangePicker
              from={fromDate}
              to={toDate}
              max={today}
              onChange={(f, t) => { setFromDate(f); setToDate(t); setPage(0); }}
            />
            <ResetButton show={isFiltered || hasFetched} onClick={resetRange} />
            <span className="text-xs text-gray-500">
              {hasFetched
                ? `Fetched: ${committed!.from === committed!.to ? committed!.from : `${committed!.from} → ${committed!.to}`}`
                : "Pick a range, then click Fetch"}
            </span>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={doFetch}
              disabled={inProgress}
              className="text-sm px-4 py-2 bg-green-500/20 text-green-300 border border-green-500/30 rounded-lg hover:bg-green-500/30 transition-colors disabled:opacity-50 cursor-pointer font-semibold"
            >
              {inProgress ? "⏳ Fetching…" : "🔄 Fetch"}
            </button>
            {/* Sync appears while a fetch is running so the user can check status. */}
            {inProgress && (
              <button
                onClick={doSync}
                disabled={syncing}
                className="text-sm px-4 py-2 bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded-lg hover:bg-amber-500/30 transition-colors disabled:opacity-50 cursor-pointer font-semibold"
              >
                {syncing ? "⏳ Checking…" : "⟳ Sync"}
              </button>
            )}
            <button
              onClick={exportCsv}
              disabled={activeCount === 0}
              className="text-sm px-4 py-2 bg-blue-500/20 text-blue-300 border border-blue-500/30 rounded-lg hover:bg-blue-500/30 transition-colors disabled:opacity-40 cursor-pointer font-semibold"
            >
              ⤓ Export CSV
            </button>
          </div>
        </div>

        {/* In-progress banner */}
        {inProgress && (
          <div className="px-4 py-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-sm flex items-center gap-2">
            <span className="inline-block w-3.5 h-3.5 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
            Data fetching in progress — the source query can take a while. Rows appear here as they land. Click <b>Sync</b> to check now.
          </div>
        )}

        {/* Success / error banner */}
        {!inProgress && job?.status === "done" && (
          <div className="px-4 py-3 rounded-xl bg-green-500/10 border border-green-500/30 text-green-300 text-sm">
            ✓ Fetched {job.count.toLocaleString()} variable rows for {job.from === job.to ? job.from : `${job.from} → ${job.to}`}.
          </div>
        )}
        {!inProgress && (apiError || job?.status === "error") && (
          <div className="px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-sm">
            ⚠ {apiError || job?.error}
          </div>
        )}

        {/* Variable filter + search */}
        <div className="flex items-center gap-3 flex-wrap">
          <VariableFilter
            variables={variables}
            picked={pickedVars}
            onChange={(p) => { setPickedVars(p); setPage(0); }}
          />
          <ValueFilterBar
            variables={variables}
            pivotRows={pivotRows}
            filters={valueFilters}
            onChange={(f) => { setValueFilters(f); setPage(0); }}
          />
          {hasFetched && (
            <span className="text-sm px-3 py-2 rounded-lg bg-green-500/10 border border-green-500/30 text-green-300 font-semibold whitespace-nowrap">
              {activeCount.toLocaleString()} {activeCount === 1 ? "result" : "results"}
              {activeValueFilters.length > 0 ? " (filtered)" : ""}
            </span>
          )}
          <input
            type="text"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(0); }}
            placeholder="Search mobile, variable, or value…"
            className="flex-1 min-w-[220px] max-w-md bg-white/10 border border-white/10 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-green-500/40"
          />
        </div>

        {/* Table — scrolls inside the card (both axes) so the header can stay
            pinned to the card top while rows scroll under it. */}
        <div className="glass rounded-2xl overflow-auto max-h-[70vh]">
          <table className="text-sm">
            <thead className="border-b border-white/10">
              <tr>
                <th className="report-th sticky top-0 z-20 text-left px-5 py-3.5 text-gray-400 font-semibold whitespace-nowrap">Phone Number</th>
{effVariables.map((v) => (
                  <th key={v} className="report-th sticky top-0 z-20 text-left px-5 py-3.5 text-blue-300 font-mono font-semibold whitespace-nowrap">{v}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {!hasFetched ? (
                <tr><td colSpan={effVariables.length + 1} className="px-5 py-8 text-center text-gray-500">Pick a date range and click <span className="text-green-400 font-semibold">Fetch</span> to load the report.</td></tr>
              ) : pagedPivot.length === 0 ? (
                <tr><td colSpan={Math.max(1, effVariables.length + 1)} className="px-5 py-8 text-center text-gray-500">{inProgress ? "Fetching… rows will appear here." : "No variable data for this range"}</td></tr>
              ) : pagedPivot.map((pr) => (
                <tr key={pr.mobile} className="hover:bg-white/5 transition-colors">
                  <td className="px-5 py-3 font-medium text-gray-200 whitespace-nowrap">{pr.mobile}</td>
                  {effVariables.map((v) => (
                    <td key={v} className="px-5 py-3 text-gray-300 max-w-[240px] truncate" title={pr.vars[v] ?? ""}>{pr.vars[v] ?? ""}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-end gap-4 text-sm text-gray-400">
          <span>
            {activeCount === 0 ? "0" : `${safePage * PER_PAGE + 1}-${Math.min((safePage + 1) * PER_PAGE, activeCount)}`} of {activeCount}
          </span>
          <div className="flex items-center gap-1">
            <button onClick={() => setPage(0)} disabled={safePage === 0} className="px-2 py-1 rounded hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed">⏮</button>
            <button onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={safePage === 0} className="px-2 py-1 rounded hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed">‹</button>
            <span className="px-2">Page {safePage + 1} / {pageCount}</span>
            <button onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))} disabled={safePage >= pageCount - 1} className="px-2 py-1 rounded hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed">›</button>
            <button onClick={() => setPage(pageCount - 1)} disabled={safePage >= pageCount - 1} className="px-2 py-1 rounded hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed">⏭</button>
          </div>
        </div>
      </main>
    </div>
  );
}

// Multi-select dropdown to pick which variable columns to show. Empty
// selection = show all. Includes a search box and All / Clear shortcuts.
function VariableFilter({
  variables,
  picked,
  onChange,
}: {
  variables: string[];
  picked: string[] | null; // null = all
  onChange: (next: string[] | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const shown = q ? variables.filter((v) => v.toLowerCase().includes(q.toLowerCase())) : variables;
  const isAll = picked === null;
  const label = isAll ? "All variables" : `${picked.length} of ${variables.length}`;
  const isChecked = (v: string) => isAll || picked!.includes(v);

  function toggle(v: string) {
    // From "all", unchecking one starts an explicit list of everything but v.
    if (isAll) { onChange(variables.filter((x) => x !== v)); return; }
    const next = picked!.includes(v) ? picked!.filter((x) => x !== v) : [...picked!, v];
    // If they end up with every variable checked, collapse back to "all".
    onChange(next.length === variables.length ? null : next);
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        disabled={variables.length === 0}
        className="text-sm px-4 py-2 bg-white/10 border border-white/10 rounded-lg text-gray-200 hover:bg-white/15 transition-colors cursor-pointer font-semibold disabled:opacity-40 whitespace-nowrap"
      >
        🎛 Variables: {label} ▾
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute z-40 mt-2 w-72 glass rounded-xl border border-white/10 shadow-xl p-3">
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <button onClick={() => onChange(null)} className="text-xs px-2 py-1 rounded bg-green-500/20 text-green-300 hover:bg-green-500/30 cursor-pointer">Select all</button>
              <button onClick={() => onChange([])} className="text-xs px-2 py-1 rounded bg-white/10 text-gray-300 hover:bg-white/20 cursor-pointer">Deselect all</button>
              {/* Picks exactly the currently-searched variables — quick way to
                  isolate e.g. all @Budget* columns. */}
              {q && <button onClick={() => onChange([...shown])} className="text-xs px-2 py-1 rounded bg-blue-500/20 text-blue-300 hover:bg-blue-500/30 cursor-pointer">Only these</button>}
            </div>
            <input
              type="text"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search variables…"
              className="w-full bg-white/10 border border-white/10 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-green-500/40 mb-2"
            />
            <div className="max-h-64 overflow-auto space-y-0.5">
              {shown.length === 0 ? (
                <p className="text-xs text-gray-500 px-1 py-2">No matching variables</p>
              ) : shown.map((v) => (
                <label key={v} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-white/5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isChecked(v)}
                    onChange={() => toggle(v)}
                    className="accent-green-500 cursor-pointer"
                  />
                  <span className="font-mono text-blue-300 text-sm truncate">{v}</span>
                </label>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

const CONDITION_LABELS: Record<ValueCondition, string> = {
  equals: "is equal to",
  contains: "contains",
  not_contains: "does not contain",
};

// Dropdown to build one or more "variable <condition> value" rules, ANDed
// together against the pivoted rows (e.g. @budget contains "20-30L").
function ValueFilterBar({
  variables,
  pivotRows,
  filters,
  onChange,
}: {
  variables: string[];
  pivotRows: PivotRow[];
  filters: ValueFilter[];
  onChange: (next: ValueFilter[]) => void;
}) {
  const [open, setOpen] = useState(false);

  // Distinct values seen for a variable across all rows, sorted, with a
  // leading "(blank)" option standing in for an empty/missing value.
  function valueOptions(variable: string): { value: string; label: string }[] {
    const seen = new Set<string>();
    for (const pr of pivotRows) {
      const v = pr.vars[variable];
      if (v) seen.add(v);
    }
    const sorted = [...seen].sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
    return [
      { value: "", label: "(blank)" },
      ...sorted.map((v) => ({ value: v, label: v })),
      { value: CUSTOM_VALUE_OPTION, label: "✎ Custom value…" },
    ];
  }
  const activeCount = filters.filter((f) => f.variable && f.touched).length;

  function addFilter() {
    onChange([...filters, { id: `${Date.now()}-${Math.random()}`, variable: variables[0] || "", condition: "contains", value: "", join: "AND" }]);
  }
  function updateFilter(id: string, patch: Partial<ValueFilter>) {
    onChange(filters.map((f) => (f.id === id ? { ...f, ...patch } : f)));
  }
  function removeFilter(id: string) {
    onChange(filters.filter((f) => f.id !== id));
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        disabled={variables.length === 0}
        className="text-sm px-4 py-2 bg-white/10 border border-white/10 rounded-lg text-gray-200 hover:bg-white/15 transition-colors cursor-pointer font-semibold disabled:opacity-40 whitespace-nowrap"
      >
        ⏷ Filters{activeCount > 0 ? `: ${activeCount}` : ""} ▾
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute z-40 mt-2 w-[280px] glass rounded-xl border border-white/10 shadow-xl p-3">
            {filters.length === 0 ? (
              <p className="text-xs text-gray-500 px-1 py-2">No filters yet — add one to match a variable's value.</p>
            ) : (
              <div className="space-y-3 max-h-[26rem] overflow-y-auto overflow-x-hidden">
                {filters.map((f, i) => (
                  <div key={f.id} className="flex flex-col gap-1.5 pb-3 border-b border-white/10 last:border-b-0 last:pb-0">
                    {i > 0 && (
                      <div className="flex items-center gap-1 self-start">
                        {(["AND", "OR"] as const).map((j) => (
                          <button
                            key={j}
                            onClick={() => updateFilter(f.id, { join: j })}
                            className={`text-[10px] font-bold px-2 py-0.5 rounded-full cursor-pointer transition-colors ${
                              (f.join ?? "AND") === j
                                ? "bg-green-500/25 text-green-300"
                                : "bg-white/5 text-gray-500 hover:bg-white/10"
                            }`}
                          >
                            {j}
                          </button>
                        ))}
                      </div>
                    )}
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] uppercase tracking-wide text-gray-500 font-semibold">Condition {i + 1}</span>
                      <button
                        onClick={() => removeFilter(f.id)}
                        title="Remove filter"
                        className="text-gray-500 hover:text-red-300 transition-colors px-1 cursor-pointer"
                      >
                        ✕
                      </button>
                    </div>
                    <SelectGlass
                      value={f.variable}
                      onChange={(v) => updateFilter(f.id, { variable: v })}
                      options={variables.map((v) => ({ value: v, label: v }))}
                      className="w-full"
                      searchable
                    />
                    <SelectGlass
                      value={f.condition}
                      onChange={(v) => updateFilter(f.id, { condition: v as ValueCondition })}
                      options={(Object.keys(CONDITION_LABELS) as ValueCondition[]).map((c) => ({ value: c, label: CONDITION_LABELS[c] }))}
                      className="w-full"
                    />
                    {f.custom ? (
                      <div className="flex items-center gap-1.5">
                        <input
                          type="text"
                          autoFocus
                          value={f.value}
                          onChange={(e) => updateFilter(f.id, { value: e.target.value, touched: true })}
                          placeholder="Type a value…"
                          className="w-full bg-white/10 border border-white/10 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-green-500/40"
                        />
                        <button
                          onClick={() => updateFilter(f.id, { custom: false, value: "", touched: false })}
                          title="Back to value list"
                          className="text-gray-500 hover:text-gray-300 transition-colors px-1 shrink-0 cursor-pointer"
                        >
                          ↩
                        </button>
                      </div>
                    ) : (
                      <SelectGlass
                        value={f.value}
                        onChange={(v) => {
                          if (v === CUSTOM_VALUE_OPTION) {
                            updateFilter(f.id, { custom: true, value: "", touched: false });
                          } else {
                            updateFilter(f.id, { value: v, touched: true });
                          }
                        }}
                        options={valueOptions(f.variable)}
                        className="w-full"
                        searchable
                      />
                    )}
                  </div>
                ))}
              </div>
            )}
            <div className="flex items-center gap-2 mt-2 pt-2 border-t border-white/10">
              <button
                onClick={addFilter}
                disabled={variables.length === 0}
                className="text-xs px-2 py-1 rounded bg-green-500/20 text-green-300 hover:bg-green-500/30 cursor-pointer disabled:opacity-40"
              >
                + Add condition
              </button>
              {filters.length > 0 && (
                <button
                  onClick={() => onChange([])}
                  className="text-xs px-2 py-1 rounded bg-white/10 text-gray-300 hover:bg-white/20 cursor-pointer"
                >
                  Clear all
                </button>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
