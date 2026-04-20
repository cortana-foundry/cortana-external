import { describe, expect, it } from "vitest";
import { buildSessionHaystack, sessionMatchesQuery } from "./thread-filter";
import type { CodexSession } from "./types";

function makeSession(overrides: Partial<CodexSession> = {}): CodexSession {
  return {
    sessionId: "s1",
    threadName: "Test Thread",
    updatedAt: 1_700_000_000_000,
    cwd: "/tmp/project",
    model: "gpt-4",
    source: "exec",
    cliVersion: "0.1.0",
    lastMessagePreview: "Some preview",
    transcriptPath: null,
    ...overrides,
  };
}

describe("thread-filter", () => {
  describe("buildSessionHaystack", () => {
    it("combines threadName, preview, and cwd into lowercase haystack", () => {
      const session = makeSession({
        threadName: "MyThread",
        lastMessagePreview: "Hello World",
        cwd: "/home/user",
      });
      const haystack = buildSessionHaystack(session);
      expect(haystack).toBe("mythread hello world /home/user");
    });

    it("handles null/undefined values gracefully", () => {
      const session = makeSession({
        threadName: null,
        lastMessagePreview: undefined,
        cwd: "/tmp",
      });
      const haystack = buildSessionHaystack(session);
      expect(haystack).toBe("/tmp");
    });

    it("trims whitespace", () => {
      const session = makeSession({
        threadName: "  Thread  ",
        lastMessagePreview: "  preview  ",
      });
      const haystack = buildSessionHaystack(session);
      expect(haystack).toContain("thread");
      expect(haystack).toContain("preview");
    });
  });

  describe("sessionMatchesQuery", () => {
    it("returns true for empty query", () => {
      const session = makeSession();
      expect(sessionMatchesQuery(session, "")).toBe(true);
      expect(sessionMatchesQuery(session, "   ")).toBe(true);
    });

    it("matches threadName case-insensitively", () => {
      const session = makeSession({ threadName: "TESTING" });
      expect(sessionMatchesQuery(session, "testing")).toBe(true);
      expect(sessionMatchesQuery(session, "TEST")).toBe(true);
    });

    it("matches lastMessagePreview case-insensitively", () => {
      const session = makeSession({ lastMessagePreview: "Hello World" });
      expect(sessionMatchesQuery(session, "hello")).toBe(true);
      expect(sessionMatchesQuery(session, "WORLD")).toBe(true);
    });

    it("matches cwd case-insensitively", () => {
      const session = makeSession({ cwd: "/Home/Project" });
      expect(sessionMatchesQuery(session, "/home")).toBe(true);
      expect(sessionMatchesQuery(session, "project")).toBe(true);
    });

    it("returns false when no match found", () => {
      const session = makeSession();
      expect(sessionMatchesQuery(session, "nomatch")).toBe(false);
      expect(sessionMatchesQuery(session, "xyz123")).toBe(false);
    });

    it("trims the query before matching", () => {
      const session = makeSession({ threadName: "testing" });
      expect(sessionMatchesQuery(session, "  testing  ")).toBe(true);
    });
  });
});
