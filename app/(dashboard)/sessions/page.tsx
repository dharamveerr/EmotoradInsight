"use client";

import { useState } from "react";
import useSWR from "swr";
import { usePersistentState } from "@/lib/usePersistentState";
import ResetButton from "@/components/ResetButton";
import Topbar from "@/components/Topbar";
import DateRangePicker from "@/components/DatePicker";
import { useJourneyConfig } from "@/lib/useJourneyConfig";
import TypewriterLoader from "@/components/TypewriterLoader";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

type SessionRow = {
  userId: string;
  name: string;
  journey: string;
  startTime: string;
  stepsCompleted: number;
  totalSteps: number;
  outcome: "completed" | "dropped";
};

type StepDetail = {
  step: string;
  timestamp: string;
  variables: Record<string, string>;
};

// Variables to hide (internal/noise)
const HIDDEN_VARS = new Set(["@campaign_id", "@prospectId", "@accessToken", "@first_message"]);

function SessionDetail({ userId, journey, onClose }: { userId: string; journey: string; onClose: () => void }) {
  const { labels: JOURNEY_LABELS } = useJourneyConfig();
  const { data, isLoading } = useSWR(
    `/api/sessions?userId=${encodeURIComponent(userId)}&journey=${journey}`,
    fetcher
  );
  const steps: StepDetail[] = data?.steps || [];
  const [openStep, setOpenStep] = useState<number | null>(0);

  return (
    <div
      className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in"
      onClick={onClose}
    >
      <div
        className="glass rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col animate-fade-in-scale"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex justify-between items-start p-6 border-b border-white/10 shrink-0">
          <div>
            <h3 className="font-bold text-white text-base">Count Detail</h3>
            <p className="text-xs text-gray-400 mt-0.5">{JOURNEY_LABELS[journey] || journey}</p>
            <p className="text-xs text-gray-500 font-mono mt-1">📱 {userId}</p>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-white text-2xl leading-none transition ml-4">&times;</button>
        </div>

        {/* Steps */}
        <div className="overflow-y-auto flex-1 p-6 space-y-3">
          {isLoading ? (
            <div className="flex justify-center py-8">
              <div className="animate-spin w-6 h-6 border-2 border-green-500 border-t-transparent rounded-full" />
            </div>
          ) : steps.length === 0 ? (
            <p className="text-gray-500 text-sm text-center py-8">No step data found</p>
          ) : (
            steps.map((s, i) => {
              const visibleVars = Object.entries(s.variables).filter(
                ([k, v]) => !HIDDEN_VARS.has(k) && v && v !== "nan" && v !== "None"
              );
              const isOpen = openStep === i;
              return (
                <div key={i} className="rounded-xl overflow-hidden border border-white/10">
                  {/* Step header — clickable */}
                  <button
                    className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-white/5 transition-colors"
                    onClick={() => setOpenStep(isOpen ? null : i)}
                  >
                    <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                      i === steps.length - 1 ? "bg-green-500/20 text-green-400 border border-green-500/40" : "bg-blue-500/20 text-blue-400 border border-blue-500/30"
                    }`}>{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-200">{s.step}</p>
                      <p className="text-xs text-gray-500">{new Date(s.timestamp).toLocaleString()}</p>
                    </div>
                    <svg
                      viewBox="0 0 20 20" fill="currentColor"
                      className={`w-4 h-4 text-gray-500 shrink-0 transition-transform ${isOpen ? "rotate-180" : ""}`}
                    >
                      <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                    </svg>
                  </button>

                  {/* Variables accordion */}
                  {isOpen && (
                    <div className="border-t border-white/5 bg-white/3 px-4 py-3 space-y-2">
                      {visibleVars.length === 0 ? (
                        <p className="text-xs text-gray-600">No variables captured at this step</p>
                      ) : (
                        visibleVars.map(([key, val]) => (
                          <div key={key} className="flex gap-3 text-xs">
                            <span className="text-green-400 font-mono shrink-0 w-40 truncate">{key}</span>
                            <span className="text-gray-300 break-all">{val}</span>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="shrink-0 border-t border-white/10 px-6 py-3 flex justify-between items-center">
          <span className="text-xs text-gray-500">{steps.length} steps total</span>
          <button
            onClick={onClose}
            className="text-xs text-gray-400 hover:text-white transition"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

const toLocalDate = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; };

export default function SessionsPage() {
  const today = toLocalDate();
  const { labels: JOURNEY_LABELS } = useJourneyConfig();
  const [fromDate, setFromDate, resetFrom] = usePersistentState("filter:sessions:from", "");
  const [toDate,   setToDate,   resetTo]   = usePersistentState("filter:sessions:to",   "");
  const isDateFiltered = !!(fromDate && toDate);

  const { data, isLoading } = useSWR(`/api/sessions${fromDate && toDate ? `?from=${fromDate}&to=${toDate}` : ""}`, fetcher, { refreshInterval: 30000 });
  const sessions: SessionRow[] = data?.sessions || [];
  const [selected, setSelected] = useState<{ userId: string; journey: string } | null>(null);
  const [outcomeFilter, setOutcomeFilter, resetOutcome] = usePersistentState<"all" | "completed" | "dropped">("filter:sessions:outcome", "all");
  const [search, setSearch, resetSearch] = usePersistentState("filter:sessions:search", "");
  const isFiltered = outcomeFilter !== "all" || search !== "" || isDateFiltered;
  function resetAll() { resetOutcome(); resetSearch(); resetFrom(); resetTo(); }
  const [downloading, setDownloading] = useState(false);
  const [expandedDate, setExpandedDate] = useState<string | null>(null);
  const [showDailyOverview, setShowDailyOverview] = useState(false);
  const [sortColumn, setSortColumn] = useState<"date" | "reach" | "completion" | "dropoff">("date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [dateFormat, setDateFormat] = useState<"full" | "short" | "minimal" | "ddmmyyyy" | "ddmm">("short");
  const [showDateFormatMenu, setShowDateFormatMenu] = useState(false);
  const [selectedJourney, setSelectedJourney] = useState<string>("all");
  const { data: dailyData } = useSWR("/api/daily-stats", fetcher);

  // Filter daily stats by selected journey
  const filteredDailyStats = selectedJourney === "all"
    ? dailyData?.dailyStats || []
    : (dailyData?.dailyStats || []).filter((stat: any) => stat.journey === selectedJourney);

  // Extract unique journeys from daily stats
  const uniqueJourneys = Array.from(
    new Set((dailyData?.dailyStats || []).map((stat: { journey: string }) => stat.journey))
  ).sort() as string[];

  const filtered = sessions.filter((s) => {
    const matchOutcome = outcomeFilter === "all" || s.outcome === outcomeFilter;
    const matchSearch = !search ||
      s.userId.includes(search) ||
      (s.name || "").toLowerCase().includes(search.toLowerCase()) ||
      JOURNEY_LABELS[s.journey]?.toLowerCase().includes(search.toLowerCase());
    return matchOutcome && matchSearch;
  });

  // Group sessions by date
  const groupedByDate = filtered.reduce((acc: Record<string, SessionRow[]>, session) => {
    const date = new Date(session.startTime).toLocaleDateString("en-CA"); // YYYY-MM-DD
    if (!acc[date]) acc[date] = [];
    acc[date].push(session);
    return acc;
  }, {});

  const sortedDates = Object.keys(groupedByDate).sort().reverse();

  async function downloadCSV() {
    setDownloading(true);
    const res = await fetch("/api/sessions?export=csv");
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `emotorad-sessions-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    setDownloading(false);
  }

  return (
    <div className="flex-1 flex flex-col overflow-auto">
      <Topbar title="Count Replay" subtitle="Individual user journey paths" />
      <TypewriterLoader isLoading={isLoading} messages={["Loading session data...", "Fetching user journeys...", "Organising session replay...", "Almost ready..."]} />
      <main className="flex-1 p-7 space-y-5">

        {/* Controls — sticky below topbar */}
        <div className="page-sticky-bar sticky top-16 z-10 -mx-7 px-7 py-3 mb-2 flex items-center gap-3 flex-wrap animate-fade-in">
          {/* Outcome filter */}
          <div className="flex gap-2">
            {(["all", "completed", "dropped"] as const).map((v) => (
              <button
                key={v}
                onClick={() => setOutcomeFilter(v)}
                className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all ${
                  outcomeFilter === v
                    ? "bg-gradient-to-r from-green-500 to-emerald-500 text-white shadow-lg"
                    : "glass text-gray-400 hover:text-white"
                }`}
              >
                {v.charAt(0).toUpperCase() + v.slice(1)}
              </button>
            ))}
          </div>

          {/* Daily Overview Button */}
          <button
            onClick={() => setShowDailyOverview(true)}
            className="flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-semibold bg-blue-500/20 text-blue-300 border border-blue-500/30 hover:bg-blue-500/30 transition-all"
            title="View daily overview report"
          >
            <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
              <path d="M2 11a1 1 0 011-1h2a1 1 0 011 1v5a1 1 0 01-1 1H3a1 1 0 01-1-1v-5zM8 7a1 1 0 011-1h2a1 1 0 011 1v9a1 1 0 01-1 1H9a1 1 0 01-1-1V7zM14 4a1 1 0 011-1h2a1 1 0 011 1v12a1 1 0 01-1 1h-2a1 1 0 01-1-1V4z" />
            </svg>
            Daily Overview
          </button>

          {/* Search */}
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search phone / name / journey…"
            className="glass rounded-xl px-4 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-green-500/40 w-64"
          />

          <DateRangePicker from={fromDate} to={toDate} max={today} onChange={(f, t) => { setFromDate(f); setToDate(t); }} />

          <span className="text-xs text-gray-500">{filtered.length} count</span>

          <ResetButton show={isFiltered} onClick={resetAll} />

          {/* Download */}
          <div className="ml-auto flex gap-2">
            <button
              onClick={downloadCSV}
              disabled={downloading}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold bg-green-500/15 text-green-400 border border-green-500/30 hover:bg-green-500/25 transition-all disabled:opacity-50"
            >
              <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
              {downloading ? "Downloading…" : "Download CSV"}
            </button>
          </div>
        </div>

        {/* Grouped Table by Date */}
        {isLoading ? (
          <div className="skeleton rounded-2xl h-96" />
        ) : filtered.length === 0 ? (
          <div className="glass rounded-2xl text-center py-14 text-gray-600 text-sm">
            No count found
          </div>
        ) : (
          <div className="space-y-3 animate-fade-in delay-1">
            {sortedDates.map((date) => {
              const dateSessions = groupedByDate[date];
              const isOpen = expandedDate === date;
              const uniqueCount = dateSessions.length;
              const dateObj = new Date(date);
              const dateLabel = dateObj.toLocaleDateString("en-US", {
                weekday: "short",
                month: "short",
                day: "numeric",
                year: "numeric",
              });

              return (
                <div key={date} className="glass rounded-2xl overflow-hidden">
                  {/* Date header with expandable button */}
                  <button
                    onClick={() => setExpandedDate(isOpen ? null : date)}
                    className="w-full flex items-center justify-between px-6 py-4 hover:bg-white/5 transition-colors text-left"
                  >
                    <div className="flex items-center gap-4 flex-1">
                      <span className="text-gray-200 font-semibold">{dateLabel}</span>

                      {/* Unique count badge (clickable) */}
                      <div className="flex items-center gap-2 px-3 py-1 bg-blue-500/20 border border-blue-500/40 rounded-full">
                        <span className="text-xs font-bold text-blue-300">👁️ {uniqueCount}</span>
                      </div>

                      <span className="text-xs text-gray-500 ml-2">
                        {dateSessions.filter((s) => s.outcome === "completed").length} completed
                      </span>
                    </div>

                    {/* Expand/collapse indicator */}
                    <svg
                      viewBox="0 0 20 20"
                      fill="currentColor"
                      className={`w-5 h-5 text-gray-500 transition-transform ${isOpen ? "rotate-180" : ""}`}
                    >
                      <path
                        fillRule="evenodd"
                        d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
                        clipRule="evenodd"
                      />
                    </svg>
                  </button>

                  {/* Expanded session list */}
                  {isOpen && (
                    <>
                      <div className="border-t border-white/10" />
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead className="bg-white/5 border-b border-white/10">
                            <tr>
                              <th className="text-left px-6 py-3 text-gray-400 font-semibold">Phone</th>
                              <th className="text-left px-6 py-3 text-gray-400 font-semibold">Name</th>
                              <th className="text-left px-6 py-3 text-gray-400 font-semibold">Journey</th>
                              <th className="text-left px-6 py-3 text-gray-400 font-semibold">Time</th>
                              <th className="text-center px-6 py-3 text-gray-400 font-semibold">Progress</th>
                              <th className="text-center px-6 py-3 text-gray-400 font-semibold">Outcome</th>
                              <th className="text-center px-6 py-3 text-gray-400 font-semibold">Detail</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-white/5">
                            {dateSessions.map((s, i) => (
                              <tr key={i} className="hover:bg-white/5 transition-colors">
                                <td className="px-6 py-3 text-gray-300 font-mono text-xs">{s.userId}</td>
                                <td className="px-6 py-3 text-gray-200 text-xs">{s.name || "—"}</td>
                                <td className="px-6 py-3 text-gray-200 text-xs">
                                  {JOURNEY_LABELS[s.journey] || s.journey}
                                </td>
                                <td className="px-6 py-3 text-gray-500 text-xs whitespace-nowrap">
                                  {new Date(s.startTime).toLocaleTimeString()}
                                </td>
                                <td className="px-6 py-3 text-center">
                                  <div className="flex items-center justify-center gap-2">
                                    <div className="w-14 h-1 bg-white/10 rounded-full overflow-hidden">
                                      <div
                                        className="h-full bg-gradient-to-r from-green-400 to-emerald-500"
                                        style={{
                                          width: `${Math.min(
                                            (s.stepsCompleted / s.totalSteps) * 100,
                                            100
                                          )}%`,
                                        }}
                                      />
                                    </div>
                                    <span className="text-gray-400 text-xs">
                                      {s.stepsCompleted}/{s.totalSteps}
                                    </span>
                                  </div>
                                </td>
                                <td className="px-6 py-3 text-center">
                                  <span
                                    className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                                      s.outcome === "completed"
                                        ? "bg-green-500/15 text-green-400 border border-green-500/30"
                                        : "bg-red-500/15 text-red-400 border border-red-500/30"
                                    }`}
                                  >
                                    {s.outcome}
                                  </span>
                                </td>
                                <td className="px-6 py-3 text-center">
                                  <button
                                    onClick={() => setSelected({ userId: s.userId, journey: s.journey })}
                                    className="text-green-400 hover:text-green-300 font-semibold text-xs transition hover:underline"
                                  >
                                    View →
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </main>

      {selected && (
        <SessionDetail
          userId={selected.userId}
          journey={selected.journey}
          onClose={() => setSelected(null)}
        />
      )}

      {/* Daily Overview Modal */}
      {showDailyOverview && (
        <div
          className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in"
          onClick={() => setShowDailyOverview(false)}
        >
          <div
            className="glass rounded-2xl shadow-2xl w-full max-w-5xl max-h-[85vh] flex flex-col animate-fade-in-scale overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="p-6 border-b border-white/10 shrink-0 space-y-4">
              <div className="flex justify-between items-center">
                <h3 className="font-bold text-white text-lg">Daily Overview Report</h3>
                <div className="flex gap-2">
                <button
                  onClick={() => {
                    if (!filteredDailyStats) return;
                    const csv = [
                      ["Date", "Total Reach", "Completion Rate (%)", "Drop-off Rate (%)"],
                      ...filteredDailyStats.map((d: any) => [
                        new Date(d.date).toLocaleDateString(),
                        d.reach,
                        d.completionRate,
                        d.dropoffRate,
                      ]),
                    ]
                      .map((r) => r.join(","))
                      .join("\n");
                    const blob = new Blob([csv], { type: "text/csv" });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = `daily-overview-${new Date().toISOString().slice(0, 10)}.csv`;
                    a.click();
                    URL.revokeObjectURL(url);
                  }}
                  className="text-xs px-3 py-1.5 bg-green-500/20 text-green-300 rounded font-semibold hover:bg-green-500/30 transition flex items-center gap-2"
                  title="Download as CSV"
                >
                  <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                    <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" />
                  </svg>
                  CSV
                </button>
                <button
                  onClick={() => setShowDailyOverview(false)}
                  className="text-gray-500 hover:text-white text-2xl leading-none transition"
                >
                  ×
                </button>
              </div>
              </div>
              {/* Journey Selector */}
              <div className="flex items-center gap-3">
                <label className="text-xs font-semibold text-gray-400">Journey:</label>
                <select
                  value={selectedJourney}
                  onChange={(e) => setSelectedJourney(e.target.value)}
                  className="text-xs px-3 py-1.5 bg-slate-700/50 border border-white/20 text-gray-100 rounded-lg hover:bg-slate-700/70 transition focus:outline-none focus:ring-2 focus:ring-green-500/40 cursor-pointer appearance-none bg-clip-padding"
                >
                  <option value="all">All Journeys</option>
                  {uniqueJourneys.map((journey) => (
                    <option key={journey} value={journey}>
                      {JOURNEY_LABELS[journey] || journey}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Summary Stats */}
            {filteredDailyStats && filteredDailyStats.length > 0 && (
              <div className="px-6 py-4 border-b border-white/10 bg-white/3">
                <div className="grid grid-cols-4 gap-3">
                  <div className="glass rounded-lg p-3">
                    <p className="text-xs text-gray-500 mb-1">Avg Daily Reach</p>
                    <p className="text-xl font-bold text-white">
                      {(
                        filteredDailyStats.reduce((sum: number, d: any) => sum + d.reach, 0) /
                        filteredDailyStats.length
                      ).toFixed(0)}
                    </p>
                  </div>
                  <div className="glass rounded-lg p-3">
                    <p className="text-xs text-gray-500 mb-1">Avg Completion Rate</p>
                    <p className="text-xl font-bold text-green-400">
                      {(
                        filteredDailyStats.reduce(
                          (sum: number, d: any) => sum + parseFloat(d.completionRate),
                          0
                        ) / filteredDailyStats.length
                      ).toFixed(1)}
                      %
                    </p>
                  </div>
                  <div className="glass rounded-lg p-3">
                    <p className="text-xs text-gray-500 mb-1">Avg Drop-off Rate</p>
                    <p className="text-xl font-bold text-red-400">
                      {(
                        filteredDailyStats.reduce(
                          (sum: number, d: any) => sum + parseFloat(d.dropoffRate),
                          0
                        ) / filteredDailyStats.length
                      ).toFixed(1)}
                      %
                    </p>
                  </div>
                  <div className="glass rounded-lg p-3">
                    <p className="text-xs text-gray-500 mb-1">Total Reach</p>
                    <p className="text-xl font-bold text-blue-400">
                      {filteredDailyStats.reduce((sum: number, d: any) => sum + d.reach, 0)}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Table */}
            <div className="flex-1 overflow-auto p-6">
              {!filteredDailyStats || filteredDailyStats.length === 0 ? (
                <div className="text-center text-gray-500 py-8">No data available</div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/10">
                      <th className="text-left px-4 py-2 text-gray-400 font-semibold relative">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => setShowDateFormatMenu(!showDateFormatMenu)}
                            className="text-xs hover:text-white transition flex items-center"
                            title="Date format"
                          >
                            ▼
                          </button>
                          <button
                            onClick={() => {
                              setSortColumn("date");
                              setSortDir(sortColumn === "date" && sortDir === "asc" ? "desc" : "asc");
                            }}
                            className="flex items-center gap-1 hover:text-white transition"
                          >
                            Date
                            <span className="text-xs">
                              {sortColumn === "date" ? (sortDir === "asc" ? "↑" : "↓") : "⇅"}
                            </span>
                          </button>
                        </div>
                        {showDateFormatMenu && (
                          <div className="absolute left-0 top-full mt-1 bg-slate-800 border border-white/10 rounded-lg shadow-lg z-10 overflow-hidden min-w-max">
                            {(["full", "short", "minimal", "ddmmyyyy", "ddmm"] as const).map((fmt) => (
                              <button
                                key={fmt}
                                onClick={() => {
                                  setDateFormat(fmt);
                                  setShowDateFormatMenu(false);
                                }}
                                className={`block w-full text-left px-3 py-2 text-xs hover:bg-white/10 transition ${
                                  dateFormat === fmt ? "bg-blue-500/20 text-blue-300" : "text-gray-300"
                                }`}
                              >
                                {fmt === "full" ? "Date Month Year" : fmt === "short" ? "Day, Mon DD" : fmt === "minimal" ? "Mon DD" : fmt === "ddmmyyyy" ? "DD-MM-YYYY" : "DD-MM"}
                              </button>
                            ))}
                          </div>
                        )}
                      </th>
                      <th className="text-center px-4 py-2 text-gray-400 font-semibold">
                        <button
                          onClick={() => {
                            setSortColumn("reach");
                            setSortDir(sortColumn === "reach" && sortDir === "asc" ? "desc" : "asc");
                          }}
                          className="flex items-center justify-center gap-1 hover:text-white transition w-full"
                        >
                          Total Reach
                          <span className="text-xs">
                            {sortColumn === "reach" ? (sortDir === "asc" ? "↑" : "↓") : "⇅"}
                          </span>
                        </button>
                      </th>
                      <th className="text-center px-4 py-2 text-gray-400 font-semibold">
                        <button
                          onClick={() => {
                            setSortColumn("completion");
                            setSortDir(sortColumn === "completion" && sortDir === "asc" ? "desc" : "asc");
                          }}
                          className="flex items-center justify-center gap-1 hover:text-white transition w-full"
                        >
                          Completion Rate
                          <span className="text-xs">
                            {sortColumn === "completion" ? (sortDir === "asc" ? "↑" : "↓") : "⇅"}
                          </span>
                        </button>
                      </th>
                      <th className="text-center px-4 py-2 text-gray-400 font-semibold">
                        <button
                          onClick={() => {
                            setSortColumn("dropoff");
                            setSortDir(sortColumn === "dropoff" && sortDir === "asc" ? "desc" : "asc");
                          }}
                          className="flex items-center justify-center gap-1 hover:text-white transition w-full"
                        >
                          Drop-off Rate
                          <span className="text-xs">
                            {sortColumn === "dropoff" ? (sortDir === "asc" ? "↑" : "↓") : "⇅"}
                          </span>
                        </button>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {filteredDailyStats
                      .slice()
                      .sort((a: any, b: any) => {
                        let aVal, bVal;
                        if (sortColumn === "date") {
                          aVal = new Date(a.date).getTime();
                          bVal = new Date(b.date).getTime();
                        } else if (sortColumn === "reach") {
                          aVal = a.reach;
                          bVal = b.reach;
                        } else if (sortColumn === "completion") {
                          aVal = parseFloat(a.completionRate);
                          bVal = parseFloat(b.completionRate);
                        } else {
                          aVal = parseFloat(a.dropoffRate);
                          bVal = parseFloat(b.dropoffRate);
                        }
                        return sortDir === "asc" ? aVal - bVal : bVal - aVal;
                      })
                      .map((stat: any, idx: number) => {
                      const date = new Date(stat.date);
                      let dateStr = "";
                      if (dateFormat === "full") {
                        dateStr = date.toLocaleDateString("en-US", {
                          day: "numeric",
                          month: "long",
                          year: "numeric",
                        });
                      } else if (dateFormat === "short") {
                        dateStr = date.toLocaleDateString("en-US", {
                          weekday: "short",
                          month: "short",
                          day: "numeric",
                        });
                      } else if (dateFormat === "minimal") {
                        dateStr = date.toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                        });
                      } else if (dateFormat === "ddmmyyyy") {
                        const d = String(date.getDate()).padStart(2, "0");
                        const m = String(date.getMonth() + 1).padStart(2, "0");
                        const y = date.getFullYear();
                        dateStr = `${d}-${m}-${y}`;
                      } else if (dateFormat === "ddmm") {
                        const d = String(date.getDate()).padStart(2, "0");
                        const m = String(date.getMonth() + 1).padStart(2, "0");
                        dateStr = `${d}-${m}`;
                      }
                      const completion = parseFloat(stat.completionRate);
                      const dropoff = parseFloat(stat.dropoffRate);

                      return (
                        <tr key={idx} className="hover:bg-white/5 transition-colors">
                          <td className="px-4 py-3 text-gray-300 font-medium">{dateStr}</td>
                          <td className="px-4 py-3 text-center">
                            <span className="px-2 py-1 rounded-full bg-blue-500/20 text-blue-300 text-xs font-semibold">
                              {stat.reach}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <div className="flex items-center justify-center gap-2">
                              <div className="w-16 h-1.5 bg-white/10 rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-gradient-to-r from-green-400 to-emerald-500"
                                  style={{ width: `${Math.min(completion, 100)}%` }}
                                />
                              </div>
                              <span className="text-green-300 font-semibold text-xs w-10 text-right">
                                {stat.completionRate}%
                              </span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <div className="flex items-center justify-center gap-2">
                              <div className="w-16 h-1.5 bg-white/10 rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-gradient-to-r from-red-400 to-orange-500"
                                  style={{ width: `${Math.min(dropoff, 100)}%` }}
                                />
                              </div>
                              <span className="text-red-300 font-semibold text-xs w-10 text-right">
                                {stat.dropoffRate}%
                              </span>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>

            {/* Footer */}
            <div className="shrink-0 border-t border-white/10 px-6 py-3 flex justify-end">
              <button
                onClick={() => setShowDailyOverview(false)}
                className="text-xs px-4 py-2 bg-green-500/20 text-green-300 rounded font-semibold hover:bg-green-500/30 transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
