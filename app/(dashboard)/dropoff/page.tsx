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

const fetcher = (url: string) => fetch(url).then((r) => r.json());

const toLocalDate = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; };

export default function DropoffPage() {
  const today = toLocalDate();
  const fetched = useFetchedRange();
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

  const { data: funnelData, isLoading: funnelLoading } = useSWR(
    `/api/insights?type=funnel${journey ? `&journey=${journey}` : ""}${fromDate && toDate ? `&from=${fromDate}&to=${toDate}` : ""}`,
    fetcher
  );

  const { data: breakdownData } = useSWR(
    journey
      ? `/api/insights?type=option-breakdown&journey=${journey}${fromDate && toDate ? `&from=${fromDate}&to=${toDate}` : ""}`
      : null,
    fetcher
  );
  const optionSteps: { step: string; variable: string; breakdown: { value: string; count: number }[]; total: number }[] = breakdownData?.steps || [];

  const funnel: { step: string; count: number }[] = funnelData?.funnel || [];
  const maxCount = funnel[0]?.count || 1;

  const rawDropoff: { step: string; entered: number; exited: number; dropRate: number }[] = data?.dropoff || [];
  const dropoff = sortBy === "dropRate" ? [...rawDropoff].sort((a, b) => b.dropRate - a.dropRate) : rawDropoff;

  const textColor = (r: number) => (r > 50 ? "text-red-400" : r > 25 ? "text-yellow-400" : "text-green-400");

  return (
    <div className="flex-1 flex flex-col overflow-auto">
      <Topbar title="Drop-off Analysis" subtitle="Where users abandon each journey" />
      <TypewriterLoader isLoading={isLoading || funnelLoading} messages={["Analysing drop-off points...", "Scanning journey exits...", "Crunching abandonment rates...", "Report almost ready..."]} />
      <main className="flex-1 overflow-auto p-4 sm:p-6 lg:p-7 space-y-6">
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
          <DateRangePicker from={fromDate} to={toDate} min={fetched?.from} max={fetched?.to || today} onChange={(f, t) => { setFromDate(f); setToDate(t); }} />
          <ResetButton show={isFiltered} onClick={resetAll} />
          <DataRangeBadge />
        </div>

        {funnelLoading ? (
          <div className="skeleton rounded-2xl h-96" />
        ) : (
          <div className="glass rounded-2xl p-6 animate-fade-in delay-1">
            <h2 className="font-bold text-white mb-5">Users Per Step</h2>
            <div className="space-y-3">
              {funnel.map((item, i) => {
                const pct = maxCount > 0 ? (item.count / maxCount) * 100 : 0;
                const prevCount = i > 0 ? funnel[i - 1].count : null;
                const dropPct = prevCount && prevCount > 0 ? ((prevCount - item.count) / prevCount) * 100 : 0;
                return (
                  <div key={item.step}>
                    <div className="flex justify-between text-xs text-gray-400 mb-1.5">
                      <span className="font-medium">{item.step}</span>
                      <span className="flex items-center gap-2">
                        {prevCount !== null && (
                          <span className={dropPct > 0 ? "text-red-400" : "text-emerald-400"}>
                            {dropPct > 0 ? `↓ ${dropPct.toFixed(1)}% drop` : "no drop"}
                          </span>
                        )}
                        <span>{item.count} users · {pct.toFixed(1)}%</span>
                      </span>
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
        )}

        {isLoading ? (
          <div className="skeleton rounded-2xl h-96" />
        ) : (
          <div className="space-y-6">
            <div className="glass rounded-2xl overflow-x-auto animate-fade-in delay-2">
              <table className="w-full text-sm min-w-[560px]">
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

        {/* Step Response Breakdown — only meaningful for one journey at a
            time; "All Journeys" mixes steps/variables across journeys that
            don't share a funnel, so we point the user at picking one instead. */}
        {!journey ? (
          <div className="glass rounded-2xl flex flex-col items-center justify-center py-14 animate-fade-in">
            <div className="w-14 h-14 rounded-full bg-white/5 flex items-center justify-center mb-4">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-7 h-7 text-gray-500">
                <path d="M9 3v18M3 9h18" />
              </svg>
            </div>
            <h3 className="text-base font-semibold text-white mb-1">Select a journey to see its Step Response Breakdown</h3>
            <p className="text-sm text-gray-500 text-center max-w-xs">Choose a specific journey above — this view only makes sense per journey, not across all journeys at once.</p>
          </div>
        ) : optionSteps.length > 0 ? (
          <div className="glass rounded-2xl p-6 animate-fade-in">
            <h2 className="font-bold text-white mb-5">Step Response Breakdown</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
              {optionSteps.map((s) => (
                <div key={s.step} className="space-y-3">
                  <div>
                    <p className="text-sm font-semibold text-white">{s.step}</p>
                    <p className="text-xs text-gray-500">{s.variable} · {s.total} unique users</p>
                  </div>
                  <div className="space-y-2">
                    {s.breakdown.map((b) => {
                      const pct = s.total > 0 ? Math.round((b.count / s.total) * 100) : 0;
                      return (
                        <div key={b.value}>
                          <div className="flex justify-between text-xs mb-1">
                            <span className="text-gray-300 truncate max-w-[70%]" title={b.value}>{b.value || "(blank)"}</span>
                            <span className="text-white font-semibold ml-2 shrink-0">{b.count} <span className="text-gray-500 font-normal">({pct}%)</span></span>
                          </div>
                          <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                            <div className="h-full rounded-full bg-emerald-400 transition-all" style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </main>
    </div>
  );
}
