"use client";

import { useEffect, useRef, useState } from "react";
import type { VacationOpsSnapshot } from "@/lib/vacation-ops";
import { usePollingPaused } from "./use-polling-paused";

type VacationOpsResponse =
  | { status: "ok"; data: VacationOpsSnapshot }
  | { status: "error"; message: string };

export function useVacationOps() {
  const [data, setData] = useState<VacationOpsSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const paused = usePollingPaused();
  const pausedRef = useRef(paused);
  pausedRef.current = paused;

  useEffect(() => {
    let alive = true;

    const fetchOnce = async () => {
      try {
        const res = await fetch("/api/vacation-ops", { cache: "no-store" });
        const payload = (await res.json()) as VacationOpsResponse;
        if (!alive) return;
        if (!res.ok || payload.status !== "ok") {
          throw new Error(payload.status === "error" ? payload.message : "Vacation Ops unavailable");
        }
        setData(payload.data);
        setError(null);
      } catch (e) {
        if (!alive) return;
        setError(e instanceof Error ? e.message : "Vacation Ops unavailable");
      }
    };

    const initial = window.setTimeout(fetchOnce, Math.floor(Math.random() * 250));
    const interval = window.setInterval(() => {
      if (pausedRef.current) return;
      void fetchOnce();
    }, 60_000);

    return () => {
      alive = false;
      window.clearTimeout(initial);
      window.clearInterval(interval);
    };
  }, []);

  return { data, error };
}
