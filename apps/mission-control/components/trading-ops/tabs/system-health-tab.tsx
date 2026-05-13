"use client";

import { useState } from "react";
import { CheckCircle2, AlertTriangle, ShieldAlert, Activity } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatOperatorTimestamp } from "@/lib/format-utils";
import type {
  ArtifactState,
  FinancialServicesHealthOverview,
  LoadState,
} from "@/lib/trading-ops-contract";
import { cn } from "@/lib/utils";
import { FinancialServiceCard } from "../health/financial-service-card";
import { ArtifactPanel } from "../shared";

type Filter = "all" | "ok" | "degraded" | "issues";

export function SystemHealthTab({
  financialServices,
}: {
  financialServices: ArtifactState<FinancialServicesHealthOverview>;
}) {
  const [filter, setFilter] = useState<Filter>("all");
  const data = financialServices.data;

  if (!data) {
    return (
      <ArtifactPanel title="Financial services health" artifact={financialServices}>
        <p className="text-xs text-muted-foreground">Waiting for the first service health snapshot.</p>
      </ArtifactPanel>
    );
  }

  const overallState: LoadState =
    data.errorCount > 0 ? "error" : data.degradedCount > 0 ? "degraded" : "ok";

  const rowsByFilter = data.rows.filter((row) => {
    if (filter === "all") return true;
    if (filter === "ok") return row.state === "ok";
    if (filter === "degraded") return row.state === "degraded";
    return row.state === "error" || row.state === "missing";
  });

  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-bold uppercase tracking-wider">Financial services health</h2>
      </div>

      <StatusHero
        state={overallState}
        healthyCount={data.healthyCount}
        degradedCount={data.degradedCount}
        errorCount={data.errorCount}
        totalCount={data.rows.length}
        checkedAt={data.checkedAt}
      />

      <div className="flex flex-wrap items-center gap-1.5">
        <FilterChip label={`All · ${data.rows.length}`} active={filter === "all"} onClick={() => setFilter("all")} />
        <FilterChip
          label={`Healthy · ${data.healthyCount}`}
          active={filter === "ok"}
          tone="ok"
          onClick={() => setFilter("ok")}
          disabled={data.healthyCount === 0}
        />
        <FilterChip
          label={`Degraded · ${data.degradedCount}`}
          active={filter === "degraded"}
          tone="degraded"
          onClick={() => setFilter("degraded")}
          disabled={data.degradedCount === 0}
        />
        <FilterChip
          label={`Issues · ${data.errorCount}`}
          active={filter === "issues"}
          tone="error"
          onClick={() => setFilter("issues")}
          disabled={data.errorCount === 0}
        />
      </div>

      {rowsByFilter.length > 0 ? (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {rowsByFilter.map((row) => (
            <FinancialServiceCard key={row.label} row={row} />
          ))}
        </div>
      ) : (
        <p className="rounded-md border border-dashed border-border/60 bg-muted/20 px-3 py-6 text-center text-xs text-muted-foreground">
          No services match this filter.
        </p>
      )}
    </div>
  );
}

const STATE_THEME: Record<"ok" | "degraded" | "error" | "missing", {
  icon: typeof CheckCircle2;
  border: string;
  bg: string;
  text: string;
  dot: string;
  label: string;
  message: (counts: { healthy: number; degraded: number; error: number; total: number }) => string;
}> = {
  ok: {
    icon: CheckCircle2,
    border: "border-emerald-500/40",
    bg: "bg-emerald-500/[0.04]",
    text: "text-emerald-600 dark:text-emerald-400",
    dot: "bg-emerald-500 dark:bg-emerald-400",
    label: "All systems normal",
    message: ({ healthy, total }) => `${healthy} of ${total} financial services are healthy.`,
  },
  degraded: {
    icon: AlertTriangle,
    border: "border-amber-500/40",
    bg: "bg-amber-500/[0.05]",
    text: "text-amber-600 dark:text-amber-400",
    dot: "bg-amber-500 dark:bg-amber-400",
    label: "Degraded",
    message: ({ degraded, healthy, total }) =>
      `${degraded} service${degraded === 1 ? "" : "s"} degraded · ${healthy}/${total} healthy.`,
  },
  error: {
    icon: ShieldAlert,
    border: "border-red-500/40",
    bg: "bg-red-500/[0.05]",
    text: "text-red-600 dark:text-red-400",
    dot: "bg-red-500 dark:bg-red-400",
    label: "Needs attention",
    message: ({ error, degraded, healthy, total }) => {
      const parts = [`${error} need${error === 1 ? "s" : ""} attention`];
      if (degraded > 0) parts.push(`${degraded} degraded`);
      parts.push(`${healthy}/${total} healthy`);
      return `${parts.join(" · ")}.`;
    },
  },
  missing: {
    icon: Activity,
    border: "border-border/70",
    bg: "bg-muted/30",
    text: "text-muted-foreground",
    dot: "bg-muted-foreground",
    label: "Waiting",
    message: () => "Waiting for the first health snapshot.",
  },
};

function StatusHero({
  state,
  healthyCount,
  degradedCount,
  errorCount,
  totalCount,
  checkedAt,
}: {
  state: LoadState;
  healthyCount: number;
  degradedCount: number;
  errorCount: number;
  totalCount: number;
  checkedAt: string | null;
}) {
  const theme = STATE_THEME[state];
  const Icon = theme.icon;
  return (
    <section
      className={cn(
        "flex flex-wrap items-center justify-between gap-3 rounded-lg border px-4 py-3",
        theme.border,
        theme.bg,
      )}
    >
      <div className="flex items-center gap-3">
        <span className="relative inline-flex h-2.5 w-2.5">
          <span className={cn("absolute inset-0 inline-flex animate-ping rounded-full opacity-60", theme.dot)} />
          <span className={cn("relative inline-flex h-2.5 w-2.5 rounded-full", theme.dot)} />
        </span>
        <Icon className={cn("h-5 w-5", theme.text)} />
        <div className="flex flex-col leading-tight">
          <span className={cn("text-sm font-bold uppercase tracking-wider", theme.text)}>
            {theme.label}
          </span>
          <span className="text-xs text-muted-foreground">
            {theme.message({ healthy: healthyCount, degraded: degradedCount, error: errorCount, total: totalCount })}
          </span>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Badge variant="outline" className="font-mono text-[10px]">
          {healthyCount}/{totalCount} healthy
        </Badge>
        {checkedAt ? (
          <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
            checked {formatOperatorTimestamp(checkedAt)}
          </span>
        ) : null}
      </div>
    </section>
  );
}

function FilterChip({
  label,
  active,
  tone,
  onClick,
  disabled,
}: {
  label: string;
  active: boolean;
  tone?: "ok" | "degraded" | "error";
  onClick: () => void;
  disabled?: boolean;
}) {
  const activeCls =
    tone === "ok"
      ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
      : tone === "degraded"
        ? "border-amber-500/50 bg-amber-500/10 text-amber-700 dark:text-amber-300"
        : tone === "error"
          ? "border-red-500/50 bg-red-500/10 text-red-700 dark:text-red-300"
          : "border-foreground/40 bg-foreground/5 text-foreground";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "rounded-full border px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider transition",
        active
          ? activeCls
          : "border-border/70 text-muted-foreground hover:border-foreground/40 hover:text-foreground",
        disabled && "cursor-not-allowed opacity-40 hover:border-border/70 hover:text-muted-foreground",
      )}
    >
      {label}
    </button>
  );
}
