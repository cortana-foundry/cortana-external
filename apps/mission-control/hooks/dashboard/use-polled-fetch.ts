"use client";

import { useEffect, useRef, useState } from "react";
import { usePollingPaused } from "./use-polling-paused";

/**
 * Shared polling primitive for dashboard data hooks.
 * - Jitters the initial fetch by 0–250ms so 8 hooks mounting together don't all hit in the same tick.
 * - Skips interval ticks while the tab is in the background.
 * - Uses an `alive` flag to drop responses arriving after unmount.
 */
export function usePolledFetch<T>(url: string, intervalMs: number) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const paused = usePollingPaused();
  const pausedRef = useRef(paused);
  pausedRef.current = paused;

  useEffect(() => {
    let alive = true;

    const fetchOnce = async () => {
      try {
        const res = await fetch(url, { cache: "no-store" });
        if (!res.ok) throw new Error(`${url} failed (${res.status})`);
        const json = (await res.json()) as T;
        if (!alive) return;
        setData(json);
        setError(null);
      } catch (e) {
        if (!alive) return;
        setError(e instanceof Error ? e : new Error("fetch failed"));
      }
    };

    const jitter = Math.floor(Math.random() * 250);
    const initial = window.setTimeout(fetchOnce, jitter);
    const interval = window.setInterval(() => {
      if (pausedRef.current) return;
      void fetchOnce();
    }, intervalMs);

    return () => {
      alive = false;
      window.clearTimeout(initial);
      window.clearInterval(interval);
    };
  }, [url, intervalMs]);

  return { data, error };
}
