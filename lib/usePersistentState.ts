"use client";

import { useState, useEffect, useRef, useCallback } from "react";

/**
 * useState that persists to localStorage with a 1-day TTL.
 *
 * - On mount: loads the stored value if it was set less than 1 day ago,
 *   otherwise falls back to `defaultValue` (and clears the stale entry).
 * - On every change: re-stamps the value with the current time, so a changed
 *   filter stays applied for the next full day.
 *
 * SSR-safe: first render always returns `defaultValue` (matches server HTML),
 * the stored value is applied in an effect after mount — no hydration mismatch.
 */
const TTL_MS = 24 * 60 * 60 * 1000; // 1 day

export function usePersistentState<T>(
  key: string,
  defaultValue: T
): [T, (v: T) => void, () => void] {
  const defaultRef = useRef(defaultValue);
  const [value, setValue] = useState<T>(defaultRef.current);

  // Load persisted value once, after mount.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return;
      const parsed = JSON.parse(raw) as { v: T; t: number };
      if (parsed && typeof parsed.t === "number" && Date.now() - parsed.t < TTL_MS) {
        setValue(parsed.v);
      } else {
        localStorage.removeItem(key); // expired
      }
    } catch {
      /* ignore bad/unavailable storage */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const set = useCallback(
    (v: T) => {
      setValue(v);
      try {
        localStorage.setItem(key, JSON.stringify({ v, t: Date.now() }));
      } catch {
        /* ignore */
      }
    },
    [key]
  );

  const reset = useCallback(() => {
    setValue(defaultRef.current);
    try {
      localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  }, [key]);

  return [value, set, reset];
}
