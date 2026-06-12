"use client";

import useSWR from "swr";
import { usePersistentState } from "@/lib/usePersistentState";
import ResetButton from "@/components/ResetButton";
import Topbar from "@/components/Topbar";
import SelectGlass from "@/components/SelectGlass";
import DateRangePicker from "@/components/DatePicker";
import { JOURNEY_LABELS, JOURNEY_STEPS } from "@/lib/types";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
  LineChart, Line, Legend, PieChart, Pie, Cell as PieCell,
} from "recharts";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

const PIE_COLORS = ["#22c55e", "#3b82f6", "#f59e0b", "#ef4444", "#a855f7"];

const toLocalDate = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; };

export default function ProductInsightsPage() {
  const today = toLocalDate();
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
  const productDistribution = data?.productDistribution || [];
  const priceDistribution = data?.priceDistribution || [];
  const funnel = data?.funnel || [];

  return (
    <div className="flex-1 flex flex-col overflow-auto">
      <Topbar title="Journey Analytics" subtitle="Detailed analytics per journey" />
      <main className="flex-1 p-7 space-y-6">
        {/* Journey Selector */}
        <div className="flex items-center gap-4 mb-4 flex-wrap">
          <label className="text-sm font-medium text-gray-400 whitespace-nowrap">Select Journey</label>
          <SelectGlass
            value={selectedJourney}
            onChange={setSelectedJourney}
            options={[{ value: "", label: "All Journeys" }, ...journeyKeys.map((k) => ({ value: k, label: JOURNEY_LABELS[k] || k }))]}
          />
          <DateRangePicker from={fromDate} to={toDate} max={today} onChange={(f, t) => { setFromDate(f); setToDate(t); }} />
          <ResetButton show={isFiltered} onClick={resetAll} />
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-5">
          {[
            { label: "Total Entries", value: funnel[0]?.count || 0, icon: "👥" },
            { label: "Product Viewed", value: funnel[1]?.count || 0, icon: "📱" },
            { label: "Price Filtered", value: funnel[2]?.count || 0, icon: "💰" },
            { label: "Conversion Rate", value: funnel[2] && funnel[0] ? `${Math.round((funnel[2].count / funnel[0].count) * 100)}%` : "0%", icon: "✅" },
          ].map((kpi, i) => (
            <div key={i} className="glass rounded-2xl p-5 animate-fade-in">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm text-gray-400 font-medium">{kpi.label}</p>
                  <p className="text-3xl font-bold text-white mt-2">{kpi.value}</p>
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

        {/* Product & Price Distribution */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="glass rounded-2xl p-6 animate-fade-in delay-3">
            <h2 className="font-bold text-white mb-5">Product Choices</h2>
            {isLoading ? (
              <div className="skeleton rounded-lg h-80" />
            ) : productDistribution.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie data={productDistribution} cx="50%" cy="50%" outerRadius={90} paddingAngle={2} dataKey="count">
                    {productDistribution.map((_: unknown, i: number) => (
                      <PieCell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ background: "#0f1a2a", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-80 flex items-center justify-center text-gray-500">No data</div>
            )}
          </div>

          <div className="glass rounded-2xl p-6 animate-fade-in delay-4">
            <h2 className="font-bold text-white mb-5">Price Range Preferences</h2>
            {isLoading ? (
              <div className="skeleton rounded-lg h-80" />
            ) : priceDistribution.length > 0 ? (
              <div className="space-y-4">
                {priceDistribution.map((item: any, i: number) => {
                  const maxVal = Math.max(...priceDistribution.map((p: any) => p.count));
                  const pct = maxVal > 0 ? (item.count / maxVal) * 100 : 0;
                  return (
                    <div key={i}>
                      <div className="flex justify-between text-sm text-gray-300 mb-2">
                        <span className="font-medium">{item.name}</span>
                        <span className="text-xs text-gray-400">{item.count} users</span>
                      </div>
                      <div className="h-8 bg-white/5 rounded-lg overflow-hidden">
                        <div
                          className="h-full rounded-lg transition-all duration-500"
                          style={{
                            width: `${pct}%`,
                            background: `linear-gradient(90deg, ${PIE_COLORS[i % PIE_COLORS.length]}, ${PIE_COLORS[(i + 1) % PIE_COLORS.length]})`,
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="h-80 flex items-center justify-center text-gray-500">No data</div>
            )}
          </div>
        </div>

      </main>
    </div>
  );
}
