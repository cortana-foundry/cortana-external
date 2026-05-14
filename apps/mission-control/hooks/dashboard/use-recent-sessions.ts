"use client";

import { useEffect, useState } from "react";

export type SessionItem = {
  key: string | null;
  updatedAt: number | null;
  agentId: string | null;
  model: string | null;
  abortedLastRun?: boolean | null;
};

type SessionsPayload = {
  sessions: SessionItem[];
};

const SESSION_WINDOW_MINUTES = 1440;

export function useRecentSessions() {
  const [sessions, setSessions] = useState<SessionItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch(`/api/sessions?minutes=${SESSION_WINDOW_MINUTES}`, { cache: "no-store" });
        if (!res.ok) throw new Error(`sessions ${res.status}`);
        const payload = (await res.json()) as SessionsPayload;
        if (!cancelled) {
          setSessions(payload.sessions ?? []);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load sessions");
        }
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  return { sessions, error };
}

export function getSessionDisplayName(session: SessionItem) {
  if (session.agentId && session.agentId !== "unknown") return session.agentId;
  const source = (session.key || "").trim();
  if (!source) return "session";
  const parts = source.split(":");
  return parts.length > 1 ? parts[1] || source : source;
}
