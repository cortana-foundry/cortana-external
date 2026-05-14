"use client";

import { usePolledFetch } from "./use-polled-fetch";

export type ReliabilitySloPayload = {
  generatedAt: string;
  windowHours: number;
  metrics: {
    cronOnTimePct: number;
    abortedRunRatePct: number;
    deliverySuccessPct: number;
    p95ResponseMs: number;
    api429RateByProvider: Array<{ provider: string; ratePct: number; total: number; count429: number }>;
    samples: {
      cronJobs: number;
      terminalRuns: number;
      deliveryRequiredJobs: number;
      responseSamples: number;
      providerSamples: number;
    };
  };
};

export function useReliabilitySlo() {
  return usePolledFetch<ReliabilitySloPayload>("/api/reliability-slo", 60_000);
}
