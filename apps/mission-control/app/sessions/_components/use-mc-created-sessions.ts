"use client";
import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "mc-created-session-ids";
const MAX_RETAINED = 50; // cap to avoid unbounded localStorage growth

type MCCreatedSessions = {
  ids: string[];
  register: (sessionId: string) => void;
};

export function useMCCreatedSessions(): MCCreatedSessions {
  const [ids, setIds] = useState<string[]>([]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as unknown;
        if (Array.isArray(parsed) && parsed.every((item) => typeof item === "string")) {
          // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot storage hydration on mount
          setIds(parsed as string[]);
        }
      }
    } catch {
      // Silently fail on invalid storage
    }
  }, []);

  const register = useCallback(
    (sessionId: string) => {
      setIds((current) => {
        // Check if already present
        if (current.includes(sessionId)) {
          return current;
        }

        // Prepend and cap at MAX_RETAINED
        const updated = [sessionId, ...current].slice(0, MAX_RETAINED);

        if (typeof window !== "undefined") {
          try {
            window.localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
          } catch {
            // Silently fail on quota exceeded or other storage errors
          }
        }

        return updated;
      });
    },
    [],
  );

  return { ids, register };
}
