"use client";

import { useEffect, useState } from "react";

type ReadState = Record<string, number>;

const LOCAL_STORAGE_KEY = "mc-sessions-read-state";

export function useThreadReadState() {
  const [readState, setReadState] = useState<ReadState>({});

  useEffect(() => {
    if (typeof window === "undefined") return;

    try {
      const stored = window.localStorage.getItem(LOCAL_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as ReadState;
        // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot storage hydration on mount
        setReadState(parsed);
      }
    } catch {
      // Silently fail on invalid storage or quota exceeded
    }
  }, []);

  function isUnread(sessionId: string, updatedAt: number | null | undefined): boolean {
    if (!updatedAt) return false;
    const lastSeen = readState[sessionId] ?? 0;
    return updatedAt > lastSeen;
  }

  function markSeen(sessionId: string) {
    const now = Date.now();
    const newState = { ...readState, [sessionId]: now };
    setReadState(newState);

    if (typeof window === "undefined") return;

    try {
      window.localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(newState));
    } catch {
      // Silently fail on quota exceeded or other storage errors
    }
  }

  return { isUnread, markSeen };
}
