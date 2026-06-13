"use client";

import useSWR from "swr";
import { usePersistentState } from "@/lib/usePersistentState";
import ResetButton from "@/components/ResetButton";
import Topbar from "@/components/Topbar";
import DateRangePicker from "@/components/DatePicker";
import SelectGlass from "@/components/SelectGlass";
import { useJourneyConfig } from "@/lib/useJourneyConfig";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from "recharts";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

const toLocalDate = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; };

export default function JourneysPage() {
  const today = toLocalDate();
  const { labels: JOURNEY_LABELS, steps: JOURNEY_STEPS } = useJourneyConfig();
  const journeyKeys = Object.keys(JOURNEY_STEPS);
  const [selected, setSelected, resetSelected] = usePersistentState("filter:journeys:journey", "");
  const [fromDate, setFromDate, resetFrom] = usePersistentState("filter:journeys:from", "");
  const [toDate,   setToDate,   resetTo]   = usePersistentState("filter:journeys:to",   "");
  const isDateFiltered = !!(fromDate && toDate);
  const isFiltered = selected !== "" || isDateFiltered;
  function resetAll() { resetSelected(); resetFrom(); resetTo(); }

  const { data, isLoading } = useSWR(
    `/api/insights?type=funnel${selected ? `&journey=${selected}` : ""}${fromDate && toDate ? `&from=${fromDate}&to=${toDate}` : ""}`,
    fetcher
  );

  const funnel: { step: string; count: number }[] = data?.funnel || [];
  const maxCount = funnel[0]?.count || 1;

  return (
    <div className="flex-1 flex flex-col overflow-auto">
      <Topbar title="Journey Funnels" subtitle="Step-by-step conversion per journey" />
      <main className="flex-1 p-7 space-y-6">
        <div className="flex items-center gap-4 mb-4 flex-wrap">
          <label className="text-sm font-medium text-gray-400 whitespace-nowrap">Select Journey</label>
          <SelectGlass
            value={selected}
            onChange={setSelected}
            options={[{ value: "", label: "All Journeys" }, ...journeyKeys.map((k) => ({ value: k, label: JOURNEY_LABELS[k] || k }))]}
          />
          <DateRangePicker from={fromDate} to={toDate} max={today} onChange={(f, t) => { setFromDate(f); setToDate(t); }} />
          <ResetButton show={isFiltered} onClick={resetAll} />
        </div>

        {isLoading ? (
          <div className="skeleton rounded-2xl h-96" />
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="glass rounded-2xl p-6 animate-fade-in delay-1">
              <h2 className="font-bold text-white mb-5">Users per Step</h2>
              <ResponsiveContainer width="100%" height={320}>
                <BarChart data={funnel} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="rgba(255,255,255,0.05)" />
                  <XAxis type="number" tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                  <YAxis type="category" dataKey="step" width={120} tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                  <Tooltip cursor={{ fill: "rgba(255,255,255,0.03)" }} contentStyle={{ background: "#0f1a2a", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 12 }} />
                  <Bar dataKey="count" radius={[0, 6, 6, 0]}>
                    {funnel.map((_: unknown, i: number) => (
                      <Cell key={i} fill={`rgba(34,197,94,${1 - i * 0.13})`} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="glass rounded-2xl p-6 animate-fade-in delay-2">
              <h2 className="font-bold text-white mb-5">Funnel View</h2>
              <div className="space-y-3">
                {funnel.map((item, i) => {
                  const pct = maxCount > 0 ? (item.count / maxCount) * 100 : 0;
                  return (
                    <div key={item.step}>
                      <div className="flex justify-between text-xs text-gray-400 mb-1.5">
                        <span className="font-medium">{item.step}</span>
                        <span>{item.count} users · {pct.toFixed(1)}%</span>
                      </div>
                      <div className="h-8 bg-white/5 rounded-lg overflow-hidden">
                        <div
                          className="h-full rounded-lg transition-all duration-700 ease-out"
                          style={{
                            width: `${pct}%`,
                            background: `linear-gradient(90deg, rgba(34,197,94,${1 - i * 0.1}), rgba(16,185,129,${0.8 - i * 0.1}))`,
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
