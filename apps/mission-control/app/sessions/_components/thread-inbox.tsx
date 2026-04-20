"use client";

import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { getCodexSessionTitle } from "./stream-helpers";
import { ThreadCard } from "./thread-card";
import type { ThreadCardDensity } from "./thread-card";
import type { CodexSession, CodexSessionGroup } from "./types";

type ThreadInboxProps = {
  groups: CodexSessionGroup[];
  provisionalSession: CodexSession | null;
  activeSessionId: string | null;
  onSelectSession: (sessionId: string) => void;
  density?: ThreadCardDensity;
  error?: string | null;
  className?: string;
};

export function ThreadInbox({
  groups,
  provisionalSession,
  activeSessionId,
  onSelectSession,
  density = "comfortable",
  error,
  className,
}: ThreadInboxProps) {
  const hasAnything = groups.some((group) => group.sessions.length > 0) || Boolean(provisionalSession);

  return (
    <div className={cn("flex min-h-0 flex-col gap-3 overflow-y-auto p-3", className)}>
      {error ? (
        <div
          role="alert"
          className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive"
        >
          {error}
        </div>
      ) : null}

      {!hasAnything ? (
        <div className="rounded-lg border border-dashed border-border/60 bg-background/70 px-3 py-4 text-center text-sm text-muted-foreground">
          No Codex sessions found.
        </div>
      ) : null}

      {provisionalSession ? (
        <section className="space-y-1.5">
          <header className="flex items-center gap-2 px-1">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Starting now
            </p>
            <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
          </header>
          <ThreadCard
            session={provisionalSession}
            rootPath={provisionalSession.cwd}
            isActive={provisionalSession.sessionId === activeSessionId}
            density={density}
            onSelect={() =>
              provisionalSession.sessionId && onSelectSession(provisionalSession.sessionId)
            }
          />
        </section>
      ) : null}

      {groups.map((group) => (
        <section key={group.id} className="space-y-1.5">
          <header className="flex items-center justify-between gap-2 px-1">
            <div className="min-w-0">
              <p className="truncate text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                {group.label}
              </p>
              <p className="truncate text-[10px] text-muted-foreground">{group.rootPath}</p>
            </div>
            {group.isActive ? (
              <span className="shrink-0 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-[10px] uppercase tracking-[0.16em] text-emerald-700 dark:text-emerald-300">
                active
              </span>
            ) : null}
          </header>

          <div className="space-y-1">
            {group.sessions.map((session) => (
              <ThreadCard
                key={session.sessionId}
                session={session}
                rootPath={group.rootPath}
                isActive={session.sessionId === activeSessionId}
                density={density}
                onSelect={() => onSelectSession(session.sessionId)}
              />
            ))}
          </div>

          {group.sessions.length === 0 ? (
            <p className="px-1 text-xs text-muted-foreground">
              No recent threads for {getCodexSessionTitle({ threadName: group.label, sessionId: "" })}.
            </p>
          ) : null}
        </section>
      ))}
    </div>
  );
}
