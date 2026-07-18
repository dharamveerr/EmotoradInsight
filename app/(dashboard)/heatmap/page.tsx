"use client";

import useSWR from "swr";
import { usePersistentState, useReadyAfterMount } from "@/lib/usePersistentState";
import ResetButton from "@/components/ResetButton";
import Topbar from "@/components/Topbar";
import SelectGlass from "@/components/SelectGlass";
import DateRangePicker from "@/components/DatePicker";
import { useJourneyConfig } from "@/lib/useJourneyConfig";
import TypewriterLoader from "@/components/TypewriterLoader";
import DataRangeBadge, { useFetchedRange } from "@/components/DataRangeBadge";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const HOURS = Array.from({ length: 24 }, (_, i) => i);

function getColor(value: number, max: number): string {
  if (max === 0 || value === 0) return "var(--heat-empty)";
  const intensity = value / max;
  return `rgba(34,197,94,${0.15 + intensity * 0.85})`;
}

const toLocalDate = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; };

const formatHour = (h: number) => {
  const period = h < 12 ? "AM" : "PM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}${period}`;
};

export default function HeatmapPage() {
  const today = toLocalDate();
  const fetched = useFetchedRange();
  const { labels: JOURNEY_LABELS, steps: JOURNEY_STEPS } = useJourneyConfig();
  const [journey, setJourney, resetJourney] = usePersistentState("filter:heatmap:journey", "");
  // Shared with Overview/Insights/Drop-off/MIS — one range across report pages.
  const [fromDate, setFromDate, resetFrom] = usePersistentState("filter:shared:from", "");
  const [toDate,   setToDate,   resetTo]   = usePersistentState("filter:shared:to",   "");
  const isDateFiltered = !!(fromDate && toDate);
  const isFiltered = journey !== "" || isDateFiltered;
  function resetAll() { resetJourney(); resetFrom(); resetTo(); }
  // Gate the fetch until persisted filters have loaded — avoids a wasted
  // first fetch with default (wrong) filters immediately followed by a real one.
  const ready = useReadyAfterMount();

  const url = `/api/insights?type=heatmap${journey ? `&journey=${journey}` : ""}${fromDate && toDate ? `&from=${fromDate}&to=${toDate}` : ""}`;
  const { data, isLoading: fetchLoading } = useSWR(ready ? url : null, fetcher);
  const isLoading = !ready || fetchLoading;

  const cells: { day: number; hour: number; count: number }[] = data?.heatmap || [];

  // Initialize grid safely - create new arrays for each row
  const grid: number[][] = [];
  for (let i = 0; i < 7; i++) {
    grid[i] = new Array(24).fill(0);
  }

  // Populate grid with data
  cells.forEach(({ day, hour, count }: any) => {
    if (typeof day === 'number' && typeof hour === 'number' && day >= 0 && day < 7 && hour >= 0 && hour < 24) {
      grid[day][hour] = count || 0;
    }
  });
  
  const maxVal = cells.length > 0 ? Math.max(...cells.map((c: any) => c.count || 0), 1) : 1;

  // Peak = highest-activity slot; Quietest = lowest-activity slot among slots
  // that had any activity at all (an all-zero slot isn't "reached").
  const activeCells = cells.filter((c) => (c.count || 0) > 0);
  const peakCell = activeCells.length
    ? activeCells.reduce((best, c) => (c.count > best.count ? c : best))
    : null;
  const quietCell = activeCells.length
    ? activeCells.reduce((worst, c) => (c.count < worst.count ? c : worst))
    : null;
  const cellLabel = (c: { day: number; hour: number }) => `${DAYS[c.day]}, ${formatHour(c.hour)}`;

  // Chart summaries of the same grid: total events per hour (across all days)
  // and per weekday (across all hours).
  const byHour = HOURS.map((h) => ({ hour: h, count: grid.reduce((s, row) => s + (row[h] || 0), 0) }));
  const byDay = DAYS.map((day, d) => ({ day, count: grid[d].reduce((s, c) => s + c, 0) }));

  return (
    <div className="flex-1 flex flex-col overflow-auto">
      <Topbar title="Time-of-Day Heatmap" subtitle="When your users are most active" />
      <TypewriterLoader isLoading={isLoading} messages={["Loading activity data...", "Mapping peak hours...", "Building heatmap grid...", "Almost done..."]} />
      <main className="flex-1 overflow-auto p-4 sm:p-6 lg:p-7 space-y-6">
        <div className="flex items-center gap-4 mb-4 flex-wrap">
          <label className="text-sm font-medium text-gray-400 whitespace-nowrap">Select Journey</label>
          <SelectGlass
            value={journey}
            onChange={setJourney}
            options={[
              { value: "", label: "All Journeys" },
              ...Object.keys(JOURNEY_STEPS).map((k) => ({ value: k, label: JOURNEY_LABELS[k] || k })),
            ]}
          />
          <DateRangePicker from={fromDate} to={toDate} min={fetched?.from} max={fetched?.to || today} onChange={(f, t) => { setFromDate(f); setToDate(t); }} />
          <ResetButton show={isFiltered} onClick={resetAll} />
          <DataRangeBadge />
        </div>

        {isLoading ? (
          <div className="skeleton rounded-2xl h-80" />
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 animate-fade-in">
              <div className="glass rounded-2xl p-5 flex items-center gap-4">
                <div className="w-11 h-11 rounded-xl bg-green-500/15 flex items-center justify-center shrink-0">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5 text-green-400">
                    <path d="M13 2 3 14h7l-1 8 10-12h-7z" />
                  </svg>
                </div>
                <div>
                  <p className="text-xs text-gray-500 font-medium">Peak Activity</p>
                  <p className="text-lg font-bold text-white">{peakCell ? cellLabel(peakCell) : "—"}</p>
                  <p className="text-xs text-gray-500">{peakCell ? `${peakCell.count} events` : "No data"}</p>
                </div>
              </div>
              <div className="glass rounded-2xl p-5 flex items-center gap-4">
                <div className="w-11 h-11 rounded-xl bg-slate-500/15 flex items-center justify-center shrink-0">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5 text-slate-400">
                    <circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" />
                  </svg>
                </div>
                <div>
                  <p className="text-xs text-gray-500 font-medium">Quietest Active Time</p>
                  <p className="text-lg font-bold text-white">{quietCell ? cellLabel(quietCell) : "—"}</p>
                  <p className="text-xs text-gray-500">{quietCell ? `${quietCell.count} events` : "No data"}</p>
                </div>
              </div>
            </div>

            <div className="glass rounded-2xl p-6 overflow-x-auto animate-fade-in delay-1">
            <h2 className="font-bold text-white mb-5">Activity by Day &amp; Hour</h2>
            <div className="min-w-[720px]">
              <div className="flex ml-12 mb-1.5">
                {HOURS.map((h) => (
                  <div key={h} className="flex-1 text-center text-xs text-gray-600">
                    {h % 3 === 0 ? `${h}h` : ""}
                  </div>
                ))}
              </div>
              {DAYS.map((day, d) => (
                <div key={day} className="flex items-center mb-1.5">
                  <span className="w-10 text-xs text-gray-500 text-right mr-2 font-medium">{day}</span>
                  {HOURS.map((h) => {
                    const count = grid[d]?.[h] || 0;
                    return (
                      <div
                        key={h}
                        title={`${day} ${h}:00 — ${count} events`}
                        className="flex-1 h-7 rounded-md mx-0.5 cursor-default transition-all hover:scale-125 hover:ring-2 hover:ring-green-400/50"
                        style={{ backgroundColor: getColor(count, maxVal) }}
                      />
                    );
                  })}
                </div>
              ))}
            </div>
            <div className="flex items-center gap-2 mt-5">
              <span className="text-xs text-gray-500">Less</span>
              <div className="flex gap-1">
                {[0, 0.25, 0.5, 0.75, 1].map((v) => (
                  <div key={v} className="w-7 h-4 rounded-md" style={{ backgroundColor: getColor(v * maxVal, maxVal) }} />
                ))}
              </div>
              <span className="text-xs text-gray-500">More</span>
            </div>
            </div>

            <div className="glass rounded-2xl p-6 animate-fade-in delay-2">
              <h2 className="font-bold text-white mb-5">Activity by Hour</h2>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={byHour}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis dataKey="hour" tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} tickFormatter={(h) => formatHour(Number(h))} />
                  <YAxis tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} />
                  <Tooltip labelFormatter={(h) => formatHour(Number(h))} contentStyle={{ background: "#0f1a2a", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8 }} />
                  <Line type="monotone" dataKey="count" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>

            <div className="glass rounded-2xl p-6 animate-fade-in delay-3">
              <h2 className="font-bold text-white mb-5">Activity by Day</h2>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={byDay}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis dataKey="day" tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} />
                  <Tooltip cursor={{ fill: "rgba(255,255,255,0.03)" }} contentStyle={{ background: "#0f1a2a", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8 }} />
                  <Bar dataKey="count" fill="#22c55e" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
