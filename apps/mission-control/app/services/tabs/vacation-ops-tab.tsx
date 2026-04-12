"use client";

import * as React from "react";
import { AlertTriangle, CalendarRange, Loader2, Palmtree, PlayCircle, Power, ShieldCheck, ShieldEllipsis, Siren, Timer } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AnimatedValue } from "@/components/mjolnir/animated-value";
import { cn } from "@/lib/utils";
import type { VacationAction, VacationCheck, VacationIncident, VacationOpsSnapshot, VacationTierRollup } from "@/lib/vacation-ops";
import { EmptyState, RefreshButton, SectionCard, StatCard, TabLayout } from "./shared";

type VacationOpsResponse =
  | { status: "ok"; data: VacationOpsSnapshot }
  | { status: "error"; message: string };

type VacationOpsActionResponse =
  | { status: "ok"; action: string; result: Record<string, unknown>; data: VacationOpsSnapshot }
  | { status: "error"; message: string };

const POLL_MS = 45_000;

type ActionKey = "prep" | "enable" | "disable";

function formatDateTime(value: string | null | undefined) {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return String(value);
  return parsed.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatRelative(value: string | null | undefined) {
  if (!value) return "never";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return String(value);
  const ageMs = Math.max(0, Date.now() - parsed.getTime());
  const mins = Math.floor(ageMs / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  const remainder = mins % 60;
  return remainder === 0 ? `${hours}h ago` : `${hours}h ${remainder}m ago`;
}

function toDateTimeLocalInput(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  const year = parsed.getFullYear();
  const month = `${parsed.getMonth() + 1}`.padStart(2, "0");
  const day = `${parsed.getDate()}`.padStart(2, "0");
  const hour = `${parsed.getHours()}`.padStart(2, "0");
  const minute = `${parsed.getMinutes()}`.padStart(2, "0");
  return `${year}-${month}-${day}T${hour}:${minute}`;
}

function fromDateTimeLocalInput(value: string) {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toISOString();
}

function readinessBadge(outcome: string | null | undefined) {
  if (outcome === "pass") return "success" as const;
  if (outcome === "warn") return "warning" as const;
  if (outcome === "no_go" || outcome === "fail") return "destructive" as const;
  return "outline" as const;
}

function modeBadge(mode: string) {
  if (mode === "active") return "success" as const;
  if (mode === "ready") return "info" as const;
  if (mode === "prep" || mode === "completed") return "secondary" as const;
  if (mode === "failed" || mode === "expired") return "destructive" as const;
  return "outline" as const;
}

function checkBadge(status: string) {
  if (status === "green") return "success" as const;
  if (status === "yellow" || status === "warn") return "warning" as const;
  if (status === "red" || status === "fail") return "destructive" as const;
  if (status === "info") return "info" as const;
  return "outline" as const;
}

function summarizeDetail(detail: Record<string, unknown>) {
  if (typeof detail.detail === "string" && detail.detail.trim().length > 0) {
    return detail.detail.length > 180 ? `${detail.detail.slice(0, 180)}…` : detail.detail;
  }
  if (typeof detail.url === "string") return detail.url;
  if (typeof detail.jobName === "string") return detail.jobName;
  if (Array.isArray(detail.staleKeys) && detail.staleKeys.length > 0) return `Stale keys: ${detail.staleKeys.join(", ")}`;
  if (typeof detail.statusDetail === "string") return detail.statusDetail.length > 160 ? `${detail.statusDetail.slice(0, 160)}…` : detail.statusDetail;
  const entries = Object.entries(detail).slice(0, 3).map(([key, value]) => `${key}: ${typeof value === "string" ? value : JSON.stringify(value)}`);
  return entries.join(" · ") || "No additional detail";
}

async function requestVacationOps(init?: RequestInit) {
  const response = await fetch("/api/vacation-ops", { cache: "no-store", ...init });
  const payload = (await response.json()) as VacationOpsResponse;
  if (!response.ok || payload.status !== "ok") throw new Error(payload.status === "error" ? payload.message : "Vacation Ops request failed");
  return payload.data;
}

async function requestVacationAction(action: ActionKey, body: Record<string, unknown>) {
  const response = await fetch(`/api/vacation-ops/actions/${action}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = (await response.json()) as VacationOpsActionResponse;
  if (!response.ok || payload.status !== "ok") throw new Error(payload.status === "error" ? payload.message : `${action} failed`);
  return payload;
}

export function VacationOpsTab() {
  const [data, setData] = React.useState<VacationOpsSnapshot | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [activeAction, setActiveAction] = React.useState<ActionKey | null>(null);
  const [startAt, setStartAt] = React.useState("");
  const [endAt, setEndAt] = React.useState("");
  const [didTouchWindow, setDidTouchWindow] = React.useState(false);

  const hydrateWindowInputs = React.useCallback((snapshot: VacationOpsSnapshot) => {
    if (didTouchWindow) return;
    setStartAt(toDateTimeLocalInput(snapshot.recommendation.startAt));
    setEndAt(toDateTimeLocalInput(snapshot.recommendation.endAt));
  }, [didTouchWindow]);

  const load = React.useCallback(async () => {
    try {
      const next = await requestVacationOps();
      setData(next);
      setError(null);
      hydrateWindowInputs(next);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Failed to load Vacation Ops");
    } finally {
      setLoading(false);
    }
  }, [hydrateWindowInputs]);

  React.useEffect(() => {
    void load();
    const interval = window.setInterval(() => void load(), POLL_MS);
    return () => window.clearInterval(interval);
  }, [load]);

  const runAction = async (action: ActionKey) => {
    setActiveAction(action);
    setError(null);
    setNotice(null);

    try {
      const payload = await requestVacationAction(action, {
        startAt: action === "prep" ? fromDateTimeLocalInput(startAt) : undefined,
        endAt: action === "prep" ? fromDateTimeLocalInput(endAt) : undefined,
        timezone: data?.config.timezone,
        windowId: action === "enable" ? data?.enableReadyWindowId : undefined,
        reason: action === "disable" ? "manual" : undefined,
      });
      setData(payload.data);
      if (action !== "prep") {
        setDidTouchWindow(false);
        hydrateWindowInputs(payload.data);
      }
      const summaryText = typeof payload.result.summaryText === "string" ? payload.result.summaryText : null;
      setNotice(summaryText ?? `${action} completed.`);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : `${action} failed`);
    } finally {
      setActiveAction(null);
    }
  };

  const groupedChecks = React.useMemo(() => {
    const groups = new Map<number, VacationCheck[]>();
    for (const check of data?.latestChecks ?? []) {
      const list = groups.get(check.tier) ?? [];
      list.push(check);
      groups.set(check.tier, list);
    }
    return Array.from(groups.entries()).sort((left, right) => left[0] - right[0]);
  }, [data]);

  return (
    <TabLayout
      title="Vacation Ops"
      subtitle={data ? `Timezone ${data.config.timezone} · ${data.config.systemCount} tracked systems · Updated ${formatRelative(data.generatedAt)}` : "Away-mode operator surface for preflight, activation, and unattended ops."}
      badge={data ? <Badge variant={modeBadge(data.mode)} className="capitalize">{data.mode}</Badge> : undefined}
      loading={loading && !data}
      error={error}
      actions={<RefreshButton onClick={() => void load()} loading={loading} />}
      stats={
        data ? (
          <>
            <StatCard icon={<Palmtree className="h-4 w-4" />} label="Mode" value={data.mode.toUpperCase()} sub={data.latestWindow?.label ?? "No window staged"} />
            <StatCard icon={<ShieldCheck className="h-4 w-4" />} label="Readiness" value={(data.latestReadiness?.readinessOutcome ?? "n/a").toUpperCase().replace("_", "-")} sub={formatRelative(data.latestReadiness?.completedAt ?? data.latestReadiness?.startedAt)} />
            <StatCard icon={<Siren className="h-4 w-4" />} label="Incidents" value={String(data.counts.activeIncidents)} sub={`${data.counts.humanRequiredIncidents} human required`} />
            <StatCard icon={<Timer className="h-4 w-4" />} label="Paused Jobs" value={String(data.counts.pausedJobs)} sub={data.nextSummaryAt ? `Next summary ${formatDateTime(data.nextSummaryAt)}` : "Summaries idle"} />
          </>
        ) : undefined
      }
    >
      {notice ? <div className="rounded-lg border border-emerald-200 bg-emerald-50/70 px-4 py-2.5 text-sm text-emerald-900 dark:border-emerald-900/50 dark:bg-emerald-950/20 dark:text-emerald-200">{notice}</div> : null}

      {data && (
        <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
          <SectionCard
            icon={<CalendarRange className="h-4 w-4" />}
            title="Window & Schedule"
            subtitle="Current away-mode state and summary cadence"
          >
            <div className="grid gap-3 md:grid-cols-2">
              <InfoPair label="Latest window" value={data.latestWindow?.label ?? "No window prepared"} />
              <InfoPair label="Window status" value={data.latestWindow?.status ?? "inactive"} badge={data.latestWindow ? <Badge variant={modeBadge(data.latestWindow.status)} className="capitalize">{data.latestWindow.status}</Badge> : undefined} />
              <InfoPair label="Range" value={data.latestWindow ? `${formatDateTime(data.latestWindow.startAt)} → ${formatDateTime(data.latestWindow.endAt)}` : "Run preflight to stage a window"} />
              <InfoPair label="Next summary" value={data.nextSummaryAt ? formatDateTime(data.nextSummaryAt) : `AM ${data.config.summaryTimes.morning} · PM ${data.config.summaryTimes.evening}`} />
              <InfoPair label="Latest readiness" value={data.latestReadiness?.runType ? `${data.latestReadiness.runType} · ${formatRelative(data.latestReadiness.completedAt ?? data.latestReadiness.startedAt)}` : "No readiness run"} badge={<Badge variant={readinessBadge(data.latestReadiness?.readinessOutcome)}>{data.latestReadiness?.readinessOutcome?.replace("_", "-") ?? "n/a"}</Badge>} />
              <InfoPair label="Mirror state" value={data.mirror ? `runtime mirror synced · ${String(data.mirror.status ?? "unknown")}` : "No active mirror"} />
            </div>
            {data.latestSummary?.summaryText ? (
              <div className="mt-4 rounded-xl border border-border/50 bg-muted/10 p-3">
                <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">Latest summary</p>
                <pre className="mt-2 whitespace-pre-wrap font-sans text-sm leading-6">{data.latestSummary.summaryText}</pre>
              </div>
            ) : null}
          </SectionCard>

          <SectionCard
            icon={<PlayCircle className="h-4 w-4" />}
            title="Controls"
            subtitle="Stage preflight first, then enable the prepared window"
          >
            <div className="space-y-3">
              <div className="grid gap-3">
                <label className="space-y-1.5">
                  <span className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">Start</span>
                  <Input
                    type="datetime-local"
                    value={startAt}
                    onChange={(event) => { setDidTouchWindow(true); setStartAt(event.target.value); }}
                  />
                </label>
                <label className="space-y-1.5">
                  <span className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">End</span>
                  <Input
                    type="datetime-local"
                    value={endAt}
                    onChange={(event) => { setDidTouchWindow(true); setEndAt(event.target.value); }}
                  />
                </label>
              </div>

              <div className="grid gap-2 sm:grid-cols-3">
                <ActionButton
                  label="Run preflight"
                  icon={<PlayCircle className="h-4 w-4" />}
                  loading={activeAction === "prep"}
                  onClick={() => void runAction("prep")}
                  disabled={!startAt || !endAt || activeAction != null}
                />
                <ActionButton
                  label="Enable"
                  icon={<Power className="h-4 w-4" />}
                  loading={activeAction === "enable"}
                  onClick={() => void runAction("enable")}
                  disabled={activeAction != null || data.enableReadyWindowId == null || data.mode === "active"}
                />
                <ActionButton
                  label="Disable"
                  icon={<ShieldEllipsis className="h-4 w-4" />}
                  loading={activeAction === "disable"}
                  onClick={() => void runAction("disable")}
                  disabled={activeAction != null || data.mode !== "active"}
                  variant="outline"
                />
              </div>

              <div className="rounded-xl border border-border/50 bg-muted/10 p-3 text-sm text-muted-foreground">
                <p>Preflight creates the candidate window and records a fresh readiness run.</p>
                <p className="mt-1">Enable stays locked until a prepared window is in `ready` and tied to the latest freshness-valid readiness run.</p>
              </div>
            </div>
          </SectionCard>
        </div>
      )}

      {data && (
        <SectionCard
          icon={<ShieldCheck className="h-4 w-4" />}
          title="Latest checks"
          subtitle="Tiered readiness results from the most recent preflight run"
          count={data.latestChecks.length}
        >
          {data.latestChecks.length === 0 ? (
            <EmptyState message="No readiness checks recorded yet. Run preflight to populate this view." />
          ) : (
            <div className="space-y-4">
              <div className="grid gap-2 sm:grid-cols-3">
                {data.tierRollup.map((tier) => (
                  <TierRollupCard key={tier.tier} rollup={tier} />
                ))}
              </div>
              <div className="space-y-3">
                {groupedChecks.map(([tier, checks]) => (
                  <div key={tier} className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">Tier {tier}</Badge>
                      <span className="text-xs text-muted-foreground">{checks.length} systems</span>
                    </div>
                    <div className="space-y-2">
                      {checks.map((check) => (
                        <details key={check.id} className="rounded-xl border border-border/50 bg-background/60 px-3 py-3">
                          <summary className="flex cursor-pointer list-none items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <p className="truncate text-sm font-medium">{check.systemLabel}</p>
                                <Badge variant={checkBadge(check.status)} className="uppercase">{check.status}</Badge>
                                {check.remediationAttempted ? (
                                  <Badge variant={check.remediationSucceeded ? "success" : "warning"}>
                                    {check.remediationSucceeded ? "self-healed" : "remediation tried"}
                                  </Badge>
                                ) : null}
                              </div>
                              <p className="mt-1 text-xs text-muted-foreground">{summarizeDetail(check.detail)}</p>
                            </div>
                            <div className="shrink-0 text-right text-[11px] text-muted-foreground">
                              <div>Observed {formatRelative(check.observedAt)}</div>
                              <div>Freshness {formatRelative(check.freshnessAt)}</div>
                            </div>
                          </summary>
                          <pre className="mt-3 overflow-x-auto rounded-lg border border-border/50 bg-muted/10 p-3 text-xs leading-5 text-muted-foreground">{JSON.stringify(check.detail, null, 2)}</pre>
                        </details>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </SectionCard>
      )}

      {data && (
        <div className="grid gap-4 xl:grid-cols-2">
          <SectionCard
            icon={<AlertTriangle className="h-4 w-4" />}
            title="Incidents"
            subtitle="Open, degraded, and resolved vacation-mode incidents"
            count={data.recentIncidents.length}
          >
            {data.recentIncidents.length === 0 ? (
              <EmptyState message="No incidents recorded for the current or latest window." />
            ) : (
              <div className="space-y-2">
                {data.recentIncidents.map((incident) => (
                  <div key={incident.id} className="rounded-xl border border-border/50 bg-background/70 px-3 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="truncate text-sm font-medium">{incident.systemLabel}</p>
                          <Badge variant={checkBadge(incident.status)} className="uppercase">{incident.status}</Badge>
                          {incident.humanRequired ? <Badge variant="destructive">human</Badge> : null}
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">{incident.symptom || summarizeDetail(incident.detail)}</p>
                      </div>
                      <div className="shrink-0 text-right text-[11px] text-muted-foreground">
                        <div>Tier {incident.tier}</div>
                        <div>{formatRelative(incident.lastObservedAt)}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>

          <SectionCard
            icon={<Timer className="h-4 w-4" />}
            title="Recent remediations"
            subtitle="Latest bounded actions attempted while away-mode logic was active"
            count={data.recentActions.length}
          >
            {data.recentActions.length === 0 ? (
              <EmptyState message="No remediation actions recorded yet." />
            ) : (
              <div className="space-y-2">
                {data.recentActions.map((action) => (
                  <div key={action.id} className="rounded-xl border border-border/50 bg-background/70 px-3 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="truncate text-sm font-medium">{action.systemLabel}</p>
                          <Badge variant={checkBadge(action.actionStatus)} className="uppercase">{action.actionStatus}</Badge>
                          {action.verificationStatus ? <Badge variant={checkBadge(action.verificationStatus)}>{action.verificationStatus}</Badge> : null}
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">{action.actionKind.replaceAll("_", " ")}</p>
                      </div>
                      <div className="shrink-0 text-right text-[11px] text-muted-foreground">
                        <div>step {action.stepOrder}</div>
                        <div>{formatRelative(action.startedAt)}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>
        </div>
      )}
    </TabLayout>
  );
}

function InfoPair({ label, value, badge }: { label: string; value: string; badge?: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border/50 bg-background/60 p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">{label}</p>
        {badge}
      </div>
      <p className="mt-2 text-sm font-medium">{value}</p>
    </div>
  );
}

function TierRollupCard({ rollup }: { rollup: VacationTierRollup }) {
  return (
    <div className="rounded-xl border border-border/50 bg-background/60 p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">Tier {rollup.tier}</p>
        <span className="text-xs text-muted-foreground">{rollup.total} total</span>
      </div>
      <div className="mt-3 flex items-end justify-between gap-3">
        <div>
          <p className="text-[11px] text-muted-foreground">Green</p>
          <AnimatedValue value={rollup.green} className="text-xl font-semibold" />
        </div>
        <div>
          <p className="text-[11px] text-muted-foreground">Warn</p>
          <AnimatedValue value={rollup.yellow} className="text-xl font-semibold text-amber-600 dark:text-amber-300" />
        </div>
        <div>
          <p className="text-[11px] text-muted-foreground">Red</p>
          <AnimatedValue value={rollup.red} className="text-xl font-semibold text-red-600 dark:text-red-300" />
        </div>
      </div>
    </div>
  );
}

function ActionButton({
  label,
  icon,
  onClick,
  disabled,
  loading,
  variant = "default",
}: {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  loading?: boolean;
  variant?: "default" | "outline";
}) {
  return (
    <Button variant={variant} className={cn("h-auto justify-start px-3 py-3 text-left", variant === "outline" && "bg-background/70")} onClick={onClick} disabled={disabled}>
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : icon}
      <span>{label}</span>
    </Button>
  );
}
