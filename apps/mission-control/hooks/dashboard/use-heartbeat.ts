"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePollingPaused } from "./use-polling-paused";

export type HeartbeatStatus = "healthy" | "stale" | "missed" | "quiet" | "unknown";

export type HeartbeatPayload = {
  ok: boolean;
  lastHeartbeat: number | null;
  status: HeartbeatStatus;
  ageMs: number | null;
};

type HeartbeatRefreshDetail = { optimisticLastHeartbeatMs?: number };

const POLL_MS = 30_000;
const OPTIMISTIC_GUARD_MS = 20_000;

/**
 * Heartbeat hook. Carries over the optimistic-floor behavior from heartbeat-pulse.tsx
 * intact: when `Force Heartbeat` fires a `heartbeat-refresh` window event with an
 * optimistic timestamp, the hook accepts that floor and rejects any polled response
 * that reports an older lastHeartbeat for up to OPTIMISTIC_GUARD_MS.
 */
export function useHeartbeat() {
  const [data, setData] = useState<HeartbeatPayload | null>(null);
  const [error, setError] = useState(false);
  const optimisticFloorRef = useRef<number | null>(null);
  const optimisticUntilRef = useRef<number>(0);
  const paused = usePollingPaused();
  const pausedRef = useRef(paused);
  pausedRef.current = paused;

  const fetchHeartbeat = useCallback(async () => {
    try {
      const res = await fetch("/api/heartbeat-status", { cache: "no-store" });
      if (!res.ok) throw new Error("heartbeat-status failed");

      const payload = (await res.json()) as HeartbeatPayload;
      const fetchedLastHeartbeat =
        typeof payload.lastHeartbeat === "number" && Number.isFinite(payload.lastHeartbeat)
          ? payload.lastHeartbeat
          : null;
      const now = Date.now();
      const optimisticFloor = optimisticFloorRef.current;

      if (
        optimisticFloor != null &&
        now < optimisticUntilRef.current &&
        (fetchedLastHeartbeat == null || fetchedLastHeartbeat < optimisticFloor)
      ) {
        return;
      }

      if (optimisticFloor != null && fetchedLastHeartbeat != null && fetchedLastHeartbeat >= optimisticFloor) {
        optimisticFloorRef.current = null;
        optimisticUntilRef.current = 0;
      }

      setData(payload);
      setError(false);
    } catch {
      setError(true);
      setData((prev) =>
        prev ?? { ok: false, lastHeartbeat: null, status: "unknown", ageMs: null },
      );
    }
  }, []);

  useEffect(() => {
    const initial = window.setTimeout(fetchHeartbeat, Math.floor(Math.random() * 250));
    const interval = window.setInterval(() => {
      if (pausedRef.current) return;
      void fetchHeartbeat();
    }, POLL_MS);

    const onRefresh = (event: Event) => {
      const detail = (event as CustomEvent<HeartbeatRefreshDetail>).detail;
      const optimisticLastHeartbeatMs = detail?.optimisticLastHeartbeatMs;

      if (typeof optimisticLastHeartbeatMs === "number" && Number.isFinite(optimisticLastHeartbeatMs)) {
        optimisticFloorRef.current = optimisticLastHeartbeatMs;
        optimisticUntilRef.current = Date.now() + OPTIMISTIC_GUARD_MS;
        setData({
          ok: true,
          lastHeartbeat: optimisticLastHeartbeatMs,
          ageMs: Math.max(0, Date.now() - optimisticLastHeartbeatMs),
          status: "healthy",
        });
        setError(false);
        return;
      }

      void fetchHeartbeat();
    };

    window.addEventListener("heartbeat-refresh", onRefresh);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(interval);
      window.removeEventListener("heartbeat-refresh", onRefresh);
    };
  }, [fetchHeartbeat]);

  return { data, error };
}
