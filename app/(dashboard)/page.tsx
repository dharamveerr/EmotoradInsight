"use client";

import useSWR from "swr";
import { usePersistentState } from "@/lib/usePersistentState";
import ResetButton from "@/components/ResetButton";
import Topbar from "@/components/Topbar";
import DataRangeBadge, { useFetchedRange } from "@/components/DataRangeBadge";
import DateRangePicker from "@/components/DatePicker";
import { useJourneyConfig } from "@/lib/useJourneyConfig";
import TypewriterLoader from "@/components/TypewriterLoader";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

const PIE_COLORS = ["#22c55e", "#3b82f6", "#f59e0b", "#ef4444", "#a855f7"];

const toLocalDateString = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

type KpiProps = {
  label: string;
  value: string | number;
  sub?: string;
  icon: React.ReactNode;
  gradient: string;
  delay: string;
};

function KpiCard({ label, value, sub, icon, gradient, delay }: KpiProps) {
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

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="glass rounded-lg px-3 py-2 border border-white/20 shadow-xl">
      <p className="text-xs text-gray-400">{label}</p>
      <p className="text-sm font-bold text-green-400">{payload[0].value} count</p>
    </div>
  );
}

export default function OverviewPage() {
  const today = toLocalDateString();
  const fetched = useFetchedRange();
  const { labels: JOURNEY_LABELS } = useJourneyConfig();
  const [fromDate, setFromDate, resetFrom] = usePersistentState("filter:overview:from", "");
  const [toDate, setToDate, resetTo] = usePersistentState("filter:overview:to", "");
  const isDateFiltered = !!(fromDate || toDate);
  function resetDateFilter() { resetFrom(); resetTo(); }

  const { data, isLoading } = useSWR(
    `/api/insights?type=overview&from=${fromDate}&to=${toDate}`,
    fetcher,
    { refreshInterval: 30000 }
  );

  const journeyBreakdown = data?.journeyBreakdown || [];
  const noJourneysLive = !isLoading && Object.keys(JOURNEY_LABELS).length === 0;
  const isSingleDay = fromDate && toDate && fromDate === toDate;

  // Avg/day: days in selected range (or data span when no filter).
  const last7Days: { date: string; count: number }[] = data?.last7Days || [];
  const uniqueUsers: number = data?.todaySessions ?? 0;
  const rangeDays = fromDate && toDate
    ? Math.max(1, Math.round((new Date(toDate).getTime() - new Date(fromDate).getTime()) / 86400000) + 1)
    : Math.max(1, last7Days.length);
  const avgPerDay = rangeDays > 0 ? Math.round(uniqueUsers / rangeDays) : 0;

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <Topbar title="Overview" subtitle="Real-time chatbot performance at a glance" />
      <TypewriterLoader isLoading={isLoading} messages={["Fetching chatbot metrics...", "Counting active sessions...", "Building today's overview...", "Almost ready..."]} />
      <main className="flex-1 overflow-auto p-4 sm:p-6 lg:p-7 space-y-6">
        {/* Date Picker */}
        <div className="flex items-center gap-3 flex-wrap">
          <DateRangePicker
            from={fromDate}
            to={toDate}
            min={fetched?.from}
            max={fetched?.to || today}
            onChange={(f, t) => { setFromDate(f); setToDate(t); }}
          />
          <ResetButton show={isDateFiltered} onClick={resetDateFilter} />
          <span className="text-xs text-gray-500">
            {!fromDate && !toDate ? "Showing all available data" : isSingleDay ? `Showing data for ${fromDate}` : `${fromDate} to ${toDate}`}
          </span>
          <DataRangeBadge />
        </div>
        {/* Top KPIs — unique users / avg-per-day come straight from raw
            fetched events, not the published tree, so these always show. */}
        {isLoading ? (
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-5">
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="skeleton rounded-2xl h-32" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-5">
            <KpiCard
              label="Unique Users"
              value={uniqueUsers}
              sub="deduplicated by phone"
              gradient="bg-gradient-to-br from-green-500 to-emerald-600"
              delay="delay-1"
              icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5"><circle cx="9" cy="7" r="4"/><path d="M3 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/><path d="M21 21v-2a4 4 0 0 0-3-3.87"/></svg>}
            />
            <KpiCard
              label="Avg / Day"
              value={avgPerDay}
              sub={`over ${rangeDays} day${rangeDays !== 1 ? "s" : ""}`}
              gradient="bg-gradient-to-br from-violet-500 to-purple-600"
              delay="delay-2"
              icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5"><rect x="3" y="3" width="4" height="18" rx="1"/><rect x="10" y="8" width="4" height="13" rx="1"/><rect x="17" y="5" width="4" height="16" rx="1"/></svg>}
            />
            <KpiCard
              label="Active Journeys"
              value={data?.activeJourneys ?? 0}
              sub={noJourneysLive ? "No tree published" : "In published tree"}
              gradient="bg-gradient-to-br from-blue-500 to-cyan-600"
              delay="delay-3"
              icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5"><path d="M3 4h18l-7 8v6l-4 2v-8z" /></svg>}
            />
            <KpiCard
              label="Completion Rate"
              value={noJourneysLive ? "—" : `${data?.completionRate ?? 0}%`}
              sub="Users who finished"
              gradient="bg-gradient-to-br from-emerald-500 to-teal-600"
              delay="delay-4"
              icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5"><path d="M20 6L9 17l-5-5" /></svg>}
            />
            <KpiCard
              label="Drop-off Rate"
              value={noJourneysLive ? "—" : `${data?.dropoffRate ?? 0}%`}
              sub="Users who abandoned"
              gradient="bg-gradient-to-br from-orange-500 to-red-600"
              delay="delay-5"
              icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5"><path d="M3 3v18h18" /><path d="M19 15l-5 5-4-4-3 3" /></svg>}
            />
          </div>
        )}

        {/* Sessions Trend — also tree-independent, always shows. */}
        <div className="glass rounded-2xl p-6 animate-fade-in delay-3">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="font-bold text-white">Chatbot Reach</h2>
              <p className="text-xs text-gray-500">{fromDate === toDate ? fromDate : `${fromDate} – ${toDate}`}</p>
            </div>
            <span className="text-xs px-2.5 py-1 rounded-full bg-green-500/10 text-green-400 border border-green-500/20">Live</span>
          </div>
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={data?.last7Days || []}>
              <defs>
                <linearGradient id="grad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#22c55e" stopOpacity={0.4} />
                  <stop offset="100%" stopColor="#22c55e" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} />
              <Tooltip content={<CustomTooltip />} />
              <Area type="monotone" dataKey="count" stroke="#22c55e" strokeWidth={2.5} fill="url(#grad)" dot={{ r: 4, fill: "#22c55e", strokeWidth: 0 }} activeDot={{ r: 6, fill: "#22c55e" }} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Per-Journey Breakdown — genuinely depends on a published tree. */}
        <div>
          <h2 className="text-xl font-bold text-white mb-5">Journey Performance</h2>
          {noJourneysLive ? (
            <div className="glass rounded-2xl flex flex-col items-center justify-center py-14 animate-fade-in">
              <div className="w-14 h-14 rounded-full bg-white/5 flex items-center justify-center mb-4">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-7 h-7 text-gray-500">
                  <path d="M3 3v18h18" />
                  <path d="M7 16l4-4 4 4 4-6" />
                </svg>
              </div>
              <h3 className="text-base font-semibold text-white mb-1">No journey tree published</h3>
              <p className="text-sm text-gray-500 text-center max-w-xs">Publish a journey tree for this client to see per-journey funnel performance here.</p>
            </div>
          ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-5">
            {isLoading ? (
              [0, 1, 2].map((i) => (
                <div key={i} className="skeleton rounded-2xl h-48" />
              ))
            ) : journeyBreakdown.length > 0 ? (
              journeyBreakdown.map((j: any, idx: number) => (
                <div key={j.journey} className={`glass rounded-2xl p-6 animate-fade-in`} style={{ animationDelay: `${idx * 0.1}s` }}>
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <h3 className="font-bold text-white text-lg">{JOURNEY_LABELS[j.journey] || j.journey}</h3>
                      <p className="text-xs text-gray-500 mt-1">Funnel conversion</p>
                    </div>
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center text-white text-lg`}
                      style={{ background: `${PIE_COLORS[idx % PIE_COLORS.length]}40` }}>
                      {["📱", "🚗", "🎫", "🏪", "💰"][idx % 5]}
                    </div>
                  </div>
                  
                  <div className="space-y-3">
                    <div>
                      <div className="flex justify-between text-xs text-gray-400 mb-1.5">
                        <span>Entry</span>
                        <span className="text-green-400 font-bold">{j.entries}</span>
                      </div>
                      <div className="h-6 bg-white/5 rounded-lg overflow-hidden">
                        <div className="h-full w-full rounded-lg bg-gradient-to-r from-green-500 to-emerald-600" />
                      </div>
                    </div>

                    <div>
                      <div className="flex justify-between text-xs text-gray-400 mb-1.5">
                        <span>Completed</span>
                        <span className="text-blue-400 font-bold">{j.completed}</span>
                      </div>
                      <div className="h-6 bg-white/5 rounded-lg overflow-hidden">
                        <div
                          className="h-full rounded-lg bg-gradient-to-r from-blue-500 to-cyan-600"
                          style={{ width: j.entries > 0 ? `${(j.completed / j.entries) * 100}%` : "0%" }}
                        />
                      </div>
                    </div>

                    <div className="pt-2 border-t border-white/10">
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-gray-400">Conversion</span>
                        <span className={`text-2xl font-bold ${j.conversionRate >= 50 ? 'text-green-400' : j.conversionRate >= 30 ? 'text-yellow-400' : 'text-red-400'}`}>
                          {j.conversionRate}%
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="col-span-full text-center py-10 text-gray-500">No journey data</div>
            )}
          </div>
          )}
        </div>
      </main>
    </div>
  );
}
