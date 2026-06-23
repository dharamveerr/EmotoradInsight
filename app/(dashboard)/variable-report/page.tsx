"use client";

import { useState } from "react";
import useSWR from "swr";
import Topbar from "@/components/Topbar";
import TypewriterLoader from "@/components/TypewriterLoader";
import DateRangePicker from "@/components/DatePicker";
import ResetButton from "@/components/ResetButton";
import { usePersistentState } from "@/lib/usePersistentState";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

const toLocalDateString = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

type Row = { mobile: string; variable: string; value: string; timestamp: string; journey: string };

function fmtDateTime(v: string): string {
  if (!v) return "—";
  const d = new Date(v);
  if (isNaN(d.getTime())) return v;
  return d.toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}

export default function VariableReportPage() {
  const today = toLocalDateString();
  const defFrom = toLocalDateString(new Date(Date.now() - 6 * 86400000)); // last 7 days
  const [fromDate, setFromDate, resetFrom] = usePersistentState("filter:var-report:from", defFrom);
  const [toDate, setToDate, resetTo] = usePersistentState("filter:var-report:to", today);
  const isFiltered = fromDate !== defFrom || toDate !== today;
  function resetRange() { resetFrom(); resetTo(); }

  // Manual fetch only. SWR runs solely for the committed range — set when the
  // user clicks Fetch. Persisted, so a reload keeps showing the last fetched
  // range/data until the user picks a new range and clicks Fetch again. (Still
  // never auto-fetches a range the user didn't explicitly fetch.)
  const [committed, setCommitted] = usePersistentState<{ from: string; to: string } | null>("filter:var-report:committed", null);
  const swrKey = committed ? `/api/variable-report?from=${committed.from}&to=${committed.to}` : null;
  const { data, isLoading, mutate, isValidating } = useSWR<{ rows?: Row[]; count?: number; error?: string }>(
    swrKey,
    fetcher,
    { revalidateOnFocus: false, revalidateOnReconnect: false, revalidateIfStale: false }
  );
  const rows = data?.rows || [];
  const apiError = data?.error;
  const hasFetched = committed !== null;

  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const PER_PAGE = 25;

  function doFetch() {
    const next = { from: fromDate, to: toDate };
    if (committed && committed.from === next.from && committed.to === next.to) mutate();
    else setCommitted(next);
    setPage(0);
  }

  const q = search.trim().toLowerCase();
  const filtered = q
    ? rows.filter((r) => [r.mobile, r.variable, r.value].some((f) => (f || "").toLowerCase().includes(q)))
    : rows;
  const pageCount = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  const safePage = Math.min(page, pageCount - 1);
  const paged = filtered.slice(safePage * PER_PAGE, safePage * PER_PAGE + PER_PAGE);

  function exportCsv() {
    const head = ["Mobile", "Variable", "Value", "Timestamp", "Journey"];
    const esc = (s: string) => `"${String(s).replace(/"/g, '""')}"`;
    const lines = [head.join(",")].concat(
      filtered.map((r) => [r.mobile, r.variable, r.value, r.timestamp, r.journey].map(esc).join(","))
    );
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `variable-report_${fromDate}_to_${toDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <Topbar title="Variable Report" subtitle="Per-user variable values over time" />
      <TypewriterLoader isLoading={isLoading} messages={["Fetching variables…", "Reading per-user values…", "Building the report…", "Almost ready…"]} />
      <main className="flex-1 overflow-auto p-4 sm:p-6 lg:p-7 space-y-5">
        {/* Controls: date range left, fetch/export right */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3 flex-wrap">
            {/* Once fetched, the picker is clamped to the fetched range — you can
                only narrow within it. Reset unlocks back to the full range. */}
            <DateRangePicker
              from={fromDate}
              to={toDate}
              min={hasFetched ? committed!.from : undefined}
              max={hasFetched ? committed!.to : today}
              onChange={(f, t) => { setFromDate(f); setToDate(t); setPage(0); }}
            />
            <ResetButton show={isFiltered || hasFetched} onClick={() => { resetRange(); setCommitted(null); setPage(0); }} />
            <span className="text-xs text-gray-500">
              {hasFetched
                ? `${committed!.from === committed!.to ? committed!.from : `${committed!.from} → ${committed!.to}`} · ${filtered.length} rows`
                : "Pick a range, then click Fetch"}
            </span>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={doFetch}
              disabled={isValidating}
              className="text-sm px-4 py-2 bg-green-500/20 text-green-300 border border-green-500/30 rounded-lg hover:bg-green-500/30 transition-colors disabled:opacity-50 cursor-pointer font-semibold"
            >
              {isValidating ? "⏳ Fetching…" : "🔄 Fetch"}
            </button>
            <button
              onClick={exportCsv}
              disabled={filtered.length === 0}
              className="text-sm px-4 py-2 bg-blue-500/20 text-blue-300 border border-blue-500/30 rounded-lg hover:bg-blue-500/30 transition-colors disabled:opacity-40 cursor-pointer font-semibold"
            >
              ⤓ Export CSV
            </button>
          </div>
        </div>

        {/* API error banner (N8N flow unreachable / not configured) */}
        {apiError && (
          <div className="px-4 py-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-sm">
            ⚠ {apiError}
          </div>
        )}

        {/* Search */}
        <input
          type="text"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(0); }}
          placeholder="Search mobile, variable, or value…"
          className="w-full sm:w-96 bg-white/10 border border-white/10 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-green-500/40"
        />

        {/* Table */}
        <div className="glass rounded-2xl overflow-x-auto">
          <table className="w-full text-sm min-w-[760px]">
            <thead className="bg-white/5 border-b border-white/10">
              <tr>
                {["Mobile Number", "Variable", "Value", "Timestamp"].map((h) => (
                  <th key={h} className="text-left px-5 py-3.5 text-gray-400 font-semibold whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {isLoading ? (
                <tr><td colSpan={4} className="px-5 py-8 text-center text-gray-500">Loading…</td></tr>
              ) : !hasFetched ? (
                <tr><td colSpan={4} className="px-5 py-8 text-center text-gray-500">Pick a date range and click <span className="text-green-400 font-semibold">Fetch</span> to load the report.</td></tr>
              ) : paged.length === 0 ? (
                <tr><td colSpan={4} className="px-5 py-8 text-center text-gray-500">No variable data for this range</td></tr>
              ) : paged.map((r, i) => (
                <tr key={`${r.mobile}-${r.variable}-${r.timestamp}-${i}`} className="hover:bg-white/5 transition-colors">
                  <td className="px-5 py-3 font-medium text-gray-200 whitespace-nowrap">{r.mobile}</td>
                  <td className="px-5 py-3 font-mono text-blue-300 whitespace-nowrap">{r.variable}</td>
                  <td className="px-5 py-3 text-gray-300 max-w-[320px] truncate" title={r.value}>{r.value || "—"}</td>
                  <td className="px-5 py-3 text-gray-400 whitespace-nowrap">{fmtDateTime(r.timestamp)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-end gap-4 text-sm text-gray-400">
          <span>
            {filtered.length === 0 ? "0" : `${safePage * PER_PAGE + 1}-${Math.min((safePage + 1) * PER_PAGE, filtered.length)}`} of {filtered.length}
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
