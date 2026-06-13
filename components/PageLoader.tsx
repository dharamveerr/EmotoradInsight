"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, Suspense } from "react";

function PageLoaderInner() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [progress, setProgress] = useState(0);
  const [visible, setVisible] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const interval = useRef<ReturnType<typeof setInterval> | null>(null);
  const prevPath = useRef<string>("");

  const currentPath = pathname + searchParams.toString();

  useEffect(() => {
    if (prevPath.current === "") {
      prevPath.current = currentPath;
      return;
    }
    if (prevPath.current === currentPath) return;
    prevPath.current = currentPath;

    // Start loader
    setProgress(0);
    setVisible(true);

    let p = 0;
    if (interval.current) clearInterval(interval.current);
    interval.current = setInterval(() => {
      p += Math.random() * 15;
      if (p >= 85) { p = 85; clearInterval(interval.current!); }
      setProgress(p);
    }, 120);

    // Complete after short delay (page rendered)
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      if (interval.current) clearInterval(interval.current);
      setProgress(100);
      setTimeout(() => setVisible(false), 300);
    }, 600);

    return () => {
      if (timer.current) clearTimeout(timer.current);
      if (interval.current) clearInterval(interval.current);
    };
  }, [currentPath]);

  if (!visible) return null;

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        zIndex: 99999,
        height: "3px",
        width: `${progress}%`,
        transition: progress === 100 ? "width 0.2s ease, opacity 0.3s ease" : "width 0.12s ease",
        opacity: progress === 100 ? 0 : 1,
        background: "linear-gradient(90deg, #22c55e, #10b981, #3b82f6, #8b5cf6)",
        backgroundSize: "200% 100%",
        animation: "loader-shimmer 1.2s linear infinite",
        boxShadow: "0 0 12px rgba(34,197,94,0.7), 0 0 6px rgba(34,197,94,0.4)",
        borderRadius: "0 2px 2px 0",
      }}
    />
  );
}

export default function PageLoader() {
  return (
    <Suspense fallback={null}>
      <PageLoaderInner />
    </Suspense>
  );
}
