"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { sessionMatchesQuery } from "./thread-filter";
import { getCodexSessionTitle } from "./stream-helpers";
import type { CodexSession, CodexSessionGroup } from "./types";

type ThreadPaletteProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  groups: CodexSessionGroup[];
  onSelectSession: (sessionId: string) => void;
};

export function ThreadPalette({
  open,
  onOpenChange,
  groups,
  onSelectSession,
}: ThreadPaletteProps) {
  const [query, setQuery] = useState("");
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const overlayRef = useRef<HTMLDivElement | null>(null);

  // Flatten and filter sessions
  const allSessions: CodexSession[] = [];
  groups.forEach((group) => {
    group.sessions.forEach((session) => {
      allSessions.push(session);
    });
  });

  const filtered = allSessions
    .filter((session) => sessionMatchesQuery(session, query))
    .slice(0, 20); // Limit to first 20

  useEffect(() => {
    if (open) {
      // Reset on open
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot reset when opening the palette
      setQuery("");
      setHighlightedIndex(0);
      // Focus input after a tick to avoid immediate blur
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      onOpenChange(false);
      return;
    }

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightedIndex((i) => (i + 1) % Math.max(filtered.length, 1));
      return;
    }

    if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightedIndex((i) => (i === 0 ? Math.max(filtered.length - 1, 0) : i - 1));
      return;
    }

    if (e.key === "Enter") {
      e.preventDefault();
      const selected = filtered[highlightedIndex];
      if (selected) {
        onSelectSession(selected.sessionId);
        onOpenChange(false);
      }
      return;
    }
  };

  const handleOverlayClick = () => {
    onOpenChange(false);
  };

  if (!open) return null;

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-start justify-center bg-foreground/30 backdrop-blur-sm pt-[20vh]"
      onClick={handleOverlayClick}
    >
      <div
        className="w-full max-w-xl rounded-lg border border-border bg-background shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-border p-3">
          <Input
            ref={inputRef}
            type="text"
            placeholder="Search threads..."
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setHighlightedIndex(0);
            }}
            onKeyDown={handleKeyDown}
            className="w-full"
            autoFocus
          />
        </div>

        <div className="max-h-80 overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="px-3 py-6 text-center text-sm text-muted-foreground">
              No threads found
            </div>
          ) : (
            filtered.map((session, index) => (
              <button
                key={session.sessionId}
                type="button"
                className={cn(
                  "w-full px-3 py-2 text-left transition-colors",
                  "border-b border-border/50 last:border-b-0",
                  index === highlightedIndex
                    ? "bg-muted text-foreground"
                    : "hover:bg-muted/50",
                )}
                onClick={() => {
                  onSelectSession(session.sessionId);
                  onOpenChange(false);
                }}
              >
                <p className="truncate text-sm font-medium">
                  {getCodexSessionTitle(session)}
                </p>
                {session.lastMessagePreview ? (
                  <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
                    {session.lastMessagePreview}
                  </p>
                ) : null}
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
