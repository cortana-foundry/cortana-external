"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { summarizeSessions } from "@/lib/system-stats";

type SessionPayload = {
  key: string | null;
  updatedAt: number | null;
  agentId: string | null;
  model: string | null;
  abortedLastRun?: boolean | null;
};

type SessionsPayload = {
  sessions: SessionPayload[];
};

const SESSION_WINDOW_MINUTES = 1440;

function getSessionDisplayName(session: SessionPayload) {
  if (session.agentId && session.agentId !== "unknown") return session.agentId;
  const source = (session.key || "").trim();
  if (!source) return "session";
  const parts = source.split(":");
  return parts.length > 1 ? parts[1] || source : source;
}

export function RecentSessionsCard() {
  const [sessions, setSessions] = useState<SessionPayload[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const res = await fetch(`/api/sessions?minutes=${SESSION_WINDOW_MINUTES}`, { cache: "no-store" });
        if (!res.ok) throw new Error(`sessions ${res.status}`);
        const payload = (await res.json()) as SessionsPayload;
        if (!cancelled) {
          setSessions(payload.sessions ?? []);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load sessions");
        }
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const summary = useMemo(
    () => summarizeSessions((sessions ?? []).map((session) => ({
      updatedAt: session.updatedAt,
      abortedLastRun: session.abortedLastRun ?? null,
    }))),
    [sessions]
  );

  const recent = useMemo(
    () => [...(sessions ?? [])]
      .sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))
      .slice(0, 4),
    [sessions]
  );

  const latestSessionActivityLabel = summary.lastUpdated != null
    ? new Date(summary.lastUpdated).toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
    : null;

  return (
    <Card className="gap-3 py-4">
      <CardHeader className="gap-1 px-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <CardTitle className="text-sm font-semibold uppercase tracking-wide">Recent Sessions</CardTitle>
            <p className="text-xs text-muted-foreground">
              {latestSessionActivityLabel
                ? `OpenClaw session activity across agents, latest ${latestSessionActivityLabel}`
                : "OpenClaw session activity across agents"}
            </p>
          </div>
          <Link href="/services" className="text-xs text-muted-foreground hover:text-foreground hover:underline">View all</Link>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 px-5">
        {sessions ? (
          <>
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-lg border border-border/50 bg-card/60 p-3">
                <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">Seen (24h)</p>
                <p className="mt-1 font-mono text-xl font-bold leading-tight">{summary.active}</p>
              </div>
              <div className="rounded-lg border border-border/50 bg-card/60 p-3">
                <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">Updated recently</p>
                <p className="mt-1 font-mono text-xl font-bold leading-tight">{summary.recent}</p>
              </div>
            </div>

            <div className="space-y-2">
              {recent.map((session) => (
                <div key={session.key || `${session.agentId}-${session.updatedAt ?? "none"}`} className="rounded-lg border border-border/40 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{getSessionDisplayName(session)}</p>
                      <p className="truncate text-xs text-muted-foreground">{session.model || session.key || "No model metadata"}</p>
                    </div>
                    <span className="shrink-0 text-[11px] text-muted-foreground">
                      {session.updatedAt ? new Date(session.updatedAt).toLocaleString() : "Unknown"}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </>
        ) : error ? (
          <p className="text-sm text-muted-foreground">Session telemetry is unavailable right now.</p>
        ) : (
          <p className="text-sm text-muted-foreground">Loading session telemetry…</p>
        )}
      </CardContent>
    </Card>
  );
}
