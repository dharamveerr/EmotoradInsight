"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

// Cache the public IP per session so we don't hit ipify on every navigation
let cachedPublicIp: string | null = null;
let pendingIpFetch: Promise<string | null> | null = null;

async function getPublicIp(): Promise<string | null> {
  if (cachedPublicIp) return cachedPublicIp;
  if (pendingIpFetch) return pendingIpFetch;

  pendingIpFetch = (async () => {
    try {
      const res = await fetch("https://api.ipify.org?format=json", {
        cache: "no-store",
      });
      const data = await res.json();
      cachedPublicIp = data.ip || null;
      return cachedPublicIp;
    } catch {
      return null;
    } finally {
      pendingIpFetch = null;
    }
  })();

  return pendingIpFetch;
}

export default function ActivityTracker() {
  const pathname = usePathname();
  const lastTracked = useRef<string | null>(null);

  useEffect(() => {
    if (lastTracked.current === pathname) return;
    lastTracked.current = pathname;

    (async () => {
      const publicIp = await getPublicIp();
      fetch("/api/activity", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ page: pathname, publicIp }),
      }).catch(() => {});
    })();
  }, [pathname]);

  return null;
}
