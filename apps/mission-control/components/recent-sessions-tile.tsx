"use client";

import Link from "next/link";
import { useMemo } from "react";
import { summarizeSessions } from "@/lib/system-stats";
import { getSessionDisplayName, useRecentSessions } from "@/hooks/dashboard/use-recent-sessions";
import { CollapsibleCard } from "./collapsible-card";

function formatTime(value: number | null): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

export function RecentSessionsTile() {
  const { sessions, error } = useRecentSessions();

  const summary = useMemo(
    () =>
      summarizeSessions((sessions ?? []).map((s) => ({ updatedAt: s.updatedAt, abortedLastRun: s.abortedLastRun ?? null }))),
    [sessions],
  );

  const recent = useMemo(
    () =>
      [...(sessions ?? [])]
        .sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))
        .slice(0, 5),
    [sessions],
  );

  return (
    <CollapsibleCard
      summary={
        <div className="flex min-w-0 items-center gap-x-2 overflow-hidden text-[12px]">
          <span className="shrink-0 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Sessions</span>
          {sessions ? (
            <span className="truncate text-[11px] text-muted-foreground">
              <span className="font-mono font-semibold tabular-nums text-foreground">{summary.active}</span> seen ·{" "}
              <span className="font-mono font-semibold tabular-nums text-foreground">{summary.recent}</span> updated
            </span>
          ) : error ? (
            <span className="text-[11px] text-amber-500">unavailable</span>
          ) : (
            <span className="text-[11px] text-muted-foreground">loading…</span>
          )}
        </div>
      }
    >
      <div className="text-[11px]">
        {recent.length === 0 ? (
          <p className="py-1 text-muted-foreground">No recent sessions.</p>
        ) : (
          recent.map((session) => (
            <div
              key={session.key || `${session.agentId}-${session.updatedAt ?? "none"}`}
              className="flex items-baseline justify-between gap-2 border-b border-border/30 py-1 last:border-b-0"
            >
              <span className="min-w-0 truncate font-medium">{getSessionDisplayName(session)}</span>
              <span className="shrink-0 text-muted-foreground">
                {session.model ? <span className="mr-2 font-mono text-[10px]">{session.model}</span> : null}
                {formatTime(session.updatedAt)}
              </span>
            </div>
          ))
        )}
        <Link
          href="/services"
          className="mt-2 inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground hover:underline"
        >
          View all ↗
        </Link>
      </div>
    </CollapsibleCard>
  );
}
