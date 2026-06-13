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

  // Show/hide with slight delay to avoid flash on fast loads
  useEffect(() => {
    if (isLoading) {
      const t = setTimeout(() => setVisible(true), 300);
      return () => clearTimeout(t);
    } else {
      setVisible(false);
      // Reset for next load
      setMsgIdx(0);
      setDisplayed("");
      setPhase("typing");
      charIdx.current = 0;
    }
  }, [isLoading]);

  // Reset typing state when msgIdx changes
  useEffect(() => {
    charIdx.current = 0;
    setDisplayed("");
    setPhase("typing");
  }, [msgIdx]);

  useEffect(() => {
    if (!visible) return;

    if (phase === "typing") {
      const target = messages[msgIdx % messages.length];
      if (charIdx.current >= target.length) {
        setPhase("pause");
        return;
      }
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
      const t = setTimeout(() => {
        setMsgIdx((i) => (i + 1) % messages.length);
      }, 200);
      return () => clearTimeout(t);
    }
  }, [phase, displayed, msgIdx, messages, visible]);

  if (!visible) return null;

  return (
    <div
      style={{
        position: "fixed",
        bottom: "24px",
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 9000,
        animation: "fade-in-scale 0.25s ease-out both",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "12px",
          padding: "10px 18px",
          borderRadius: "99px",
          background: "linear-gradient(135deg, rgba(15,23,42,0.95) 0%, rgba(20,30,55,0.95) 50%, rgba(15,23,42,0.95) 100%)",
          backgroundSize: "200% 200%",
          border: "1px solid rgba(255,255,255,0.1)",
          backdropFilter: "blur(12px)",
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
            minWidth: "200px",
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
