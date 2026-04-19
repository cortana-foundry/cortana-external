"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatInt, formatCost } from "@/lib/format-utils";

type OpenClawSession = {
  key: string | null;
  sessionId: string | null;
  updatedAt: number | null;
  totalTokens: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
  model: string | null;
  agentId: string | null;
  systemSent: boolean | null;
  abortedLastRun: boolean | null;
  estimatedCost: number;
};

type CodexSession = {
  sessionId: string;
  threadName: string | null;
  updatedAt: number | null;
  cwd: string | null;
  model: string | null;
  source: string | null;
  cliVersion: string | null;
  lastMessagePreview: string | null;
  transcriptPath: string | null;
};

type OpenClawSessionsResponse = { sessions: OpenClawSession[]; error?: string };
type CodexSessionsResponse = { sessions: CodexSession[]; error?: string };

export function summarizeOpenClawSessions(sessions: OpenClawSession[]) {
  return sessions.reduce(
    (acc, session) => {
      acc.total += 1;
      acc.inputTokens += session.inputTokens ?? 0;
      acc.outputTokens += session.outputTokens ?? 0;
      acc.estimatedCost += session.estimatedCost ?? 0;
      acc.systemSent += session.systemSent ? 1 : 0;
      acc.aborted += session.abortedLastRun ? 1 : 0;

      if (session.updatedAt && (!acc.latestUpdatedAt || session.updatedAt > acc.latestUpdatedAt)) {
        acc.latestUpdatedAt = session.updatedAt;
      }

      return acc;
    },
    {
      total: 0,
      inputTokens: 0,
      outputTokens: 0,
      estimatedCost: 0,
      systemSent: 0,
      aborted: 0,
      latestUpdatedAt: null as number | null,
    }
  );
}

export function summarizeCodexSessions(sessions: CodexSession[]) {
  return sessions.reduce(
    (acc, session) => {
      acc.total += 1;
      if (session.updatedAt && (!acc.latestUpdatedAt || session.updatedAt > acc.latestUpdatedAt)) {
        acc.latestUpdatedAt = session.updatedAt;
      }
      if (session.cwd) acc.withCwd += 1;
      if (session.lastMessagePreview) acc.withPreview += 1;
      return acc;
    },
    {
      total: 0,
      latestUpdatedAt: null as number | null,
      withCwd: 0,
      withPreview: 0,
    }
  );
}

export default function SessionsPage() {
  const [openClawSessions, setOpenClawSessions] = useState<OpenClawSession[]>([]);
  const [codexSessions, setCodexSessions] = useState<CodexSession[]>([]);
  const [openClawError, setOpenClawError] = useState<string | null>(null);
  const [codexError, setCodexError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const [openClawResult, codexResult] = await Promise.allSettled([
        fetch("/api/sessions", { cache: "no-store" }),
        fetch("/api/codex/sessions", { cache: "no-store" }),
      ]);

      if (cancelled) return;

      if (openClawResult.status === "fulfilled") {
        try {
          const payload = (await openClawResult.value.json()) as OpenClawSessionsResponse;
          if (!openClawResult.value.ok) {
            throw new Error(payload.error ?? "Failed to load OpenClaw sessions");
          }
          setOpenClawSessions(payload.sessions ?? []);
        } catch (err) {
          setOpenClawError(err instanceof Error ? err.message : "Failed to load OpenClaw sessions");
        }
      } else {
        setOpenClawError(openClawResult.reason instanceof Error ? openClawResult.reason.message : "Failed to load OpenClaw sessions");
      }

      if (codexResult.status === "fulfilled") {
        try {
          const payload = (await codexResult.value.json()) as CodexSessionsResponse;
          if (!codexResult.value.ok) {
            throw new Error(payload.error ?? "Failed to load Codex sessions");
          }
          setCodexSessions(payload.sessions ?? []);
        } catch (err) {
          setCodexError(err instanceof Error ? err.message : "Failed to load Codex sessions");
        }
      } else {
        setCodexError(codexResult.reason instanceof Error ? codexResult.reason.message : "Failed to load Codex sessions");
      }

      if (!cancelled) {
        setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const openClawSummary = useMemo(() => summarizeOpenClawSessions(openClawSessions), [openClawSessions]);
  const codexSummary = useMemo(() => summarizeCodexSessions(codexSessions), [codexSessions]);
  const hasData = openClawSessions.length > 0 || codexSessions.length > 0;

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">Sessions</h1>
        <p className="text-sm text-muted-foreground">
          Mission Control session hub for local Codex and OpenClaw activity.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Codex sessions</CardTitle></CardHeader>
          <CardContent className="text-2xl font-semibold">{formatInt(codexSummary.total)}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">OpenClaw sessions</CardTitle></CardHeader>
          <CardContent className="text-2xl font-semibold">{formatInt(openClawSummary.total)}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Input tokens</CardTitle></CardHeader>
          <CardContent className="text-2xl font-semibold">{formatInt(openClawSummary.inputTokens)}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Output tokens</CardTitle></CardHeader>
          <CardContent className="text-2xl font-semibold">{formatInt(openClawSummary.outputTokens)}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Estimated cost</CardTitle></CardHeader>
          <CardContent className="text-2xl font-semibold">{formatCost(openClawSummary.estimatedCost)}</CardContent>
        </Card>
      </div>

      {!loading ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Session providers</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <div className="rounded-md border p-3">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Codex latest</p>
              <p className="text-sm font-medium">
                {codexSummary.latestUpdatedAt ? new Date(codexSummary.latestUpdatedAt).toLocaleString() : "N/A"}
              </p>
            </div>
            <div className="rounded-md border p-3">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Codex with cwd</p>
              <p className="text-xl font-semibold">{formatInt(codexSummary.withCwd)}</p>
            </div>
            <div className="rounded-md border p-3">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Codex with preview</p>
              <p className="text-xl font-semibold">{formatInt(codexSummary.withPreview)}</p>
            </div>
            <div className="rounded-md border p-3">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">OpenClaw system-started</p>
              <p className="text-xl font-semibold">{formatInt(openClawSummary.systemSent)}</p>
            </div>
            <div className="rounded-md border p-3">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">OpenClaw aborted</p>
              <p className="text-xl font-semibold">{formatInt(openClawSummary.aborted)}</p>
            </div>
            <div className="rounded-md border p-3">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">OpenClaw latest</p>
              <p className="text-sm font-medium">
                {openClawSummary.latestUpdatedAt ? new Date(openClawSummary.latestUpdatedAt).toLocaleString() : "N/A"}
              </p>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {loading ? <p className="text-sm text-muted-foreground">Loading session providers…</p> : null}

      {!loading ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recent sessions</CardTitle>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="codex" className="space-y-4">
              <TabsList variant="line" className="w-full justify-start overflow-x-auto font-mono text-xs uppercase tracking-wide">
                <TabsTrigger value="codex">Codex</TabsTrigger>
                <TabsTrigger value="openclaw">OpenClaw</TabsTrigger>
              </TabsList>

              <TabsContent value="codex" className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Discovery reads the local Codex session index from <code>~/.codex</code>. Transcript and resume flows land next.
                </p>
                {codexError ? <p className="text-sm text-destructive">{codexError}</p> : null}
                {!codexError && codexSessions.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No Codex sessions found.</p>
                ) : (
                  <div className="space-y-3">
                    {codexSessions.map((session) => (
                      <div key={session.sessionId} className="rounded-md border p-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="font-medium">{session.threadName ?? "Untitled Codex session"}</p>
                          <p className="text-xs text-muted-foreground">{session.model ?? "unknown-model"}</p>
                        </div>
                        <p className="mt-1 break-all text-xs text-muted-foreground">{session.sessionId}</p>
                        <p className="mt-2 text-xs text-muted-foreground">
                          {session.cwd ?? "cwd unavailable"} · {session.updatedAt ? new Date(session.updatedAt).toLocaleString() : "unknown update"}
                        </p>
                        <p className="mt-2 text-sm text-muted-foreground">
                          {session.lastMessagePreview ?? "No transcript preview available yet."}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </TabsContent>

              <TabsContent value="openclaw" className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Active OpenClaw sessions across agents, including token usage and estimated cost.
                </p>
                {openClawError ? <p className="text-sm text-destructive">{openClawError}</p> : null}
                {!openClawError && openClawSessions.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No active OpenClaw sessions found.</p>
                ) : (
                  <div className="space-y-3">
                    {openClawSessions.map((session, index) => (
                      <div key={session.key ?? session.sessionId ?? `session-${index}`} className="rounded-md border p-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="font-medium">{session.agentId ?? "unknown-agent"}</p>
                          <p className="text-xs text-muted-foreground">{session.model ?? "unknown-model"}</p>
                        </div>
                        <p className="mt-1 break-all text-xs text-muted-foreground">{session.sessionId ?? session.key ?? "no-session-id"}</p>
                        <p className="mt-2 text-xs text-muted-foreground">
                          {formatInt(session.totalTokens ?? 0)} tokens · {formatCost(session.estimatedCost ?? 0)}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      ) : null}

      {!loading && !hasData && !openClawError && !codexError ? (
        <p className="text-sm text-muted-foreground">No session activity found yet.</p>
      ) : null}
    </div>
  );
}
