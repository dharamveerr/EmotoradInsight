"use client";

import useSWR from "swr";
import { usePersistentState } from "@/lib/usePersistentState";
import ResetButton from "@/components/ResetButton";
import Topbar from "@/components/Topbar";
import SelectGlass from "@/components/SelectGlass";
import DateRangePicker from "@/components/DatePicker";
import { useJourneyConfig } from "@/lib/useJourneyConfig";
import TypewriterLoader from "@/components/TypewriterLoader";
import DataRangeBadge, { useFetchedRange } from "@/components/DataRangeBadge";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
  LineChart, Line, Legend,
} from "recharts";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

const toLocalDate = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; };

export default function ProductInsightsPage() {
  const today = toLocalDate();
  const fetched = useFetchedRange();
  const { labels: JOURNEY_LABELS, steps: JOURNEY_STEPS } = useJourneyConfig();
  const journeyKeys = Object.keys(JOURNEY_STEPS);
  const [selectedJourney, setSelectedJourney, resetJourney] = usePersistentState("filter:product-insights:journey", "");
  const [fromDate, setFromDate, resetFrom] = usePersistentState("filter:product-insights:from", "");
  const [toDate,   setToDate,   resetTo]   = usePersistentState("filter:product-insights:to",   "");
  const isDateFiltered = !!(fromDate && toDate);
  const isFiltered = selectedJourney !== "" || isDateFiltered;
  function resetAll() { resetJourney(); resetFrom(); resetTo(); }

  const { data, isLoading } = useSWR(
    `/api/insights?type=product-analytics${selectedJourney ? `&journey=${selectedJourney}` : ""}${fromDate && toDate ? `&from=${fromDate}&to=${toDate}` : ""}`,
    fetcher,
    { refreshInterval: 30000 }
  );

  const byDate = data?.byDate || [];
  const byHour = data?.byHour || [];
  const funnel = data?.funnel || [];
  const kpis = data?.kpis || { uniqueUsers: 0, totalCount: 0, started: 0, completed: 0, dropped: 0 };

  // Days in selected range (inclusive). Falls back to days with actual data.
  const days = fromDate && toDate
    ? Math.max(1, Math.round((new Date(toDate).getTime() - new Date(fromDate).getTime()) / 86400000) + 1)
    : Math.max(1, byDate.length);

  // Total Entries   = unique mobile numbers (distinct users)
  // Average Entries = average of each day's unique-user count (same unit as
  // Total Entries) — NOT total interactions/days, which counts every step
  // event and so inflates far past what "entries" implies for multi-step journeys.
  // Drop-off        = users who started but never reached the final step
  // Conversion      = users who completed the final step
  const totalEntries = kpis.uniqueUsers;
  const sumDailyUniques = byDate.reduce((sum: number, d: { count: number }) => sum + Number(d.count), 0);
  const avgPerDay = Math.round(sumDailyUniques / days);
  const dropRate = kpis.started > 0 ? Math.round((kpis.dropped / kpis.started) * 100) : 0;
  const convRate = kpis.started > 0 ? Math.round((kpis.completed / kpis.started) * 100) : 0;

  return (
    <div className="flex-1 flex flex-col overflow-auto">
      <Topbar title="Journey Analytics" subtitle="Detailed analytics per journey" />
      <TypewriterLoader isLoading={isLoading} messages={["Fetching journey analytics...", "Calculating conversion funnel...", "Preparing product insights...", "Hang tight..."]} />
      <main className="flex-1 overflow-auto p-4 sm:p-6 lg:p-7 space-y-6">
        {/* Journey Selector */}
        <div className="flex items-center gap-4 mb-4 flex-wrap">
          <label className="text-sm font-medium text-gray-400 whitespace-nowrap">Select Journey</label>
          <SelectGlass
            value={selectedJourney}
            onChange={setSelectedJourney}
            options={[{ value: "", label: "All Journeys" }, ...journeyKeys.map((k) => ({ value: k, label: JOURNEY_LABELS[k] || k }))]}
          />
          <DateRangePicker from={fromDate} to={toDate} min={fetched?.from} max={fetched?.to || today} onChange={(f, t) => { setFromDate(f); setToDate(t); }} />
          <ResetButton show={isFiltered} onClick={resetAll} />
          <DataRangeBadge />
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-5">
          {[
            { label: "Total Entries", value: totalEntries, icon: "👥", sub: "unique mobiles" },
            { label: "Average Entries", value: avgPerDay, icon: "📊", sub: "avg / day" },
            { label: "Drop-off Rate", value: kpis.dropped, icon: "📉", sub: `${dropRate}% didn't finish` },
            { label: "Conversion Rate", value: kpis.completed, icon: "✅", sub: `${convRate}% completed` },
          ].map((kpi, i) => (
            <div key={i} className="glass rounded-2xl p-5 animate-fade-in">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm text-gray-400 font-medium">{kpi.label}</p>
                  <p className="text-3xl font-bold text-white mt-2">{kpi.value}</p>
                  {"sub" in kpi && <p className="text-xs text-gray-500 mt-1">{(kpi as { sub: string }).sub}</p>}
                </div>
                <span className="text-2xl">{kpi.icon}</span>
              </div>
            </div>
          ))}
        </div>

        {/* Trends */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="glass rounded-2xl p-6 animate-fade-in delay-1">
            <h2 className="font-bold text-white mb-5">Count by Date</h2>
            {isLoading ? (
              <div className="skeleton rounded-lg h-80" />
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={byDate}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ background: "#0f1a2a", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8 }} />
                  <Bar dataKey="count" fill="#22c55e" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          <div className="glass rounded-2xl p-6 animate-fade-in delay-2">
            <h2 className="font-bold text-white mb-5">Peak Hours (24h)</h2>
            {isLoading ? (
              <div className="skeleton rounded-lg h-80" />
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={byHour}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis dataKey="hour" tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ background: "#0f1a2a", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8 }} />
                  <Line type="monotone" dataKey="count" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

      </main>
    </div>
  );
}
