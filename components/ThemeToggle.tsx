"use client";

import { useEffect, useState } from "react";

export default function ThemeToggle({ compact }: { compact?: boolean } = {}) {
  const [light, setLight] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem("theme");
    const isLight = stored === "light";
    setLight(isLight);
    document.documentElement.classList.toggle("light", isLight);
  }, []);

  function toggle() {
    const next = !light;
    setLight(next);
    document.documentElement.classList.toggle("light", next);
    localStorage.setItem("theme", next ? "light" : "dark");
  }

  if (compact) {
    return (
      <button
        onClick={toggle}
        title={light ? "Switch to dark" : "Switch to light"}
        className={`relative w-10 h-5 rounded-full transition-colors duration-200 ${
          light ? "bg-yellow-400/80" : "bg-white/10 border border-white/20"
        }`}
      >
        <span
          className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform duration-200 ${
            light ? "translate-x-5" : "translate-x-0"
          }`}
        />
      </button>
    );
  }

  return (
    <button
      onClick={toggle}
      title={light ? "Switch to dark" : "Switch to light"}
      className="w-9 h-9 rounded-full flex items-center justify-center border border-white/10 bg-white/5 hover:bg-white/10 transition text-gray-300"
    >
      {light ? (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
        </svg>
      )}
    </button>
  );
}
