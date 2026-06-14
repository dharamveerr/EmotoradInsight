"use client";

import { useEffect, useRef, useState } from "react";

const DEFAULT_MESSAGES = [
  "Fetching data from database...",
  "Crunching the numbers...",
  "Building your insights...",
  "Almost there, hold on...",
  "Preparing your report...",
];

interface Props {
  isLoading: boolean;
  messages?: string[];
}

export default function TypewriterLoader({ isLoading, messages = DEFAULT_MESSAGES }: Props) {
  const [displayed, setDisplayed] = useState("");
  const [msgIdx, setMsgIdx] = useState(0);
  const [phase, setPhase] = useState<"typing" | "pause" | "clearing">("typing");
  const [visible, setVisible] = useState(false);
  const charIdx = useRef(0);

  useEffect(() => {
    if (isLoading) {
      const t = setTimeout(() => setVisible(true), 300);
      return () => clearTimeout(t);
    } else {
      setVisible(false);
      setMsgIdx(0);
      setDisplayed("");
      setPhase("typing");
      charIdx.current = 0;
    }
  }, [isLoading]);

  useEffect(() => {
    charIdx.current = 0;
    setDisplayed("");
    setPhase("typing");
  }, [msgIdx]);

  useEffect(() => {
    if (!visible) return;

    if (phase === "typing") {
      const target = messages[msgIdx % messages.length];
      if (charIdx.current >= target.length) { setPhase("pause"); return; }
      const t = setTimeout(() => {
        charIdx.current++;
        setDisplayed(target.slice(0, charIdx.current));
      }, 38);
      return () => clearTimeout(t);
    }
    if (phase === "pause") {
      const t = setTimeout(() => setPhase("clearing"), 1600);
      return () => clearTimeout(t);
    }
    if (phase === "clearing") {
      const t = setTimeout(() => setMsgIdx((i) => (i + 1) % messages.length), 200);
      return () => clearTimeout(t);
    }
  }, [phase, displayed, msgIdx, messages, visible]);

  if (!visible) return null;

  return (
    <div
      style={{
        position: "fixed",
        top: "50%",
        left: "50%",
        transform: "translate(-50%, -50%)",
        zIndex: 9000,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: "20px",
        animation: "fade-in-scale 0.3s ease-out both",
        pointerEvents: "none",
      }}
    >
      {/* Dual comet arcs */}
      <div style={{ position: "relative", width: "80px", height: "80px" }}>
        {/* Track rings */}
        <svg width="80" height="80" viewBox="0 0 80 80" style={{ position: "absolute", inset: 0 }}>
          <circle cx="40" cy="40" r="34" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="1.5" />
          <circle cx="40" cy="40" r="22" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="1" />
        </svg>
        {/* Outer comet — green, clockwise */}
        <svg width="80" height="80" viewBox="0 0 80 80"
          style={{ position: "absolute", inset: 0, animation: "spin 1.8s linear infinite" }}>
          <circle cx="40" cy="40" r="34" fill="none"
            stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round"
            strokeDasharray="120 93"
            style={{ filter: "drop-shadow(0 0 4px #22c55e)" }} />
        </svg>
        {/* Inner comet — blue/violet, counter-clockwise */}
        <svg width="80" height="80" viewBox="0 0 80 80"
          style={{ position: "absolute", inset: 0, animation: "spin-reverse 2.6s linear infinite" }}>
          <circle cx="40" cy="40" r="22" fill="none"
            stroke="#818cf8" strokeWidth="2" strokeLinecap="round"
            strokeDasharray="60 78"
            style={{ filter: "drop-shadow(0 0 3px #818cf8)" }} />
        </svg>
        {/* Center pulse dot */}
        <div style={{
          position: "absolute", top: "50%", left: "50%",
          transform: "translate(-50%,-50%)",
          width: "8px", height: "8px", borderRadius: "50%",
          background: "#22c55e",
          boxShadow: "0 0 0 3px rgba(34,197,94,0.2), 0 0 12px rgba(34,197,94,0.6)",
          animation: "core-pulse 1.6s ease-in-out infinite",
        }} />
      </div>

      {/* Pill */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "12px",
          padding: "11px 22px",
          borderRadius: "99px",
          background: "linear-gradient(135deg, rgba(15,23,42,0.97) 0%, rgba(20,30,55,0.97) 50%, rgba(15,23,42,0.97) 100%)",
          backgroundSize: "200% 200%",
          border: "1px solid rgba(255,255,255,0.1)",
          backdropFilter: "blur(16px)",
          whiteSpace: "nowrap",
          animation: "pill-glow 2.8s ease-in-out infinite, pill-bg-shift 4s ease infinite",
        }}
      >
        {/* Bounce dots */}
        <div style={{ display: "flex", gap: "4px", alignItems: "center" }}>
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              style={{
                width: "6px",
                height: "6px",
                borderRadius: "50%",
                background: "#22c55e",
                display: "inline-block",
                animation: `loader-dot 1.2s ease-in-out ${i * 0.2}s infinite`,
              }}
            />
          ))}
        </div>

        {/* Typewriter text */}
        <span
          style={{
            fontFamily: "var(--font-geist-mono), monospace",
            fontSize: "12px",
            color: "#86efac",
            minWidth: "210px",
          }}
        >
          {displayed}
          <span
            style={{
              display: "inline-block",
              width: "2px",
              height: "13px",
              background: "#22c55e",
              marginLeft: "2px",
              verticalAlign: "middle",
              animation: "pulse 1s ease-in-out infinite",
            }}
          />
        </span>
      </div>
    </div>
  );
}
