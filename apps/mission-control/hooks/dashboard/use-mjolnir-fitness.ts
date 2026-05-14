"use client";

import { useEffect, useRef, useState } from "react";
import { usePollingPaused } from "./use-polling-paused";

export type TrendPoint = { date: string; value: number | null };

export type FitnessAlert = {
  id: string;
  severity: "critical" | "warning" | "info";
  label: string;
  message: string;
  timestamp: string;
};

export type WorkoutSummary = {
  id: string;
  sport: string;
  start: string | null;
  strain: number | null;
  durationSeconds: number | null;
  avgHeartRate: number | null;
  maxHeartRate: number | null;
  kilojoules: number | null;
};

export type FitnessSummary = {
  recovery: {
    score: number | null;
    status: "green" | "yellow" | "red" | "unknown";
    hrv: number | null;
    restingHeartRate: number | null;
    spo2: number | null;
    recordedAt: string | null;
  };
  sleep: {
    durationSeconds: number | null;
    efficiency: number | null;
    performance: number | null;
    consistency: number | null;
    sleepDebtSeconds: number | null;
    stage: { remSeconds: number | null; swsSeconds: number | null; lightSeconds: number | null };
    recordedAt: string | null;
  };
  workouts: WorkoutSummary[];
  trends: { recovery: TrendPoint[]; sleepPerformance: TrendPoint[] };
  alerts: FitnessAlert[];
  alertHistory: FitnessAlert[];
};

type FitnessResponse =
  | { status: "ok"; generatedAt: string; cached: boolean; data: FitnessSummary }
  | { status: "error"; generatedAt: string; cached: boolean; error: { message: string; detail?: string } };

export function useMjolnirFitness() {
  const [data, setData] = useState<FitnessSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const paused = usePollingPaused();
  const pausedRef = useRef(paused);
  pausedRef.current = paused;

  useEffect(() => {
    let alive = true;

    const fetchOnce = async () => {
      try {
        const res = await fetch("/api/mjolnir", { cache: "no-store" });
        if (!res.ok) throw new Error(`Request failed (${res.status})`);
        const payload = (await res.json()) as FitnessResponse;
        if (!alive) return;
        if (payload.status !== "ok") throw new Error(payload.error.message || "Mjolnir summary unavailable");
        setData(payload.data);
        setError(null);
      } catch (e) {
        if (!alive) return;
        setError(e instanceof Error ? e.message : "Mjolnir summary unavailable.");
      }
    };

    const initial = window.setTimeout(fetchOnce, Math.floor(Math.random() * 250));
    const interval = window.setInterval(() => {
      if (pausedRef.current) return;
      void fetchOnce();
    }, 5 * 60_000);

    return () => {
      alive = false;
      window.clearTimeout(initial);
      window.clearInterval(interval);
    };
  }, []);

  return { data, error };
}
