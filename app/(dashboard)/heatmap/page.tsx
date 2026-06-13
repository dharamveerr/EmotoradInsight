"use client";

import useSWR from "swr";
import { usePersistentState } from "@/lib/usePersistentState";
import ResetButton from "@/components/ResetButton";
import Topbar from "@/components/Topbar";
import SelectGlass from "@/components/SelectGlass";
import DateRangePicker from "@/components/DatePicker";
import { useJourneyConfig } from "@/lib/useJourneyConfig";
import TypewriterLoader from "@/components/TypewriterLoader";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const HOURS = Array.from({ length: 24 }, (_, i) => i);

function getColor(value: number, max: number): string {
  if (max === 0 || value === 0) return "var(--heat-empty)";
  const intensity = value / max;
  return `rgba(34,197,94,${0.15 + intensity * 0.85})`;
}

const toLocalDate = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; };

export default function HeatmapPage() {
  const today = toLocalDate();
  const { labels: JOURNEY_LABELS, steps: JOURNEY_STEPS } = useJourneyConfig();
  const [journey, setJourney, resetJourney] = usePersistentState("filter:heatmap:journey", "");
  const [fromDate, setFromDate, resetFrom] = usePersistentState("filter:heatmap:from", "");
  const [toDate,   setToDate,   resetTo]   = usePersistentState("filter:heatmap:to",   "");
  const isDateFiltered = !!(fromDate && toDate);
  const isFiltered = journey !== "" || isDateFiltered;
  function resetAll() { resetJourney(); resetFrom(); resetTo(); }

  const url = `/api/insights?type=heatmap${journey ? `&journey=${journey}` : ""}${fromDate && toDate ? `&from=${fromDate}&to=${toDate}` : ""}`;
  const { data, isLoading } = useSWR(url, fetcher);

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

  return (
    <div className="flex-1 flex flex-col overflow-auto">
      <Topbar title="Time-of-Day Heatmap" subtitle="When your users are most active" />
      <TypewriterLoader isLoading={isLoading} messages={["Loading activity data...", "Mapping peak hours...", "Building heatmap grid...", "Almost done..."]} />
      <main className="flex-1 p-7 space-y-6">
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
          <DateRangePicker from={fromDate} to={toDate} max={today} onChange={(f, t) => { setFromDate(f); setToDate(t); }} />
          <ResetButton show={isFiltered} onClick={resetAll} />
        </div>

        {isLoading ? (
          <div className="skeleton rounded-2xl h-80" />
        ) : (
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
        )}
      </main>
    </div>
  );
}
