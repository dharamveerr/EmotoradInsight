"use client";

import { useState, useRef, useEffect } from "react";

type Props = {
  from: string; // YYYY-MM-DD
  to: string;   // YYYY-MM-DD
  max?: string;
  onChange: (from: string, to: string) => void;
};

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const DAYS = ["Su","Mo","Tu","We","Th","Fr","Sa"];

function fmtShort(dateStr: string) {
  const [y, m, d] = dateStr.split("-");
  return `${MONTHS[parseInt(m)-1].slice(0,3)} ${parseInt(d)}, ${y}`;
}

function dateStr(y: number, m: number, d: number) {
  return `${y}-${String(m+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
}

function compareDates(a: string, b: string) {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

export default function DateRangePicker({ from, to, max, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const today = max || new Date().toISOString().slice(0,10);

  // Calendar view state
  const [viewYear, setViewYear] = useState(() => parseInt(to.split("-")[0]));
  const [viewMonth, setViewMonth] = useState(() => parseInt(to.split("-")[1]) - 1);

  // Selection state inside picker
  const [selecting, setSelecting] = useState<"start"|"end">("start");
  const [tempFrom, setTempFrom] = useState(from);
  const [tempTo, setTempTo] = useState(to);
  const [hovered, setHovered] = useState<string|null>(null);

  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  function openPicker() {
    const initFrom = from || today;
    const initTo   = to   || today;
    setTempFrom(initFrom);
    setTempTo(initTo);
    setSelecting("start");
    setViewYear(parseInt(initTo.split("-")[0]));
    setViewMonth(parseInt(initTo.split("-")[1]) - 1);
    setOpen(true);
  }

  function prevMonth() {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y-1); }
    else setViewMonth(m => m-1);
  }
  function nextMonth() {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y+1); }
    else setViewMonth(m => m+1);
  }

  function buildCalendar(year: number, month: number) {
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month+1, 0).getDate();
    const cells: (number|null)[] = [];
    for (let i = 0; i < firstDay; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(d);
    return cells;
  }

  function clickDay(day: number) {
    const ds = dateStr(viewYear, viewMonth, day);
    if (ds > today) return;
    if (selecting === "start") {
      setTempFrom(ds);
      setTempTo(ds);
      setSelecting("end");
    } else {
      if (ds < tempFrom) {
        setTempFrom(ds);
        setTempTo(tempFrom);
      } else {
        setTempTo(ds);
      }
      setSelecting("start");
    }
  }

  function apply() {
    const f = tempFrom <= tempTo ? tempFrom : tempTo;
    const t = tempFrom <= tempTo ? tempTo : tempFrom;
    onChange(f, t);
    setOpen(false);
  }

  function setPreset(days: number) {
    const end = today;
    const d = new Date(today);
    d.setDate(d.getDate() - (days - 1));
    const start = d.toISOString().slice(0,10);
    onChange(start, end);
    setOpen(false);
  }

  function inRange(day: number) {
    const ds = dateStr(viewYear, viewMonth, day);
    const lo = selecting === "end" && hovered
      ? (hovered < tempFrom ? hovered : tempFrom)
      : tempFrom;
    const hi = selecting === "end" && hovered
      ? (hovered < tempFrom ? tempFrom : hovered)
      : tempTo;
    return ds > lo && ds < hi;
  }

  function isStart(day: number) {
    const ds = dateStr(viewYear, viewMonth, day);
    if (selecting === "end" && hovered) {
      return ds === (hovered < tempFrom ? hovered : tempFrom);
    }
    return ds === tempFrom;
  }

  function isEnd(day: number) {
    const ds = dateStr(viewYear, viewMonth, day);
    if (selecting === "end" && hovered) {
      return ds === (hovered < tempFrom ? tempFrom : hovered);
    }
    return ds === tempTo && tempFrom !== tempTo;
  }

  function isDisabled(day: number) {
    return dateStr(viewYear, viewMonth, day) > today;
  }

  const isEmpty = !from || !to;
  const sameDay = !isEmpty && from === to;
  const label = isEmpty
    ? "All time"
    : sameDay
      ? fmtShort(from)
      : `${fmtShort(from)} – ${fmtShort(to)}`;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={openPicker}
        className="flex items-center gap-2.5 glass glass-hover rounded-xl px-4 py-2.5 text-sm text-white transition-all"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4 text-green-400 shrink-0">
          <rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>
        </svg>
        <span className="font-medium">{label}</span>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={`w-3.5 h-3.5 text-gray-400 transition-transform ${open?"rotate-180":""}`}>
          <path d="M6 9l6 6 6-6"/>
        </svg>
      </button>

      {open && (
        <div className="absolute top-full mt-2 left-0 z-50 glass rounded-2xl border border-white/10 shadow-2xl animate-fade-in" style={{width: 320}}>
          {/* Presets */}
          <div className="flex gap-1.5 p-3 pb-0 flex-wrap">
            {[
              {label:"Today", days:1},
              {label:"Last 7d", days:7},
              {label:"Last 30d", days:30},
              {label:"Last 90d", days:90},
            ].map(p => (
              <button
                key={p.label}
                onClick={() => setPreset(p.days)}
                className="text-xs px-2.5 py-1 rounded-lg bg-white/5 hover:bg-green-500/20 hover:text-green-400 text-gray-400 transition-colors"
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* Instruction */}
          <p className="text-xs text-gray-500 px-4 pt-2">
            {selecting === "start" ? "Select start date" : "Select end date"}
          </p>

          {/* Month nav */}
          <div className="flex items-center justify-between px-4 py-2">
            <button onClick={prevMonth} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-white/10 text-gray-400 hover:text-white transition-colors">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4"><path d="M15 18l-6-6 6-6"/></svg>
            </button>
            <span className="text-sm font-bold text-white">{MONTHS[viewMonth]} {viewYear}</span>
            <button onClick={nextMonth} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-white/10 text-gray-400 hover:text-white transition-colors">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4"><path d="M9 18l6-6-6-6"/></svg>
            </button>
          </div>

          {/* Day headers */}
          <div className="grid grid-cols-7 px-3">
            {DAYS.map(d => (
              <div key={d} className="text-center text-xs text-gray-500 font-medium py-1">{d}</div>
            ))}
          </div>

          {/* Days */}
          <div className="grid grid-cols-7 px-3 pb-3 gap-y-0.5">
            {buildCalendar(viewYear, viewMonth).map((day, i) => {
              if (!day) return <div key={i}/>;
              const disabled = isDisabled(day);
              const start = isStart(day);
              const end = isEnd(day);
              const range = inRange(day);
              return (
                <button
                  key={i}
                  onClick={() => !disabled && clickDay(day)}
                  onMouseEnter={() => selecting === "end" && setHovered(dateStr(viewYear,viewMonth,day))}
                  onMouseLeave={() => setHovered(null)}
                  disabled={disabled}
                  className={`
                    w-full aspect-square text-xs font-medium transition-all relative
                    ${start || end ? "bg-green-500 text-white rounded-lg shadow-lg shadow-green-500/30 z-10" :
                      range ? "bg-green-500/15 text-green-300 rounded-none" :
                      disabled ? "text-gray-600 cursor-not-allowed" :
                      "text-gray-300 hover:bg-white/10 hover:text-white rounded-lg"}
                  `}
                >
                  {day}
                </button>
              );
            })}
          </div>

          {/* Footer */}
          <div className="border-t border-white/5 p-3 flex items-center justify-between gap-2">
            <div className="text-xs text-gray-400 truncate">
              {tempFrom === tempTo
                ? fmtShort(tempFrom)
                : `${fmtShort(tempFrom)} – ${fmtShort(tempTo)}`}
            </div>
            <div className="flex gap-2 shrink-0">
              <button onClick={() => setOpen(false)} className="text-xs px-3 py-1.5 rounded-lg bg-white/5 text-gray-400 hover:text-white transition-colors">
                Cancel
              </button>
              <button onClick={apply} className="text-xs px-3 py-1.5 rounded-lg bg-green-500 hover:bg-green-400 text-white font-medium transition-colors">
                Apply
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
