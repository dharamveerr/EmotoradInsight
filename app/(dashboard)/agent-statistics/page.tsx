"use client";

import { useState } from "react";
import useSWR from "swr";
import Topbar from "@/components/Topbar";
import TypewriterLoader from "@/components/TypewriterLoader";
import DateRangePicker from "@/components/DatePicker";
import ResetButton from "@/components/ResetButton";
import { usePersistentState, useReadyAfterMount } from "@/lib/usePersistentState";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

// Local YYYY-MM-DD (avoids UTC off-by-one from toISOString).
const toLocalDateString = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

type Summary = {
  agent_name: string;
  total_assignment: number;
  open: number;
  user_replies: number;
  agent_replies: number;
};
type Totals = { agents: number; total_assignment: number; open: number; user_replies: number; agent_replies: number };
type Row = {
  id: string;
  agent_name: string | null;
  customer_contact: string | null;
  campaign_id: string | null;
  is_customer_replied: number;
  customer_last_reply: string | null;
  customer_last_reply_at: string | null;
  is_agent_replied: number;
  agent_last_reply: string | null;
  agent_last_reply_at: string | null;
  source_created_at: string | null;
};

const AGENT_COLORS = ["#22c55e", "#3b82f6", "#f59e0b", "#a855f7", "#ef4444", "#14b8a6"];

// "Jun 20, 2026 6:44 PM" — null/empty → N/A.
function fmtDateTime(v: string | null): string {
  if (!v) return "N/A";
  const d = new Date(v);
  if (isNaN(d.getTime())) return v;
  return d.toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}

function YesNo({ v }: { v: number }) {
  return v
    ? <span className="inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">Yes</span>
    : <span className="inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold bg-sky-500/20 text-sky-300 border border-sky-500/30">No</span>;
}

function KpiCard({ label, value, sub, icon, gradient, delay }: {
  label: string; value: string | number; sub?: string; icon: React.ReactNode; gradient: string; delay: string;
}) {
  return (
    <div className={`glass glass-hover rounded-2xl p-5 animate-fade-in ${delay} relative overflow-hidden`}>
      <div className={`absolute -top-8 -right-8 w-24 h-24 rounded-full ${gradient} opacity-20 blur-2xl`} />
      <div className="flex items-start justify-between relative">
        <div>
          <p className="text-sm text-gray-400 font-medium">{label}</p>
          <p className="text-3xl sm:text-4xl font-bold text-white mt-2 animate-count">{value}</p>
          {sub && <p className="text-xs text-gray-500 mt-1.5">{sub}</p>}
        </div>
        <div className={`w-11 h-11 rounded-xl ${gradient} flex items-center justify-center text-white shadow-lg`}>
          {icon}
        </div>
      </div>
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="glass rounded-lg px-3 py-2 border border-white/20 shadow-xl">
      <p className="text-xs text-gray-300 font-semibold mb-1">{label}</p>
      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
      {payload.map((p: any) => (
        <p key={p.dataKey} className="text-xs" style={{ color: p.fill || p.color }}>
          {p.name}: <span className="font-bold">{p.value}</span>
        </p>
      ))}
    </div>
  );
}

export default function AgentStatisticsPage() {
  const today = toLocalDateString();
  // Default window: last 30 days, so the view isn't empty on first load.
  const defFrom = toLocalDateString(new Date(Date.now() - 29 * 86400000));
  const [fromDate, setFromDate, resetFrom] = usePersistentState("filter:agent-stats:from", defFrom);
  const [toDate, setToDate, resetTo] = usePersistentState("filter:agent-stats:to", today);
  // "All time" bypasses the date range entirely — the API returns every row
  // for the client when from/to are omitted.
  const [allTime, setAllTime, resetAllTime] = usePersistentState("filter:agent-stats:all-time", false);
  const isFiltered = fromDate !== defFrom || toDate !== today || allTime;
  function resetRange() { resetFrom(); resetTo(); resetAllTime(); }
  // Gate the fetch until persisted filters have loaded — avoids a wasted
  // first fetch with default filters immediately followed by a real one.
  const ready = useReadyAfterMount();

  const { data, isLoading: fetchLoading, mutate } = useSWR<{ summary: Summary[]; totals: Totals; rows: Row[] }>(
    ready ? (allTime ? "/api/agent-stats" : `/api/agent-stats?from=${fromDate}&to=${toDate}`) : null,
    fetcher,
    { refreshInterval: 120000 }
  );
  const isLoading = !ready || fetchLoading;
  const [syncing, setSyncing] = useState(false);
  const [detailSearch, setDetailSearch] = useState("");
  const [page, setPage] = useState(0);
  const PER_PAGE = 10;
  const [syncMsg, setSyncMsg] = useState("");
  const [syncErr, setSyncErr] = useState(false);

  const summary = data?.summary || [];
  const totals = data?.totals || { agents: 0, total_assignment: 0, open: 0, user_replies: 0, agent_replies: 0 };
  const rows = data?.rows || [];

  const q = detailSearch.trim().toLowerCase();
  const filteredRows = q
    ? rows.filter((r) =>
        [r.agent_name, r.customer_contact, r.campaign_id, r.customer_last_reply, r.agent_last_reply]
          .some((f) => (f || "").toLowerCase().includes(q))
      )
    : rows;
  const pageCount = Math.max(1, Math.ceil(filteredRows.length / PER_PAGE));
  const safePage = Math.min(page, pageCount - 1);
  const pagedRows = filteredRows.slice(safePage * PER_PAGE, safePage * PER_PAGE + PER_PAGE);

  async function handleSync() {
    setSyncing(true);
    setSyncMsg("");
    try {
      const res = await fetch("/api/agent-stats/sync", { method: "POST" });
      const d = await res.json();
      if (!res.ok) { setSyncErr(true); setSyncMsg(d.error || "Sync failed"); return; }
      setSyncErr(false);
      setSyncMsg("Syncing from source… refreshing shortly");
      setTimeout(() => { mutate(); setSyncMsg(""); }, 6000);
    } catch {
      setSyncErr(true); setSyncMsg("Sync failed");
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <Topbar title="Agent Statistics" subtitle="Per-agent assignments and reply activity" />
      <TypewriterLoader isLoading={isLoading} messages={["Loading agent data...", "Counting assignments...", "Tallying replies...", "Almost ready..."]} />
      <main className="flex-1 overflow-auto p-4 sm:p-6 lg:p-7 space-y-6">
        {/* Controls — date range on the left, sync on the right */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3 flex-wrap">
            <div className={allTime ? "opacity-40 pointer-events-none" : ""}>
              <DateRangePicker
                from={fromDate}
                to={toDate}
                max={today}
                onChange={(f, t) => { setFromDate(f); setToDate(t); }}
              />
            </div>
            <button
              onClick={() => setAllTime(!allTime)}
              className={`text-sm px-4 py-2 rounded-lg border transition-colors cursor-pointer font-semibold ${
                allTime
                  ? "bg-green-500/20 text-green-300 border-green-500/40"
                  : "bg-white/10 text-gray-300 border-white/10 hover:bg-white/15"
              }`}
            >
              ⏳ All Time
            </button>
            <ResetButton show={isFiltered} onClick={resetRange} />
            <span className="text-xs text-gray-500">
              {allTime ? "Showing all-time data" : fromDate === toDate ? `Showing ${fromDate}` : `${fromDate} → ${toDate}`}
            </span>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            {syncMsg && (
              <span className={`text-xs font-medium px-3 py-1.5 rounded-lg border ${syncErr ? "text-amber-300 bg-amber-500/10 border-amber-500/30" : "text-emerald-300 bg-emerald-500/10 border-emerald-500/30"}`}>
                {syncErr ? "⚠ " : "✓ "}{syncMsg}
              </span>
            )}
            <button
              onClick={handleSync}
              disabled={syncing}
              className="text-sm px-4 py-2 bg-green-500/20 text-green-300 border border-green-500/30 rounded-lg hover:bg-green-500/30 transition-colors disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed font-semibold"
            >
              {syncing ? "⏳ Syncing…" : "🔄 Sync"}
            </button>
          </div>
        </div>

        {/* KPI cards */}
        {isLoading ? (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-5">
            {[0, 1, 2, 3].map((i) => <div key={i} className="skeleton rounded-2xl h-32" />)}
          </div>
        ) : (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-5">
            <KpiCard label="Agents" value={totals.agents} sub="Active agents" delay="delay-1"
              gradient="bg-gradient-to-br from-green-500 to-emerald-600"
              icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>} />
            <KpiCard label="Total Assignments" value={totals.total_assignment} sub="Conversations assigned" delay="delay-2"
              gradient="bg-gradient-to-br from-blue-500 to-cyan-600"
              icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5"><path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></svg>} />
            <KpiCard label="User Replies" value={totals.user_replies} sub="Customers who replied" delay="delay-3"
              gradient="bg-gradient-to-br from-emerald-500 to-teal-600"
              icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>} />
            <KpiCard label="Agent Replies" value={totals.agent_replies} sub="Agents who replied" delay="delay-4"
              gradient="bg-gradient-to-br from-orange-500 to-red-600"
              icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5"><path d="M14 9V5a3 3 0 0 0-6 0v4" /><rect x="2" y="9" width="20" height="12" rx="2" /></svg>} />
          </div>
        )}

        {summary.length === 0 && !isLoading && (
          <div className="glass rounded-2xl p-4 text-center text-gray-500 text-sm">
            No agent data yet. Click <span className="text-green-400 font-semibold">Sync</span> to pull the latest from the source.
          </div>
        )}
        {!isLoading && (
          <>
            {/* Charts */}
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
              <div className="glass rounded-2xl p-6 animate-fade-in">
                <h2 className="font-bold text-white mb-1">Assignments per Agent</h2>
                <p className="text-xs text-gray-500 mb-4">Conversations assigned to each agent</p>
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={summary}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                    <XAxis dataKey="agent_name" tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} />
                    <Tooltip content={<ChartTooltip />} cursor={{ fill: "rgba(255,255,255,0.03)" }} />
                    <Bar dataKey="total_assignment" name="Assignments" radius={[6, 6, 0, 0]} fill="#3b82f6" />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div className="glass rounded-2xl p-6 animate-fade-in">
                <h2 className="font-bold text-white mb-1">Replies per Agent</h2>
                <p className="text-xs text-gray-500 mb-4">User vs agent replies</p>
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={summary}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                    <XAxis dataKey="agent_name" tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} />
                    <Tooltip content={<ChartTooltip />} cursor={{ fill: "rgba(255,255,255,0.03)" }} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar dataKey="user_replies" name="User replies" radius={[6, 6, 0, 0]} fill="#22c55e" />
                    <Bar dataKey="agent_replies" name="Agent replies" radius={[6, 6, 0, 0]} fill="#f59e0b" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Per-agent cards */}
            <div>
              <h2 className="text-xl font-bold text-white mb-5">Per-Agent Breakdown</h2>
              {summary.length === 0 && (
                <div className="glass rounded-2xl p-8 text-center text-gray-500 text-sm">No agents for this range</div>
              )}
              {summary.length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5">
                  {summary.map((a, idx) => {
                    const color = AGENT_COLORS[idx % AGENT_COLORS.length];
                    return (
                      <div key={a.agent_name} className="glass rounded-2xl p-6 animate-fade-in" style={{ animationDelay: `${idx * 0.08}s` }}>
                        <div className="flex items-center gap-3 mb-4">
                          <div className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm shrink-0" style={{ background: color }}>
                            {a.agent_name.charAt(0).toUpperCase()}
                          </div>
                          <h3 className="font-bold text-white text-lg truncate">{a.agent_name}</h3>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <Stat label="Assignments" value={a.total_assignment} />
                          <Stat label="Open" value={a.open} />
                          <Stat label="User Replies" value={a.user_replies} />
                          <Stat label="Agent Replies" value={a.agent_replies} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Detailed report — per-conversation rows */}
            <div>
              <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
                <h2 className="text-xl font-bold text-white">Detailed Report</h2>
                <input
                  type="text"
                  value={detailSearch}
                  onChange={(e) => { setDetailSearch(e.target.value); setPage(0); }}
                  placeholder="Search agent, contact, reply…"
                  className="bg-white/10 border border-white/10 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-green-500/40 w-full sm:w-72"
                />
              </div>
              <div className="glass rounded-2xl overflow-x-auto">
                <table className="w-full text-sm min-w-[1100px]">
                  <thead className="bg-white/5 border-b border-white/10">
                    <tr>
                      {["Agent Name","Customer Contact","Campaign ID","Is Customer Replied","Customer Last Reply","Customer Last Reply Time","Is Agent Replied","Agent Last Reply","Agent Last Reply Time","Created At"].map((h) => (
                        <th key={h} className="text-left px-5 py-3.5 text-gray-400 font-semibold whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {pagedRows.length === 0 ? (
                      <tr><td colSpan={10} className="px-5 py-8 text-center text-gray-500">No conversations</td></tr>
                    ) : pagedRows.map((r) => (
                      <tr key={r.id} className="hover:bg-white/5 transition-colors">
                        <td className="px-5 py-3 font-medium text-gray-200 whitespace-nowrap">{r.agent_name || "N/A"}</td>
                        <td className="px-5 py-3 text-gray-300 whitespace-nowrap">{r.customer_contact || "N/A"}</td>
                        <td className="px-5 py-3 text-gray-400 whitespace-nowrap">{r.campaign_id || "N/A"}</td>
                        <td className="px-5 py-3"><YesNo v={r.is_customer_replied} /></td>
                        <td className="px-5 py-3 text-gray-300 max-w-[200px] truncate" title={r.customer_last_reply || ""}>{r.customer_last_reply || "N/A"}</td>
                        <td className="px-5 py-3 text-gray-400 whitespace-nowrap">{fmtDateTime(r.customer_last_reply_at)}</td>
                        <td className="px-5 py-3"><YesNo v={r.is_agent_replied} /></td>
                        <td className="px-5 py-3 text-gray-300 max-w-[200px] truncate" title={r.agent_last_reply || ""}>{r.agent_last_reply || "N/A"}</td>
                        <td className="px-5 py-3 text-gray-400 whitespace-nowrap">{fmtDateTime(r.agent_last_reply_at)}</td>
                        <td className="px-5 py-3 text-gray-400 whitespace-nowrap">{fmtDateTime(r.source_created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {/* Pagination */}
              <div className="flex items-center justify-end gap-4 mt-3 text-sm text-gray-400">
                <span>
                  {filteredRows.length === 0 ? "0" : `${safePage * PER_PAGE + 1}-${Math.min((safePage + 1) * PER_PAGE, filteredRows.length)}`} of {filteredRows.length}
                </span>
                <div className="flex items-center gap-1">
                  <button onClick={() => setPage(0)} disabled={safePage === 0} className="px-2 py-1 rounded hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed">⏮</button>
                  <button onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={safePage === 0} className="px-2 py-1 rounded hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed">‹</button>
                  <span className="px-2">Page {safePage + 1} / {pageCount}</span>
                  <button onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))} disabled={safePage >= pageCount - 1} className="px-2 py-1 rounded hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed">›</button>
                  <button onClick={() => setPage(pageCount - 1)} disabled={safePage >= pageCount - 1} className="px-2 py-1 rounded hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed">⏭</button>
                </div>
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-white/5 rounded-xl px-3 py-2.5">
      <p className="text-xs text-gray-400">{label}</p>
      <p className="text-2xl font-bold text-white mt-0.5">{value}</p>
    </div>
  );
}
