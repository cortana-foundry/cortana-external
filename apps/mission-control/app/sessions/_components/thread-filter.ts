import type { CodexSession } from "./types";

/**
 * Build a searchable haystack from a session's properties.
 */
export function buildSessionHaystack(session: CodexSession): string {
  const parts = [
    session.threadName || "",
    session.lastMessagePreview || "",
    session.cwd || "",
  ];
  return parts
    .map((p) => p.trim())
    .filter((p) => p.length > 0)
    .join(" ")
    .toLowerCase();
}

/**
 * Check if a session's haystack matches a query (case-insensitive, trimmed).
 */
export function sessionMatchesQuery(session: CodexSession, query: string): boolean {
  if (!query.trim()) return true;
  const haystack = buildSessionHaystack(session);
  return haystack.includes(query.trim().toLowerCase());
}
