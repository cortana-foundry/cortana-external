"use client";

import { usePolledFetch } from "./use-polled-fetch";

export type TrendDirection = "up" | "down" | "flat";

export type AutonomyPayload = {
  ok: boolean;
  score: number;
  trend: { direction: TrendDirection; delta: number };
  updatedAt: string;
  source: string;
};

export function useAutonomy() {
  return usePolledFetch<AutonomyPayload>("/api/autonomy-score", 45_000);
}
