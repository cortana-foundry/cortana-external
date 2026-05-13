"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { FinancialServiceHealthRow, LoadState } from "@/lib/trading-ops-contract";
import { formatOperatorTimestamp } from "@/lib/format-utils";
import { badgeVariantForServiceHealth } from "@/lib/trading-ops/badge-variants";
import { cn } from "@/lib/utils";
import { Metric } from "../shared";

const RAIL: Record<LoadState, string> = {
  ok: "border-l-emerald-500 dark:border-l-emerald-400",
  degraded: "border-l-amber-500 dark:border-l-amber-400",
  error: "border-l-red-500 dark:border-l-red-400",
  missing: "border-l-border",
};

const DOT: Record<LoadState, string> = {
  ok: "bg-emerald-500 dark:bg-emerald-400",
  degraded: "bg-amber-500 dark:bg-amber-400",
  error: "bg-red-500 dark:bg-red-400",
  missing: "bg-muted-foreground",
};

export function FinancialServiceCard({ row }: { row: FinancialServiceHealthRow }) {
  const [open, setOpen] = useState(false);
  return (
    <button
      type="button"
      onClick={() => setOpen((current) => !current)}
      aria-expanded={open}
      className={cn(
        "group w-full rounded-md border border-l-2 border-border/50 bg-muted/20 p-3 text-left text-xs transition hover:border-border hover:bg-muted/40",
        RAIL[row.state],
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className={cn("inline-block h-1.5 w-1.5 shrink-0 rounded-full", DOT[row.state])} />
          <div className="min-w-0">
            <p className="font-medium">{row.label}</p>
            <p className="text-muted-foreground">{row.summary}</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <Badge variant={badgeVariantForServiceHealth(row.state)} className="text-[10px]">
            {row.badgeText ?? row.state}
          </Badge>
          <ChevronDown
            className={cn(
              "h-3.5 w-3.5 text-muted-foreground transition-transform",
              open && "rotate-180",
            )}
          />
        </div>
      </div>
      {open ? (
        <div className="mt-3 space-y-2">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Metric label="Detail" value={row.detail} />
            <Metric label="Updated" value={row.updatedAt ? formatOperatorTimestamp(row.updatedAt) : "—"} />
          </div>
          <p className="truncate text-[10px] text-muted-foreground">Source: {row.source}</p>
        </div>
      ) : null}
    </button>
  );
}
