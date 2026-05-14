"use client";

import { useEffect, useState } from "react";

/**
 * Returns true when the page is in the background (document.hidden).
 * Polling hooks should skip their interval tick while paused so the dashboard
 * stops eating battery when the tab is not focused.
 */
export function usePollingPaused(): boolean {
  const [paused, setPaused] = useState<boolean>(() => {
    if (typeof document === "undefined") return false;
    return document.hidden;
  });

  useEffect(() => {
    const onVisibilityChange = () => setPaused(document.hidden);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, []);

  return paused;
}
