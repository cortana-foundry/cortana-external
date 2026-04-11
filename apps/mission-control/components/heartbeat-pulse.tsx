"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type HeartbeatStatus = "healthy" | "stale" | "missed" | "quiet" | "unknown";

type HeartbeatPayload = {
  ok: boolean;
  lastHeartbeat: number | null;
  status: HeartbeatStatus;
  ageMs: number | null;
};

const POLL_MS = 30_000;
const OPTIMISTIC_GUARD_MS = 20_000;

type HeartbeatRefreshDetail = {
  optimisticLastHeartbeatMs?: number;
};

function formatLastHeartbeat(ageMs: number | null, status: HeartbeatStatus) {
  if (ageMs == null) return "Last heartbeat: never";

  const totalMinutes = Math.max(0, Math.floor(ageMs / 60_000));
  if (totalMinutes < 1) return "Last heartbeat: just now";

  if (totalMinutes < 60) {
    return `Last heartbeat: ${totalMinutes} min ago${status !== "healthy" ? " ⚠️" : ""}`;
  }

  const hours = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
  if (mins === 0) {
    return `Last heartbeat: ${hours}h ago${status !== "healthy" ? " ⚠️" : ""}`;
  }

  return `Last heartbeat: ${hours}h ${mins}m ago${status !== "healthy" ? " ⚠️" : ""}`;
}


function formatExactHeartbeat(lastHeartbeat: number | null) {
  if (lastHeartbeat == null) return null;
  const d = new Date(lastHeartbeat);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString();
}

export function HeartbeatPulse() {
  const [data, setData] = useState<HeartbeatPayload | null>(null);
  const [error, setError] = useState(false);
  const optimisticFloorRef = useRef<number | null>(null);
  const optimisticUntilRef = useRef<number>(0);

  const fetchHeartbeat = useCallback(async () => {
    try {
      const res = await fetch("/api/heartbeat-status", {
        cache: "no-store",
      });

      if (!res.ok) throw new Error("heartbeat-status failed");

      const payload = (await res.json()) as HeartbeatPayload;
      const fetchedLastHeartbeat = typeof payload.lastHeartbeat === "number" && Number.isFinite(payload.lastHeartbeat)
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
        prev ?? {
          ok: false,
          lastHeartbeat: null,
          status: "unknown",
          ageMs: null,
        }
      );
    }
  }, []);

  useEffect(() => {
    fetchHeartbeat();
    const interval = window.setInterval(fetchHeartbeat, POLL_MS);
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
    return () => { window.clearInterval(interval); window.removeEventListener("heartbeat-refresh", onRefresh); };
  }, [fetchHeartbeat]);

  const status = data?.status ?? "unknown";

  const statusLabel = useMemo(() => {
    switch (status) {
      case "healthy":
        return "Live";
      case "stale":
        return "Stale";
      case "missed":
        return "Missed";
      case "quiet":
        return "Quiet hours";
      default:
        return "Unknown";
    }
  }, [status]);

  return (
    <div className="flex h-full flex-col justify-center overflow-hidden rounded-lg border bg-card/60 px-3 py-2 shadow-sm">
      <div className="flex items-center gap-2">
        <span
          className={`heartbeat-dot heartbeat-${status}`}
          aria-hidden="true"
        />
        <p className="text-sm font-medium text-foreground">Heartbeat: {statusLabel}</p>
      </div>
      <p className="mt-0.5 text-[11px] text-muted-foreground">
        {formatLastHeartbeat(data?.ageMs ?? null, status)}
        {error ? " (reconnecting)" : ""}
      </p>
      {formatExactHeartbeat(data?.lastHeartbeat ?? null) ? (
        <p className="text-[10px] text-muted-foreground/80">at {formatExactHeartbeat(data?.lastHeartbeat ?? null)}</p>
      ) : null}
    </div>
  );
}
