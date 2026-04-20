"use client";

import { X, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { sessionMatchesQuery } from "./thread-filter";
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
  query?: string;
  onQueryChange?: (query: string) => void;
  isUnread?: (sessionId: string, updatedAt: number | null | undefined) => boolean;
};

export function ThreadInbox({
  groups,
  provisionalSession,
  activeSessionId,
  onSelectSession,
  density = "comfortable",
  error,
  className,
  query = "",
  onQueryChange,
  isUnread,
}: ThreadInboxProps) {
  const showSearch = onQueryChange !== undefined;

  // Filter and compute duplicate indices
  const filteredGroups = groups
    .map((group) => {
      const filteredSessions = group.sessions.filter((s) => sessionMatchesQuery(s, query));
      return { ...group, sessions: filteredSessions };
    })
    .filter((group) => group.sessions.length > 0);

  const provisionalMatches = provisionalSession && sessionMatchesQuery(provisionalSession, query);

  // Build list of all visible sessions (for duplicate detection)
  const allVisibleSessions: (CodexSession & { _groupId?: string })[] = [];
  if (provisionalMatches) {
    allVisibleSessions.push(provisionalSession!);
  }
  filteredGroups.forEach((group) => {
    group.sessions.forEach((session) => {
      allVisibleSessions.push({ ...session, _groupId: group.id });
    });
  });

  // Compute duplicate indices: group by normalized name, sort by updatedAt desc, assign 1..N
  const duplicateIndex = new Map<string, number>();
  const titleGroups = new Map<string, typeof allVisibleSessions>();
  allVisibleSessions.forEach((session) => {
    const normalizedTitle = (session.threadName || "").trim().toLowerCase();
    if (!titleGroups.has(normalizedTitle)) {
      titleGroups.set(normalizedTitle, []);
    }
    titleGroups.get(normalizedTitle)!.push(session);
  });

  titleGroups.forEach((sessions) => {
    if (sessions.length >= 2) {
      // Sort by updatedAt descending (newest first = index 1)
      const sorted = [...sessions].sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
      sorted.forEach((session, index) => {
        duplicateIndex.set(session.sessionId, index + 1);
      });
    }
  });

  const hasAnything = filteredGroups.length > 0 || provisionalMatches;

  return (
    <div className={cn("flex min-h-0 flex-col gap-3 overflow-y-auto", className)}>
      {showSearch ? (
        <div className="p-3 pb-0">
          <div className="relative">
            <Input
              type="text"
              placeholder="Search threads"
              value={query}
              onChange={(e) => onQueryChange?.(e.target.value)}
              className="pr-8"
            />
            {query.trim().length > 0 ? (
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => onQueryChange?.("")}
                className="absolute right-1 top-1/2 -translate-y-1/2"
                aria-label="Clear search"
              >
                <X className="h-4 w-4" />
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className={cn("flex min-h-0 flex-col gap-3 overflow-y-auto p-3", !showSearch && "pb-3")}>
        {error ? (
          <div
            role="alert"
            className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive"
          >
            {error}
          </div>
        ) : null}

        {!hasAnything && query.trim().length > 0 ? (
          <p className="px-1 text-xs text-muted-foreground">No threads match your search.</p>
        ) : null}

        {!hasAnything && query.trim().length === 0 ? (
          <div className="rounded-lg border border-dashed border-border/60 bg-background/70 px-3 py-4 text-center text-sm text-muted-foreground">
            No Codex sessions found.
          </div>
        ) : null}

        {provisionalMatches ? (
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
              unread={isUnread?.(provisionalSession.sessionId, provisionalSession.updatedAt)}
            />
          </section>
        ) : null}

        {filteredGroups.map((group) => (
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
                  duplicateIndex={duplicateIndex.get(session.sessionId)}
                  unread={isUnread?.(session.sessionId, session.updatedAt)}
                />
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
