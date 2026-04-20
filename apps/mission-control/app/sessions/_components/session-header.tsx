"use client";

import { Sparkles, TerminalSquare } from "lucide-react";
import { cn } from "@/lib/utils";

type SessionHeaderProps = {
  mutationPending: "create" | "reply" | null;
  className?: string;
};

export function SessionHeader({ mutationPending, className }: SessionHeaderProps) {
  return (
    <header className={cn("space-y-2", className)}>
      <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
        Shared local Codex workspace
      </p>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Sessions</h1>
          <p className="hidden max-w-2xl text-sm text-muted-foreground sm:block">
            Review, continue, and launch Codex threads from one bounded workspace that mirrors the local desktop client.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-background px-2.5 py-1 text-muted-foreground">
            <TerminalSquare className="h-3.5 w-3.5" />
            Shared via <code>~/.codex</code>
          </span>
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1",
              mutationPending
                ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                : "border-border/60 bg-background text-muted-foreground",
            )}
          >
            <Sparkles className="h-3.5 w-3.5" />
            {mutationPending === "create"
              ? "Starting thread"
              : mutationPending === "reply"
                ? "Streaming reply"
                : "Idle and ready"}
          </span>
        </div>
      </div>
    </header>
  );
}
