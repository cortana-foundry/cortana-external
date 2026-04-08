"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

type SloPayload = {
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

const POLL_MS = 60_000;

const formatMs = (value: number) => `${Math.round(value)} ms`;

export function ReliabilitySloCard() {
  const [data, setData] = useState<SloPayload | null>(null);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/reliability-slo", { cache: "no-store" });
      if (!res.ok) throw new Error("failed");
      const payload = (await res.json()) as SloPayload;
      setData(payload);
      setError(false);
    } catch {
      setError(true);
    }
  }, []);

  useEffect(() => {
    load();
    const timer = window.setInterval(load, POLL_MS);
    return () => window.clearInterval(timer);
  }, [load]);

  const metrics = data?.metrics;
  const totalSamples = metrics
    ? (metrics.samples.cronJobs + metrics.samples.terminalRuns + metrics.samples.deliveryRequiredJobs + metrics.samples.responseSamples + metrics.samples.providerSamples)
    : 0;
  const noData = !metrics || totalSamples === 0;
  const fmt = (value: number | undefined, n: number | undefined, suffix = "%") =>
    !metrics || (n ?? 0) === 0 ? "—" : `${value ?? 0}${suffix}`;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-base">
          Reliability SLOs
          <div className="flex items-center gap-2">
            {noData && <Badge variant="warning" className="text-[10px]">no samples</Badge>}
            <Badge variant="outline">rolling {data?.windowHours ?? 24}h</Badge>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 2xl:grid-cols-5">
          <Metric label="Cron on-time" value={fmt(metrics?.cronOnTimePct, metrics?.samples.cronJobs)} sample={`n=${metrics?.samples.cronJobs ?? 0}`} muted={!metrics?.samples.cronJobs} />
          <Metric
            label="Aborted run rate"
            value={fmt(metrics?.abortedRunRatePct, metrics?.samples.terminalRuns)}
            sample={`n=${metrics?.samples.terminalRuns ?? 0}`}
            muted={!metrics?.samples.terminalRuns}
          />
          <Metric
            label="Delivery success"
            value={fmt(metrics?.deliverySuccessPct, metrics?.samples.deliveryRequiredJobs)}
            sample={`n=${metrics?.samples.deliveryRequiredJobs ?? 0}`}
            muted={!metrics?.samples.deliveryRequiredJobs}
          />
          <Metric
            label="P95 response"
            value={(metrics?.samples.responseSamples ?? 0) === 0 ? "—" : formatMs(metrics?.p95ResponseMs ?? 0)}
            sample={`n=${metrics?.samples.responseSamples ?? 0}`}
            muted={!metrics?.samples.responseSamples}
          />
          <Metric
            label="API 429 rate"
            value={fmt(metrics?.api429RateByProvider?.[0]?.ratePct, metrics?.samples.providerSamples)}
            sample={metrics?.api429RateByProvider?.[0] ? metrics.api429RateByProvider[0].provider : "no provider data"}
            muted={!metrics?.samples.providerSamples}
          />
        </div>

        <div className="space-y-2">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">429 by provider</p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {(metrics?.api429RateByProvider || []).slice(0, 4).map((item) => (
              <div key={item.provider} className="rounded-md border border-border/70 bg-card/40 px-3 py-2 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-medium capitalize">{item.provider}</span>
                  <span className="font-mono">{item.ratePct}%</span>
                </div>
                <p className="text-xs text-muted-foreground">{item.count429} / {item.total} runs</p>
              </div>
            ))}
            {(metrics?.api429RateByProvider || []).length === 0 ? (
              <p className="text-xs text-muted-foreground">No provider telemetry in window.</p>
            ) : null}
          </div>
        </div>

        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{data ? `Updated ${new Date(data.generatedAt).toLocaleTimeString()}` : "Loading..."}</span>
        </div>

        {error ? <p className="text-xs text-amber-400">Reliability SLOs unavailable. Retrying…</p> : null}
      </CardContent>
    </Card>
  );
}

function Metric({ label, value, sample, muted }: { label: string; value: string; sample: string; muted?: boolean }) {
  return (
    <div className={`flex flex-col rounded-lg border px-3 py-3 ${muted ? "border-border/40 bg-card/20 opacity-50" : "border-border/70 bg-card/40"}`}>
      <p className="min-h-[2rem] text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="font-mono text-2xl font-semibold tracking-tight">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{sample}</p>
    </div>
  );
}
