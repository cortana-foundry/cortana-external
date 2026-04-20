"use client";

import { cn } from "@/lib/utils";
import { formatInt } from "@/lib/format-utils";
import { LiveRelativeTime } from "./live-relative-time";
import { StatusDot } from "./status-dot";
import type { StatusDotState } from "./status-dot";

type StatusStripProps = {
  workspacePath: string;
  threadCount: number;
  projectCount: number;
  previewCount: number;
  latestUpdatedAt: number | null;
  state: StatusDotState;
  className?: string;
};

function pluralize(n: number, one: string, many: string) {
  return n === 1 ? one : many;
}

export function StatusStrip({
  workspacePath,
  threadCount,
  projectCount,
  previewCount,
  latestUpdatedAt,
  state,
  className,
}: StatusStripProps) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-border/60 bg-muted/[0.14] px-3 py-1.5 text-xs text-muted-foreground",
        className,
      )}
    >
      <code className="min-w-0 truncate font-mono text-[11px] text-foreground" title={workspacePath}>
        {workspacePath}
      </code>
      <span aria-hidden="true">·</span>
      <span>
        {formatInt(threadCount)} {pluralize(threadCount, "thread", "threads")}
      </span>
      <span aria-hidden="true">·</span>
      <span>
        {formatInt(projectCount)} {pluralize(projectCount, "project", "projects")}
      </span>
      <span aria-hidden="true">·</span>
      <span>
        {formatInt(previewCount)} with preview
      </span>
      <span aria-hidden="true">·</span>
      <span className="inline-flex items-center gap-1.5">
        <StatusDot state={state} aria-label={state} />
        <span>{state}</span>
      </span>
      <span className="ml-auto shrink-0">
        <LiveRelativeTime ts={latestUpdatedAt} />
      </span>
    </div>
  );
}
