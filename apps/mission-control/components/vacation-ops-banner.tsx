"use client";

import Link from "next/link";
import { Palmtree, ShieldAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { useVacationOps } from "@/hooks/dashboard/use-vacation-ops";
import { CollapsibleCard } from "./collapsible-card";
import { VacationOpsCard } from "./vacation-ops-card";

function formatRelative(value: string | null | undefined): string {
  if (!value) return "never";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return String(value);
  const ageMs = Math.max(0, Date.now() - parsed.getTime());
  const mins = Math.floor(ageMs / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  const rem = mins % 60;
  return rem === 0 ? `${hours}h ago` : `${hours}h ${rem}m ago`;
}

function modeLabel(mode: string | null | undefined): string {
  if (mode === "active") return "ACTIVE";
  if (mode === "ready") return "READY";
  if (mode === "prep") return "PREP";
  return "INACTIVE";
}

function readinessLabel(outcome: string | null | undefined): string {
  if (outcome === "pass") return "PASS";
  if (outcome === "warn") return "WARN";
  if (outcome === "no_go") return "NO-GO";
  if (outcome === "fail") return "FAIL";
  return "—";
}

function readinessToneClass(outcome: string | null | undefined): string {
  if (outcome === "pass") return "border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400";
  if (outcome === "warn") return "border-amber-400/60 bg-amber-500/10 text-amber-600 dark:text-amber-400";
  if (outcome === "no_go" || outcome === "fail")
    return "border-red-500/40 bg-red-500/10 text-red-600 dark:text-red-400";
  return "border-border/60 bg-muted/40 text-muted-foreground";
}

export function VacationOpsBanner() {
  const { data, error } = useVacationOps();

  const activeIncidents = data?.counts.activeIncidents ?? 0;
  const firstActiveIncident = (data?.recentIncidents ?? []).find((incident) => !incident.resolvedAt);
  const readiness = data?.latestReadiness?.readinessOutcome;
  const readinessAge = formatRelative(data?.latestReadiness?.completedAt ?? data?.latestReadiness?.startedAt);

  return (
    <CollapsibleCard
      summary={
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12px]">
          <Palmtree className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Vacation</span>
          <span className="font-semibold uppercase tracking-wider">{modeLabel(data?.mode)}</span>
          <span
            className={cn(
              "rounded border px-1.5 py-px text-[9px] font-bold uppercase tracking-wider",
              readinessToneClass(readiness),
            )}
          >
            {readinessLabel(readiness)}
          </span>
          {activeIncidents > 0 ? (
            <span className="inline-flex min-w-0 items-center gap-1 text-red-600 dark:text-red-400">
              <ShieldAlert className="h-3 w-3 shrink-0" />
              <span className="shrink-0 text-[11px] font-semibold">
                {activeIncidents}
              </span>
              {firstActiveIncident ? (
                <span className="truncate text-[11px] text-muted-foreground">
                  · {firstActiveIncident.systemLabel}
                  {firstActiveIncident.symptom ? `: ${firstActiveIncident.symptom}` : ""}
                </span>
              ) : null}
            </span>
          ) : (
            <span className="text-[11px] text-muted-foreground">{readinessAge}</span>
          )}
          {error ? <span className="text-[10px] text-amber-500">offline</span> : null}
        </div>
      }
    >
      <div className="-mx-3 -my-2">
        <VacationOpsCard />
      </div>
      <Link
        href="/services?tab=vacation"
        className="mt-2 inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground hover:underline"
      >
        Open console ↗
      </Link>
    </CollapsibleCard>
  );
}
