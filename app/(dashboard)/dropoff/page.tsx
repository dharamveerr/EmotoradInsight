"use client";

import useSWR from "swr";
import { usePersistentState } from "@/lib/usePersistentState";
import ResetButton from "@/components/ResetButton";
import Topbar from "@/components/Topbar";
import SelectGlass from "@/components/SelectGlass";
import DateRangePicker from "@/components/DatePicker";
import { useJourneyConfig } from "@/lib/useJourneyConfig";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, ReferenceLine,
} from "recharts";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

const toLocalDate = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; };

export default function DropoffPage() {
  const today = toLocalDate();
  const { labels: JOURNEY_LABELS, steps: JOURNEY_STEPS } = useJourneyConfig();
  const journeyKeys = Object.keys(JOURNEY_STEPS);
  const [journey, setJourney, resetJourney] = usePersistentState("filter:dropoff:journey", "");
  const [sortBy, setSortBy, resetSortBy] = usePersistentState<"step" | "dropRate">("filter:dropoff:sort", "step");
  const [fromDate, setFromDate, resetFrom] = usePersistentState("filter:dropoff:from", "");
  const [toDate,   setToDate,   resetTo]   = usePersistentState("filter:dropoff:to",   "");
  const isDateFiltered = !!(fromDate && toDate);
  const isFiltered = journey !== "" || sortBy !== "step" || isDateFiltered;
  function resetAll() { resetJourney(); resetSortBy(); resetFrom(); resetTo(); }

  const { data, isLoading } = useSWR(
    `/api/insights?type=dropoff${journey ? `&journey=${journey}` : ""}${fromDate && toDate ? `&from=${fromDate}&to=${toDate}` : ""}`,
    fetcher
  );

  const rawDropoff: { step: string; entered: number; exited: number; dropRate: number }[] = data?.dropoff || [];
  const dropoff = sortBy === "dropRate" ? [...rawDropoff].sort((a, b) => b.dropRate - a.dropRate) : rawDropoff;

  const barColor = (r: number) => (r > 50 ? "#ef4444" : r > 25 ? "#f59e0b" : "#22c55e");
  const textColor = (r: number) => (r > 50 ? "text-red-400" : r > 25 ? "text-yellow-400" : "text-green-400");

  return (
    <div className="flex-1 flex flex-col overflow-auto">
      <Topbar title="Drop-off Analysis" subtitle="Where users abandon each journey" />
      <main className="flex-1 p-7 space-y-6">
        <div className="flex items-center gap-6 flex-wrap animate-fade-in">
          <div className="flex items-center gap-3">
            <label className="text-sm font-medium text-gray-400">Journey</label>
            <SelectGlass
              value={journey}
              onChange={setJourney}
              options={[{ value: "", label: "All Journeys" }, ...journeyKeys.map((k) => ({ value: k, label: JOURNEY_LABELS[k] || k }))]}
            />
          </div>
          <div className="flex items-center gap-3">
            <label className="text-sm font-medium text-gray-400">Sort by</label>
            <SelectGlass
              value={sortBy}
              onChange={(v) => setSortBy(v as "step" | "dropRate")}
              options={[
                { value: "step", label: "Step order" },
                { value: "dropRate", label: "Highest drop-off" },
              ]}
            />
          </div>
          <DateRangePicker from={fromDate} to={toDate} max={today} onChange={(f, t) => { setFromDate(f); setToDate(t); }} />
          <ResetButton show={isFiltered} onClick={resetAll} />
        </div>

        {isLoading ? (
          <div className="skeleton rounded-2xl h-96" />
        ) : (
          <div className="space-y-6">
            <div className="glass rounded-2xl p-6 animate-fade-in delay-1">
              <h2 className="font-bold text-white mb-5">Drop-off Rate per Step</h2>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={dropoff}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.05)" />
                  <XAxis dataKey="step" tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: "#64748b" }} unit="%" axisLine={false} tickLine={false} />
                  <Tooltip cursor={{ fill: "rgba(255,255,255,0.03)" }} formatter={(v) => `${v}%`} contentStyle={{ background: "#0f1a2a", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 12 }} />
                  <ReferenceLine y={50} stroke="#f59e0b" strokeDasharray="4 4" />
                  <Bar dataKey="dropRate" radius={[6, 6, 0, 0]}>
                    {dropoff.map((item, i) => (
                      <Cell key={i} fill={barColor(item.dropRate)} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="glass rounded-2xl overflow-hidden animate-fade-in delay-2">
              <table className="w-full text-sm">
                <thead className="bg-white/5 border-b border-white/10">
                  <tr>
                    <th className="text-left px-5 py-3.5 text-gray-400 font-semibold">Step</th>
                    <th className="text-right px-5 py-3.5 text-gray-400 font-semibold">Entered</th>
                    <th className="text-right px-5 py-3.5 text-gray-400 font-semibold">Exited</th>
                    <th className="text-right px-5 py-3.5 text-gray-400 font-semibold">Drop Rate</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {dropoff.map((row) => (
                    <tr key={row.step} className="hover:bg-white/5 transition-colors">
                      <td className="px-5 py-3.5 font-medium text-gray-200">{row.step}</td>
                      <td className="px-5 py-3.5 text-right text-gray-400">{row.entered}</td>
                      <td className="px-5 py-3.5 text-right text-gray-400">{row.exited}</td>
                      <td className="px-5 py-3.5 text-right">
                        <span className={`font-bold ${textColor(row.dropRate)}`}>{row.dropRate}%</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
