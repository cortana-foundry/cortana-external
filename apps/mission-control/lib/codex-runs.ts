import path from "node:path";
import { randomUUID } from "node:crypto";

import { getCodexThreadId, streamCodexJson } from "@/lib/codex-cli";
import { getVisibleCodexSessionDetail } from "@/lib/codex-session-access";
import { type CodexSessionDetail, waitForCodexSessionDetail } from "@/lib/codex-sessions";
import { upsertCodexMirrorThread } from "@/lib/codex-mirror";

export type CodexRunKind = "create" | "reply";
export type CodexRunStatus = "running" | "completed" | "errored";

export type CodexStreamEnvelope = {
  seq: number;
  event: string;
  data: unknown;
};

export type CodexRunRecord = {
  streamId: string;
  kind: CodexRunKind;
  status: CodexRunStatus;
  prompt: string;
  cwd: string;
  workspaceKey: string | null;
  sessionId: string | null;
  error: string | null;
  session: CodexSessionDetail | null;
  createdAt: number;
  updatedAt: number;
  events: CodexStreamEnvelope[];
};

type StartCreateOptions = {
  prompt: string;
  workspaceKey?: string | null;
  model?: string | null;
  imageIds?: string[] | null;
};

type StartReplyOptions = {
  sessionId: string;
  prompt: string;
  model?: string | null;
  imageIds?: string[] | null;
};

type ApprovedWorkspace = {
  key: string;
  cwd: string;
};

type CodexRunErrorCode =
  | "invalid_request"
  | "conflict"
  | "not_found"
  | "prerequisite_failed";

export class CodexRunError extends Error {
  code: CodexRunErrorCode;

  constructor(code: CodexRunErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

const DEFAULT_WORKSPACE = path.resolve(process.cwd(), "..", "..");
const STREAM_RETENTION_MS = 10 * 60_000;

const approvedWorkspaces = new Map<string, ApprovedWorkspace>([
  ["repo-root", { key: "repo-root", cwd: DEFAULT_WORKSPACE }],
]);

const activeRunsByStreamId = new Map<string, CodexRunRecord>();
const activeSessionRuns = new Map<string, string>();

function normalizePrompt(prompt: string) {
  return prompt.trim();
}

function buildThreadName(prompt: string) {
  const normalized = prompt.replace(/\s+/g, " ").trim();
  if (!normalized) return "Untitled Codex session";
  return normalized.length > 72 ? `${normalized.slice(0, 71)}…` : normalized;
}

function appendEvent(record: CodexRunRecord, event: string, data: unknown) {
  const envelope: CodexStreamEnvelope = {
    seq: record.events.length + 1,
    event,
    data,
  };
  record.events.push(envelope);
  record.updatedAt = Date.now();
}

function scheduleCleanup(streamId: string) {
  setTimeout(() => {
    const current = activeRunsByStreamId.get(streamId);
    if (!current) return;
    if (current.status === "running") return;
    activeRunsByStreamId.delete(streamId);
  }, STREAM_RETENTION_MS).unref?.();
}

function resolveWorkspace(workspaceKey?: string | null) {
  if (!workspaceKey) {
    return approvedWorkspaces.get("repo-root")!;
  }

  const workspace = approvedWorkspaces.get(workspaceKey);
  if (!workspace) {
    throw new CodexRunError("invalid_request", `Unsupported workspaceKey: ${workspaceKey}`);
  }

  return workspace;
}

function normalizeModelArg(model?: string | null) {
  const value = model?.trim();
  return value && value.length > 0 ? value : null;
}

function ensureImageIdsSupported(imageIds?: string[] | null) {
  if (imageIds && imageIds.length > 0) {
    throw new CodexRunError("invalid_request", "imageIds are not supported yet");
  }
}

function ensureSingleActiveRun(sessionId: string) {
  const activeStreamId = activeSessionRuns.get(sessionId);
  if (!activeStreamId) return;

  const active = activeRunsByStreamId.get(activeStreamId);
  if (!active || active.status !== "running") {
    activeSessionRuns.delete(sessionId);
    return;
  }

  throw new CodexRunError("conflict", `Codex session ${sessionId} already has an active run`);
}

function markRunErrored(record: CodexRunRecord, error: unknown) {
  const message = error instanceof Error ? error.message : "Codex run failed";
  record.status = "errored";
  record.error = message;
  appendEvent(record, "error", { error: message });
  scheduleCleanup(record.streamId);
}

async function finalizeRunSession(record: CodexRunRecord, sessionId: string, prompt: string) {
  const session = await waitForCodexSessionDetail(sessionId, {
    attempts: 20,
    delayMs: 250,
  });

  const normalizedSession: CodexSessionDetail = {
    ...session,
    threadName: session.threadName ?? buildThreadName(prompt),
  };

  await upsertCodexMirrorThread({
    sessionId,
    threadName: normalizedSession.threadName,
    cwd: normalizedSession.cwd,
    model: normalizedSession.model,
    source: normalizedSession.source,
    cliVersion: normalizedSession.cliVersion,
    transcriptPath: normalizedSession.transcriptPath,
    lastMessagePreview: normalizedSession.lastMessagePreview ?? prompt,
    updatedAt: normalizedSession.updatedAt ? new Date(normalizedSession.updatedAt) : new Date(),
  });

  record.sessionId = sessionId;
  record.session = normalizedSession;
  record.status = "completed";
  appendEvent(record, "done", { sessionId, session: normalizedSession });
  scheduleCleanup(record.streamId);
}

async function runCreate(record: CodexRunRecord, model?: string | null) {
  try {
    const args = ["exec", "--json", "--full-auto", "-C", record.cwd] as string[];
    const normalizedModel = normalizeModelArg(model);
    if (normalizedModel) {
      args.push("-m", normalizedModel);
    }
    args.push(record.prompt);

    const events = await streamCodexJson(args, {
      onEvent: (event) => {
        appendEvent(record, "codex_event", event);

        if (event.type === "thread.started" && typeof event.thread_id === "string") {
          record.sessionId = event.thread_id;
          appendEvent(record, "lifecycle", {
            streamId: record.streamId,
            codexSessionId: event.thread_id,
          });

          void upsertCodexMirrorThread({
            sessionId: event.thread_id,
            threadName: buildThreadName(record.prompt),
            cwd: record.cwd,
            source: "exec",
            status: "active",
            lastMessagePreview: record.prompt,
            updatedAt: new Date(),
          });
        }
      },
    });

    const sessionId = getCodexThreadId(events) ?? record.sessionId;
    if (!sessionId) {
      throw new CodexRunError("prerequisite_failed", "Codex CLI did not return a session id");
    }

    await finalizeRunSession(record, sessionId, record.prompt);
  } catch (error) {
    markRunErrored(record, error);
  }
}

async function runReply(record: CodexRunRecord, sessionId: string, model?: string | null) {
  activeSessionRuns.set(sessionId, record.streamId);

  try {
    const args = ["exec", "resume", "--json", "--full-auto"] as string[];
    const normalizedModel = normalizeModelArg(model);
    if (normalizedModel) {
      args.push("-m", normalizedModel);
    }
    args.push(sessionId, record.prompt);

    await upsertCodexMirrorThread({
      sessionId,
      lastMessagePreview: record.prompt,
      updatedAt: new Date(),
    });

    await streamCodexJson(args, {
      onEvent: (event) => {
        appendEvent(record, "codex_event", event);
      },
    });

    await finalizeRunSession(record, sessionId, record.prompt);
  } catch (error) {
    markRunErrored(record, error);
  } finally {
    const activeStreamId = activeSessionRuns.get(sessionId);
    if (activeStreamId === record.streamId) {
      activeSessionRuns.delete(sessionId);
    }
  }
}

export function getCodexRun(streamId: string) {
  return activeRunsByStreamId.get(streamId) ?? null;
}

export function getActiveCodexSessionIds() {
  return new Set(
    [...activeSessionRuns.entries()]
      .filter(([, streamId]) => activeRunsByStreamId.get(streamId)?.status === "running")
      .map(([sessionId]) => sessionId),
  );
}

export async function startCreateCodexRun(options: StartCreateOptions) {
  const prompt = normalizePrompt(options.prompt);
  if (!prompt) {
    throw new CodexRunError("invalid_request", "Prompt is required");
  }

  ensureImageIdsSupported(options.imageIds);
  const workspace = resolveWorkspace(options.workspaceKey);

  const record: CodexRunRecord = {
    streamId: randomUUID(),
    kind: "create",
    status: "running",
    prompt,
    cwd: workspace.cwd,
    workspaceKey: workspace.key,
    sessionId: null,
    error: null,
    session: null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    events: [],
  };

  appendEvent(record, "ready", {
    kind: "create",
    streamId: record.streamId,
    workspaceKey: workspace.key,
    ts: Date.now(),
  });

  activeRunsByStreamId.set(record.streamId, record);
  void runCreate(record, options.model);
  return { streamId: record.streamId };
}

export async function startReplyCodexRun(options: StartReplyOptions) {
  const prompt = normalizePrompt(options.prompt);
  if (!prompt) {
    throw new CodexRunError("invalid_request", "Prompt is required");
  }

  ensureImageIdsSupported(options.imageIds);
  ensureSingleActiveRun(options.sessionId);

  const existing = await getVisibleCodexSessionDetail(options.sessionId);
  if (!existing) {
    throw new CodexRunError("not_found", `Codex session ${options.sessionId} not found`);
  }

  const record: CodexRunRecord = {
    streamId: randomUUID(),
    kind: "reply",
    status: "running",
    prompt,
    cwd: existing.cwd ?? DEFAULT_WORKSPACE,
    workspaceKey: null,
    sessionId: options.sessionId,
    error: null,
    session: null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    events: [],
  };

  appendEvent(record, "ready", {
    kind: "reply",
    streamId: record.streamId,
    sessionId: options.sessionId,
    ts: Date.now(),
  });

  activeRunsByStreamId.set(record.streamId, record);
  void runReply(record, options.sessionId, options.model);
  return { streamId: record.streamId };
}
