"use client";

import { cn } from "@/lib/utils";
import { LiveRelativeTime } from "./live-relative-time";
import { getProjectColor } from "./project-color";
import { getCodexSessionTitle } from "./stream-helpers";
import type { CodexSession } from "./types";

export type ThreadCardDensity = "comfortable" | "compact";

type ThreadCardProps = {
  session: CodexSession;
  rootPath: string | null | undefined;
  isActive: boolean;
  density?: ThreadCardDensity;
  onSelect: () => void;
};

export function ThreadCard({
  session,
  rootPath,
  isActive,
  density = "comfortable",
  onSelect,
}: ThreadCardProps) {
  const color = getProjectColor(rootPath ?? session.cwd ?? null);
  const compact = density === "compact";

  return (
    <button
      type="button"
      onClick={onSelect}
      data-active={isActive ? "true" : "false"}
      data-density={density}
      className={cn(
        "group project-stripe w-full rounded-r-lg border-l-[3px] px-3 py-2.5 text-left transition-colors",
        "bg-transparent hover:bg-background/70",
        isActive
          ? "bg-background shadow-sm ring-1 ring-border"
          : "border border-transparent",
      )}
      style={
        {
          "--project-stripe": color.stripe,
          "--project-tint": color.tint,
        } as React.CSSProperties
      }
    >
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">
          {getCodexSessionTitle(session)}
        </p>
        <span className="shrink-0 rounded-full border border-border/60 bg-background px-2 py-0.5 text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
          {session.model ?? "unknown"}
        </span>
      </div>

      {!compact && session.lastMessagePreview ? (
        <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
          {session.lastMessagePreview}
        </p>
      ) : null}

      <div className="mt-1.5 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
        <span className="truncate" title={session.cwd ?? undefined}>
          {session.cwd ?? "cwd unavailable"}
        </span>
        <LiveRelativeTime ts={session.updatedAt} className="shrink-0" />
      </div>
    </button>
  );
}
