"use client";

import { usePersistentState } from "@/lib/usePersistentState";
import { useActiveClientId } from "@/lib/useActiveClientId";

// Shows which date range the report data was fetched for (the range committed
// on the Variable Report page). Rendered on every report section so users know
// the data covers exactly this window. Hidden until a fetch has happened.
const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function fmt(d: string): string {
  const [y, m, day] = d.split("-");
  return `${MONTHS[parseInt(m) - 1]} ${parseInt(day)}, ${y}`;
}

// The date range the report data was last fetched for (committed on the
// Variable Report page), scoped to the currently active client so switching
// clients never shows another client's cached range. Null while the active
// client is still resolving, has no client, or has no fetch yet. Report pages
// use it to clamp their date pickers so users can't select days with no data.
export function useFetchedRange(): { from: string; to: string } | null {
  const clientId = useActiveClientId();
  const [committed] = usePersistentState<{ from: string; to: string } | null>(
    `filter:var-report:committed:${clientId ?? "none"}`,
    null
  );
  if (!clientId) return null; // no active client, or still resolving — nothing to show yet
  return committed;
}

export default function DataRangeBadge() {
  const committed = useFetchedRange();
  if (!committed) return null;

  const label =
    committed.from === committed.to
      ? fmt(committed.from)
      : `${fmt(committed.from)} – ${fmt(committed.to)}`;

  return (
    <span
      title="Reports are based on the data fetched for this date range (Variable Report → Fetch)"
      className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full bg-blue-500/10 text-blue-300 border border-blue-500/25"
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5 shrink-0">
        <rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" />
      </svg>
      Data fetched: {label}
    </span>
  );
}
