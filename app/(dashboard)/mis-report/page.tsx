"use client";

import { useState } from "react";
import useSWR from "swr";
import Topbar from "@/components/Topbar";
import SelectGlass from "@/components/SelectGlass";
import { useJourneyConfig } from "@/lib/useJourneyConfig";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

type DailyStat = {
  date: string;
  reach: number;
  completionRate: string;
  dropoffRate: string;
};

export default function MISReportPage() {
  const { labels: JOURNEY_LABELS } = useJourneyConfig();
  const [journey, setJourney] = useState("");
  const { data, isLoading } = useSWR(
    `/api/daily-stats${journey ? `?journey=${encodeURIComponent(journey)}` : ""}`,
    fetcher
  );
  const dailyStats: DailyStat[] = data?.dailyStats || [];

  return (
    <div className="flex-1 flex flex-col overflow-auto">
      <Topbar title="MIS Report" subtitle="Daily overview of key metrics" />

      <main className="flex-1 p-7 space-y-6 overflow-auto">
        {/* Journey filter */}
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-400">Select Journey</span>
          <SelectGlass
            value={journey}
            onChange={setJourney}
            options={[
              { value: "", label: "All Journeys" },
              ...Object.entries(JOURNEY_LABELS).map(([key, label]) => ({ value: key, label })),
            ]}
          />
        </div>

        {/* Daily Overview Report Table */}
        <div>
          <h2 className="text-lg font-bold text-white mb-4">Daily Overview Report</h2>

          {isLoading ? (
            <div className="skeleton rounded-2xl h-96" />
          ) : (
            <div className="glass rounded-2xl overflow-hidden animate-fade-in">
              <table className="w-full text-sm">
                <thead className="bg-white/5 border-b border-white/10">
                  <tr>
                    <th className="text-left px-6 py-3.5 text-gray-400 font-semibold">Date</th>
                    <th className="text-center px-6 py-3.5 text-gray-400 font-semibold">
                      Total Reach
                    </th>
                    <th className="text-center px-6 py-3.5 text-gray-400 font-semibold">
                      Completion Rate
                    </th>
                    <th className="text-center px-6 py-3.5 text-gray-400 font-semibold">
                      Drop-off Rate
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {dailyStats.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-6 py-8 text-center text-gray-500">
                        No data available
                      </td>
                    </tr>
                  ) : (
                    dailyStats.map((stat, idx) => {
                      const date = new Date(stat.date);
                      const dateStr = date.toLocaleDateString("en-US", {
                        weekday: "short",
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      });
                      const completion = parseFloat(stat.completionRate);
                      const dropoff = parseFloat(stat.dropoffRate);

                      return (
                        <tr key={idx} className="hover:bg-white/5 transition-colors">
                          <td className="px-6 py-3.5 text-gray-300 font-medium">{dateStr}</td>
                          <td className="px-6 py-3.5 text-center">
                            <span className="px-3 py-1 rounded-full bg-blue-500/20 text-blue-300 font-semibold">
                              {stat.reach} users
                            </span>
                          </td>
                          <td className="px-6 py-3.5 text-center">
                            <div className="flex items-center justify-center gap-2">
                              <div className="w-20 h-2 bg-white/10 rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-gradient-to-r from-green-400 to-emerald-500"
                                  style={{ width: `${Math.min(completion, 100)}%` }}
                                />
                              </div>
                              <span className="text-green-300 font-semibold text-xs w-12 text-right">
                                {stat.completionRate}%
                              </span>
                            </div>
                          </td>
                          <td className="px-6 py-3.5 text-center">
                            <div className="flex items-center justify-center gap-2">
                              <div className="w-20 h-2 bg-white/10 rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-gradient-to-r from-red-400 to-orange-500"
                                  style={{ width: `${Math.min(dropoff, 100)}%` }}
                                />
                              </div>
                              <span className="text-red-300 font-semibold text-xs w-12 text-right">
                                {stat.dropoffRate}%
                              </span>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Summary Stats */}
        {dailyStats.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold text-gray-400 uppercase mb-3">Summary</h3>
            <div className="grid grid-cols-3 gap-4">
              {/* Average Reach */}
              <div className="glass rounded-xl p-4">
                <p className="text-xs text-gray-500 mb-1">Avg Daily Reach</p>
                <p className="text-2xl font-bold text-white">
                  {(
                    dailyStats.reduce((sum, d) => sum + d.reach, 0) / dailyStats.length
                  ).toFixed(0)}
                </p>
              </div>

              {/* Average Completion */}
              <div className="glass rounded-xl p-4">
                <p className="text-xs text-gray-500 mb-1">Avg Completion Rate</p>
                <p className="text-2xl font-bold text-green-400">
                  {(
                    dailyStats.reduce((sum, d) => sum + parseFloat(d.completionRate), 0) /
                    dailyStats.length
                  ).toFixed(1)}
                  %
                </p>
              </div>

              {/* Average Drop-off */}
              <div className="glass rounded-xl p-4">
                <p className="text-xs text-gray-500 mb-1">Avg Drop-off Rate</p>
                <p className="text-2xl font-bold text-red-400">
                  {(
                    dailyStats.reduce((sum, d) => sum + parseFloat(d.dropoffRate), 0) /
                    dailyStats.length
                  ).toFixed(1)}
                  %
                </p>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
