import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

import prisma from "@/lib/prisma";
import {
  getCodexSessionDetail,
  parseCodexSessionIndex,
  type CodexSessionDetail,
  type CodexSessionEvent,
  type CodexSessionSummary,
} from "@/lib/codex-sessions";

const DEFAULT_CODEX_ROOT = path.join(os.homedir(), ".codex");
const DEFAULT_SESSION_INDEX_PATH = path.join(DEFAULT_CODEX_ROOT, "session_index.jsonl");
const DEFAULT_SESSIONS_ROOT = path.join(DEFAULT_CODEX_ROOT, "sessions");
const DEFAULT_ARCHIVED_ROOT = path.join(DEFAULT_CODEX_ROOT, "archived_sessions");
const DEFAULT_CODEX_STATE_DB_PATH = path.join(DEFAULT_CODEX_ROOT, "state_5.sqlite");
const execFileAsync = promisify(execFile);

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };
type CodexMirrorLifecycleState = "active" | "archived" | "missing";

type CodexMirrorThreadRow = {
  id: string;
  thread_name: string | null;
  cwd: string | null;
  model: string | null;
  source: string | null;
  cli_version: string | null;
  last_message_preview: string | null;
  transcript_path: string | null;
  status: string;
  created_at: Date;
  updated_at: Date;
  last_turn_started_at: Date | null;
  last_turn_completed_at: Date | null;
  lifecycle_state: CodexMirrorLifecycleState;
  last_reconciled_at: Date | null;
};

type CodexMirrorMessageRow = {
  id: string;
  thread_id: string;
  turn_id: string | null;
  role: string;
  message_type: string;
  phase: string | null;
  content: string;
  created_at: Date;
  updated_at: Date;
  completed_at: Date | null;
};

type CodexAppServerNotification = {
  method: string;
  params: Record<string, unknown>;
};

type ReconcileCodexMirrorOptions = {
  stateDbPath?: string;
  sessionIndexPath?: string;
  sessionsRoot?: string;
  archivedRoot?: string;
  limit?: number;
};

type CodexLocalThreadStateRow = {
  id: string;
  title: string;
  cwd: string;
  source: string;
  cli_version: string;
  model: string | null;
  rollout_path: string;
  archived: number;
  archived_at: number | null;
  updated_at_ms: number | null;
};

function escapeLiteral(value: string) {
  return value.replaceAll("'", "''");
}

function toSqlString(value: string | null | undefined) {
  if (value == null) return "NULL";
  return `'${escapeLiteral(value)}'`;
}

function toSqlJson(value: JsonValue | Record<string, unknown> | null | undefined) {
  if (value == null) return "NULL";
  return `'${JSON.stringify(value).replaceAll("'", "''")}'::jsonb`;
}

function toSqlTimestamp(value: Date | string | null | undefined) {
  if (!value) return "NULL";
  const timestamp = value instanceof Date ? value.toISOString() : value;
  return `'${escapeLiteral(timestamp)}'::timestamptz`;
}

function toSqlNumber(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "NULL";
  return `${value}`;
}

function clampLimit(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return 20;
  return Math.max(1, Math.min(Math.floor(value), 1000));
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function asString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  return null;
}

function asDateFromSeconds(value: unknown): Date | null {
  const seconds = asNumber(value);
  if (seconds == null) return null;
  return new Date(seconds * 1000);
}

function asDate(value: unknown): Date | null {
  if (value instanceof Date) return value;
  if (typeof value === "string") {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  return null;
}

function truncatePreview(value: string, maxLength = 160) {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength - 1)}…`;
}

function chooseCanonicalThreadName(...candidates: Array<string | null | undefined>) {
  for (const candidate of candidates) {
    if (typeof candidate !== "string") continue;
    const trimmed = candidate.trim();
    if (trimmed.length > 0) {
      return trimmed;
    }
  }

  return null;
}

async function readCodexSessionIndexNames(
  sessionIds: string[],
  sessionIndexPath = DEFAULT_SESSION_INDEX_PATH,
) {
  const uniqueSessionIds = [...new Set(sessionIds.map((value) => value.trim()).filter(Boolean))];
  if (uniqueSessionIds.length === 0) {
    return new Map<string, string>();
  }

  const wantedIds = new Set(uniqueSessionIds);

  try {
    const raw = await fs.readFile(sessionIndexPath, "utf8");
    const names = new Map<string, string>();

    for (const entry of parseCodexSessionIndex(raw)) {
      if (!wantedIds.has(entry.id) || !entry.threadName) {
        continue;
      }

      names.set(entry.id, entry.threadName);
      if (names.size >= wantedIds.size) {
        break;
      }
    }

    return names;
  } catch {
    return new Map<string, string>();
  }
}

function buildSessionSummary(row: CodexMirrorThreadRow): CodexSessionSummary {
  return {
    sessionId: row.id,
    threadName: row.thread_name,
    updatedAt: row.updated_at.getTime(),
    cwd: row.cwd,
    model: row.model,
    source: row.source,
    cliVersion: row.cli_version,
    lastMessagePreview: row.last_message_preview,
    transcriptPath: row.transcript_path,
  };
}

function extractSessionIdFromTranscriptFile(entry: string) {
  const match = entry.match(/([0-9a-f]{8}-[0-9a-f-]{27})\.jsonl$/i);
  return match?.[1] ?? null;
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function findActiveTranscriptPath(
  sessionId: string,
  updatedAt: number | null,
  sessionsRoot: string,
) {
  if (!updatedAt) return null;

  const updatedDate = new Date(updatedAt);
  if (Number.isNaN(updatedDate.getTime())) {
    return null;
  }

  const dailyDir = path.join(
    sessionsRoot,
    String(updatedDate.getUTCFullYear()),
    String(updatedDate.getUTCMonth() + 1).padStart(2, "0"),
    String(updatedDate.getUTCDate()).padStart(2, "0"),
  );

  try {
    const entries = await fs.readdir(dailyDir);
    const match = entries.find((entry) => entry.includes(sessionId) && entry.endsWith(".jsonl"));
    return match ? path.join(dailyDir, match) : null;
  } catch {
    return null;
  }
}

async function readCodexThreadStateRows(stateDbPath: string) {
  return readCodexThreadStateRowsWithOptions(stateDbPath);
}

async function readCodexThreadStateRowsWithOptions(
  stateDbPath: string,
  options: {
    sessionIds?: string[];
    limit?: number;
    activeOnly?: boolean;
  } = {},
) {
  const filters: string[] = [];
  const safeSessionIds = [...new Set((options.sessionIds ?? []).map((value) => value.trim()).filter(Boolean))];
  if (safeSessionIds.length > 0) {
    filters.push(`id IN (${safeSessionIds.map((sessionId) => `'${escapeLiteral(sessionId)}'`).join(", ")})`);
  }

  if (options.activeOnly) {
    filters.push("archived = 0");
  }

  const whereClause = filters.length > 0 ? `WHERE ${filters.join(" AND ")}` : "";
  const limitClause = options.limit && Number.isFinite(options.limit) && options.limit > 0
    ? `LIMIT ${Math.max(1, Math.floor(options.limit))}`
    : "";

  try {
    const { stdout } = await execFileAsync("sqlite3", [
      "-json",
      stateDbPath,
      `
        SELECT
          id,
          title,
          cwd,
          source,
          cli_version,
          model,
          rollout_path,
          archived,
          archived_at,
          COALESCE(updated_at_ms, updated_at * 1000) AS updated_at_ms
        FROM threads
        ${whereClause}
        ORDER BY COALESCE(updated_at_ms, updated_at * 1000) DESC
        ${limitClause}
      `,
    ], {
      maxBuffer: 8 * 1024 * 1024,
    });

    if (!stdout.trim()) {
      return [] as CodexLocalThreadStateRow[];
    }

    return JSON.parse(stdout) as CodexLocalThreadStateRow[];
  } catch {
    return [] as CodexLocalThreadStateRow[];
  }
}

function buildSessionEvent(row: CodexMirrorMessageRow): CodexSessionEvent {
  const timestamp = row.completed_at ?? row.created_at;
  return {
    id: row.id,
    role: row.role === "assistant" ? "assistant" : "user",
    text: row.content,
    timestamp: timestamp.getTime(),
    phase: row.phase,
    rawType: row.message_type,
  };
}

async function safeQuery<T>(query: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await query();
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (
      message.includes("does not exist")
      || message.includes("relation")
      || message.includes("column")
      || message.includes("foreign key")
    ) {
      return fallback;
    }

    throw error;
  }
}

export async function listCodexMirroredSessions(limit = 20): Promise<CodexSessionSummary[]> {
  const safeLimit = Math.max(1, Math.min(limit, 1000));
  const sql = `
    SELECT
      id,
      thread_name,
      cwd,
      model,
      source,
      cli_version,
      last_message_preview,
      transcript_path,
      status,
      created_at,
      updated_at,
      last_turn_started_at,
      last_turn_completed_at,
      lifecycle_state,
      last_reconciled_at
    FROM mc_codex_threads
    WHERE lifecycle_state = 'active'
    ORDER BY updated_at DESC
    LIMIT ${safeLimit}
  `;

  const rows = await safeQuery(
    () => prisma.$queryRawUnsafe<CodexMirrorThreadRow[]>(sql),
    [],
  );
  return rows.map(buildSessionSummary);
}

export async function getCodexMirroredSessionDetail(sessionId: string): Promise<CodexSessionDetail | null> {
  const safeSessionId = escapeLiteral(sessionId);
  const [threadRows, messageRows] = await safeQuery(
    async () => {
      const [threads, messages] = await Promise.all([
        prisma.$queryRawUnsafe<CodexMirrorThreadRow[]>(`
          SELECT
            id,
            thread_name,
            cwd,
            model,
            source,
            cli_version,
            last_message_preview,
            transcript_path,
            status,
            created_at,
            updated_at,
            last_turn_started_at,
            last_turn_completed_at,
            lifecycle_state,
            last_reconciled_at
          FROM mc_codex_threads
          WHERE id = '${safeSessionId}'
            AND lifecycle_state = 'active'
          LIMIT 1
        `),
        prisma.$queryRawUnsafe<CodexMirrorMessageRow[]>(`
          SELECT
            id,
            thread_id,
            turn_id,
            role,
            message_type,
            phase,
            content,
            created_at,
            updated_at,
            completed_at
          FROM mc_codex_messages
          WHERE thread_id = '${safeSessionId}'
          ORDER BY row_id ASC
        `),
      ]);
      return [threads, messages] as const;
    },
    [[], []] as const,
  );

  const row = threadRows[0];
  if (!row) return null;

  return {
    ...buildSessionSummary(row),
    events: messageRows.map(buildSessionEvent),
  };
}

export async function upsertCodexMirrorThread(data: {
  sessionId: string;
  threadName?: string | null;
  cwd?: string | null;
  model?: string | null;
  source?: string | null;
  cliVersion?: string | null;
  transcriptPath?: string | null;
  status?: string | null;
  lifecycleState?: CodexMirrorLifecycleState | null;
  lastMessagePreview?: string | null;
  createdAt?: Date | string | null;
  updatedAt?: Date | string | null;
  lastReconciledAt?: Date | string | null;
  metadata?: Record<string, unknown> | null;
}) {
  const statusSql = toSqlString(data.status);
  const lifecycleStateSql = toSqlString(data.lifecycleState);
  const updatedAtSql = toSqlTimestamp(data.updatedAt);
  const lastReconciledAtSql = toSqlTimestamp(data.lastReconciledAt);
  const sql = `
    INSERT INTO mc_codex_threads (
      id,
      thread_name,
      cwd,
      model,
      source,
      cli_version,
      transcript_path,
      status,
      lifecycle_state,
      last_message_preview,
      created_at,
      updated_at,
      last_reconciled_at,
      metadata
    )
    VALUES (
      '${escapeLiteral(data.sessionId)}',
      ${toSqlString(data.threadName)},
      ${toSqlString(data.cwd)},
      ${toSqlString(data.model)},
      ${toSqlString(data.source)},
      ${toSqlString(data.cliVersion)},
      ${toSqlString(data.transcriptPath)},
      COALESCE(${statusSql}, 'idle'),
      COALESCE(${lifecycleStateSql}, 'active'),
      ${toSqlString(data.lastMessagePreview ? truncatePreview(data.lastMessagePreview) : null)},
      COALESCE(${toSqlTimestamp(data.createdAt)}, CURRENT_TIMESTAMP),
      COALESCE(${updatedAtSql}, CURRENT_TIMESTAMP),
      ${lastReconciledAtSql},
      ${toSqlJson(data.metadata)}
    )
    ON CONFLICT (id) DO UPDATE SET
      thread_name = COALESCE(EXCLUDED.thread_name, mc_codex_threads.thread_name),
      cwd = COALESCE(EXCLUDED.cwd, mc_codex_threads.cwd),
      model = COALESCE(EXCLUDED.model, mc_codex_threads.model),
      source = COALESCE(EXCLUDED.source, mc_codex_threads.source),
      cli_version = COALESCE(EXCLUDED.cli_version, mc_codex_threads.cli_version),
      transcript_path = COALESCE(EXCLUDED.transcript_path, mc_codex_threads.transcript_path),
      status = COALESCE(${statusSql}, mc_codex_threads.status),
      lifecycle_state = COALESCE(${lifecycleStateSql}, mc_codex_threads.lifecycle_state),
      last_message_preview = COALESCE(EXCLUDED.last_message_preview, mc_codex_threads.last_message_preview),
      updated_at = CASE
        WHEN ${updatedAtSql} IS NULL THEN mc_codex_threads.updated_at
        ELSE GREATEST(mc_codex_threads.updated_at, EXCLUDED.updated_at)
      END,
      last_reconciled_at = COALESCE(EXCLUDED.last_reconciled_at, mc_codex_threads.last_reconciled_at),
      metadata = COALESCE(EXCLUDED.metadata, mc_codex_threads.metadata)
  `;

  await safeQuery(() => prisma.$executeRawUnsafe(sql), 0);
}

async function listCodexMirrorThreadRows() {
  return safeQuery(
    () =>
      prisma.$queryRawUnsafe<
        Array<Pick<CodexMirrorThreadRow, "id" | "thread_name" | "updated_at" | "transcript_path" | "lifecycle_state">>
      >(`
        SELECT
          id,
          thread_name,
          updated_at,
          transcript_path,
          lifecycle_state
        FROM mc_codex_threads
      `),
    [],
  );
}

async function resolveCodexFilesystemLifecycle(
  sessionId: string,
  options: Pick<ReconcileCodexMirrorOptions, "stateDbPath"> = {},
) {
  const stateDbPath = options.stateDbPath ?? DEFAULT_CODEX_STATE_DB_PATH;
  const rows = await readCodexThreadStateRowsWithOptions(stateDbPath, {
    sessionIds: [sessionId],
  });
  const row = rows.find((candidate) => candidate.id === sessionId) ?? null;

  if (!row) {
    return {
      lifecycleState: "missing" as const,
      threadName: null,
      updatedAt: null,
      transcriptPath: null,
      stateRow: null,
    };
  }

  const transcriptPath = await fileExists(row.rollout_path) ? row.rollout_path : null;
  if (row.archived) {
    return {
      lifecycleState: "archived" as const,
      threadName: row.title,
      updatedAt: row.updated_at_ms,
      transcriptPath,
      stateRow: row,
    };
  }

  return {
    lifecycleState: "active" as const,
    threadName: row.title,
    updatedAt: row.updated_at_ms,
    transcriptPath,
    stateRow: row,
  };
}

export async function reconcileCodexMirrorSession(
  sessionId: string,
  options: Pick<ReconcileCodexMirrorOptions, "stateDbPath" | "sessionIndexPath" | "sessionsRoot" | "archivedRoot"> = {},
): Promise<CodexMirrorLifecycleState> {
  const stateDbPath = options.stateDbPath ?? DEFAULT_CODEX_STATE_DB_PATH;
  const sessionIndexPath = options.sessionIndexPath ?? DEFAULT_SESSION_INDEX_PATH;
  const sessionsRoot = options.sessionsRoot ?? DEFAULT_SESSIONS_ROOT;
  const archivedRoot = options.archivedRoot ?? DEFAULT_ARCHIVED_ROOT;
  const reconciledAt = new Date();

  const [filesystemState, canonicalNames] = await Promise.all([
    resolveCodexFilesystemLifecycle(sessionId, {
      stateDbPath,
    }),
    readCodexSessionIndexNames([sessionId], sessionIndexPath),
  ]);
  const canonicalThreadName = canonicalNames.get(sessionId) ?? null;

  if (filesystemState.lifecycleState === "active") {
    try {
      const session = await getCodexSessionDetail(sessionId, {
        sessionIndexPath,
        sessionsRoot,
        archivedRoot,
      });

      await syncCodexMirrorThreadFromSession(session, {
        lifecycleState: "active",
        lastReconciledAt: reconciledAt,
      });
    } catch {
      await upsertCodexMirrorThread({
        sessionId,
        threadName: chooseCanonicalThreadName(canonicalThreadName, filesystemState.threadName),
        cwd: filesystemState.stateRow?.cwd,
        model: filesystemState.stateRow?.model,
        source: filesystemState.stateRow?.source,
        cliVersion: filesystemState.stateRow?.cli_version,
        transcriptPath: filesystemState.transcriptPath,
        updatedAt: filesystemState.updatedAt ? new Date(filesystemState.updatedAt) : null,
        lifecycleState: "active",
        lastReconciledAt: reconciledAt,
      });
    }

    return "active";
  }

  await upsertCodexMirrorThread({
    sessionId,
    threadName: chooseCanonicalThreadName(canonicalThreadName, filesystemState.threadName),
    transcriptPath: filesystemState.transcriptPath,
    lifecycleState: filesystemState.lifecycleState,
    lastReconciledAt: reconciledAt,
  });

  return filesystemState.lifecycleState;
}

export async function reconcileCodexMirrorSessions(options: ReconcileCodexMirrorOptions = {}) {
  const stateDbPath = options.stateDbPath ?? DEFAULT_CODEX_STATE_DB_PATH;
  const sessionIndexPath = options.sessionIndexPath ?? DEFAULT_SESSION_INDEX_PATH;
  const limit = clampLimit(options.limit);
  const reconciledAt = new Date();

  const [activeEntries, mirrorRows] = await Promise.all([
    readCodexThreadStateRowsWithOptions(stateDbPath, {
      activeOnly: true,
      limit,
    }),
    listCodexMirrorThreadRows(),
  ]);

  const mirroredIds = new Set(mirrorRows.map((row) => row.id));
  const activeIds = new Set(activeEntries.map((entry) => entry.id));
  const mirrorLookupIds = mirrorRows
    .map((row) => row.id)
    .filter((id) => !activeIds.has(id));
  const mirrorStateRows = mirrorLookupIds.length > 0
    ? await readCodexThreadStateRowsWithOptions(stateDbPath, {
        sessionIds: mirrorLookupIds,
      })
    : [];
  const stateRowsById = new Map([...activeEntries, ...mirrorStateRows].map((row) => [row.id, row] as const));
  const mirrorRowsById = new Map(mirrorRows.map((row) => [row.id, row] as const));
  const canonicalNames = await readCodexSessionIndexNames(
    [...activeEntries.map((entry) => entry.id), ...mirrorRows.map((row) => row.id)],
    sessionIndexPath,
  );

  await Promise.allSettled(
    activeEntries.map(async (entry) => {
      await upsertCodexMirrorThread({
        sessionId: entry.id,
        threadName: chooseCanonicalThreadName(
          canonicalNames.get(entry.id),
          mirrorRowsById.get(entry.id)?.thread_name ?? null,
          entry.title,
        ),
        cwd: entry.cwd,
        model: entry.model,
        source: entry.source,
        cliVersion: entry.cli_version,
        transcriptPath: await fileExists(entry.rollout_path) ? entry.rollout_path : null,
        updatedAt: entry.updated_at_ms ? new Date(entry.updated_at_ms) : null,
        lifecycleState: "active",
        lastReconciledAt: reconciledAt,
      });
    }),
  );

  await Promise.allSettled(
    mirrorRows
      .filter((row) => !activeIds.has(row.id))
      .map(async (row) => {
        const stateRow = stateRowsById.get(row.id) ?? null;
        await upsertCodexMirrorThread({
          sessionId: row.id,
          threadName: chooseCanonicalThreadName(
            canonicalNames.get(row.id),
            row.thread_name,
            stateRow?.title ?? null,
          ),
          cwd: stateRow?.cwd,
          model: stateRow?.model,
          source: stateRow?.source,
          cliVersion: stateRow?.cli_version,
          transcriptPath: stateRow?.rollout_path ?? row.transcript_path,
          updatedAt: stateRow?.updated_at_ms ? new Date(stateRow.updated_at_ms) : null,
          lifecycleState: stateRow?.archived ? "archived" : "missing",
          lastReconciledAt: reconciledAt,
        });
      }),
  );
}

async function ensureMirrorTurn(threadId: string, turnId: string) {
  await ensureMirrorThread(threadId);

  const sql = `
    INSERT INTO mc_codex_turns (id, thread_id, status)
    VALUES ('${escapeLiteral(turnId)}', '${escapeLiteral(threadId)}', 'pending')
    ON CONFLICT (id) DO NOTHING
  `;

  await safeQuery(() => prisma.$executeRawUnsafe(sql), 0);
}

async function ensureMirrorThread(threadId: string) {
  await upsertCodexMirrorThread({
    sessionId: threadId,
    updatedAt: new Date(),
  });
}

export async function recordCodexMirrorNotification(notification: CodexAppServerNotification) {
  const method = notification.method;
  const params = notification.params;

  if (method === "thread/status/changed") {
    const threadId = asString(params.threadId);
    const status = asString(asRecord(params.status)?.type) ?? asString(params.status);
    if (!threadId) return;

    await ensureMirrorThread(threadId);
    await safeQuery(
      () =>
        prisma.$executeRawUnsafe(`
          UPDATE mc_codex_threads
          SET status = COALESCE(${toSqlString(status)}, status),
              updated_at = CURRENT_TIMESTAMP
          WHERE id = '${escapeLiteral(threadId)}'
        `),
      0,
    );
    return;
  }

  if (method === "thread/name/updated") {
    const threadId = asString(params.threadId);
    const threadName = asString(params.threadName);
    if (!threadId) return;

    await upsertCodexMirrorThread({
      sessionId: threadId,
      threadName,
      updatedAt: new Date(),
    });
    return;
  }

  if (method === "turn/started") {
    const threadId = asString(params.threadId);
    const turn = asRecord(params.turn);
    const turnId = asString(turn?.id);
    const startedAt = asDateFromSeconds(turn?.startedAt);
    const status = asString(turn?.status) ?? "inProgress";
    if (!threadId || !turnId) return;

    await ensureMirrorTurn(threadId, turnId);
    await safeQuery(
      () =>
        prisma.$executeRawUnsafe(`
          UPDATE mc_codex_turns
          SET status = '${escapeLiteral(status)}',
              started_at = COALESCE(${toSqlTimestamp(startedAt)}, started_at, CURRENT_TIMESTAMP),
              updated_at = CURRENT_TIMESTAMP
          WHERE id = '${escapeLiteral(turnId)}'
        `),
      0,
    );
    await safeQuery(
      () =>
        prisma.$executeRawUnsafe(`
          UPDATE mc_codex_threads
          SET status = 'active',
              last_turn_started_at = COALESCE(${toSqlTimestamp(startedAt)}, CURRENT_TIMESTAMP),
              updated_at = COALESCE(${toSqlTimestamp(startedAt)}, CURRENT_TIMESTAMP)
          WHERE id = '${escapeLiteral(threadId)}'
        `),
      0,
    );
    return;
  }

  if (method === "item/started" || method === "item/completed") {
    const threadId = asString(params.threadId);
    const turnId = asString(params.turnId);
    const item = asRecord(params.item);
    const itemId = asString(item?.id);
    const itemType = asString(item?.type);
    if (!threadId || !itemId) return;

    await ensureMirrorThread(threadId);
    if (turnId) {
      await ensureMirrorTurn(threadId, turnId);
    }

    if (itemType === "userMessage") {
      const content = Array.isArray(item?.content) ? item.content : [];
      const text = content
        .map((part) => asRecord(part))
        .map((part) => asString(part?.text))
        .filter((value): value is string => Boolean(value))
        .join("\n\n");

      const sql = `
        INSERT INTO mc_codex_messages (
          id,
          thread_id,
          turn_id,
          role,
          message_type,
          content,
          completed_at,
          updated_at
        )
        VALUES (
          '${escapeLiteral(itemId)}',
          '${escapeLiteral(threadId)}',
          ${toSqlString(turnId)},
          'user',
          'user_message',
          ${toSqlString(text)},
          ${method === "item/completed" ? "CURRENT_TIMESTAMP" : "NULL"},
          CURRENT_TIMESTAMP
        )
        ON CONFLICT (id) DO UPDATE SET
          turn_id = COALESCE(EXCLUDED.turn_id, mc_codex_messages.turn_id),
          content = CASE
            WHEN EXCLUDED.content IS NOT NULL AND EXCLUDED.content <> '' THEN EXCLUDED.content
            ELSE mc_codex_messages.content
          END,
          completed_at = COALESCE(EXCLUDED.completed_at, mc_codex_messages.completed_at),
          updated_at = CURRENT_TIMESTAMP
      `;

      await safeQuery(() => prisma.$executeRawUnsafe(sql), 0);
      await safeQuery(
        () =>
          prisma.$executeRawUnsafe(`
            UPDATE mc_codex_threads
            SET last_message_preview = ${toSqlString(text ? truncatePreview(text) : null)},
                updated_at = CURRENT_TIMESTAMP
            WHERE id = '${escapeLiteral(threadId)}'
          `),
        0,
      );
      return;
    }

    if (itemType === "agentMessage") {
      const text = asString(item?.text) ?? "";
      const phase = asString(item?.phase);
      const sql = `
        INSERT INTO mc_codex_messages (
          id,
          thread_id,
          turn_id,
          role,
          message_type,
          phase,
          content,
          completed_at,
          updated_at
        )
        VALUES (
          '${escapeLiteral(itemId)}',
          '${escapeLiteral(threadId)}',
          ${toSqlString(turnId)},
          'assistant',
          'agent_message',
          ${toSqlString(phase)},
          ${toSqlString(text)},
          ${method === "item/completed" ? "CURRENT_TIMESTAMP" : "NULL"},
          CURRENT_TIMESTAMP
        )
        ON CONFLICT (id) DO UPDATE SET
          turn_id = COALESCE(EXCLUDED.turn_id, mc_codex_messages.turn_id),
          phase = COALESCE(EXCLUDED.phase, mc_codex_messages.phase),
          content = CASE
            WHEN EXCLUDED.content IS NOT NULL AND EXCLUDED.content <> '' THEN EXCLUDED.content
            ELSE mc_codex_messages.content
          END,
          completed_at = COALESCE(EXCLUDED.completed_at, mc_codex_messages.completed_at),
          updated_at = CURRENT_TIMESTAMP
      `;

      await safeQuery(() => prisma.$executeRawUnsafe(sql), 0);
      if (method === "item/completed" && text) {
        await safeQuery(
          () =>
            prisma.$executeRawUnsafe(`
              UPDATE mc_codex_threads
              SET last_message_preview = ${toSqlString(truncatePreview(text))},
                  updated_at = CURRENT_TIMESTAMP
              WHERE id = '${escapeLiteral(threadId)}'
            `),
          0,
        );
      }
    }
    return;
  }

  if (method === "item/agentMessage/delta") {
    const threadId = asString(params.threadId);
    const turnId = asString(params.turnId);
    const itemId = asString(params.itemId);
    const delta = asString(params.delta);
    if (!threadId || !itemId || delta == null) return;

    await ensureMirrorThread(threadId);
    if (turnId) {
      await ensureMirrorTurn(threadId, turnId);
    }

    const sql = `
      INSERT INTO mc_codex_messages (
        id,
        thread_id,
        turn_id,
        role,
        message_type,
        content,
        updated_at
      )
      VALUES (
        '${escapeLiteral(itemId)}',
        '${escapeLiteral(threadId)}',
        ${toSqlString(turnId)},
        'assistant',
        'agent_message',
        ${toSqlString(delta)},
        CURRENT_TIMESTAMP
      )
      ON CONFLICT (id) DO UPDATE SET
        turn_id = COALESCE(EXCLUDED.turn_id, mc_codex_messages.turn_id),
        content = mc_codex_messages.content || EXCLUDED.content,
        updated_at = CURRENT_TIMESTAMP
    `;

    await safeQuery(() => prisma.$executeRawUnsafe(sql), 0);
    return;
  }

  if (method === "thread/tokenUsage/updated") {
    const threadId = asString(params.threadId);
    const turnId = asString(params.turnId);
    const tokenUsage = asRecord(params.tokenUsage);
    const total = asRecord(tokenUsage?.total) ?? asRecord(tokenUsage?.last);
    if (!threadId || !turnId) return;

    await ensureMirrorTurn(threadId, turnId);
    const sql = `
      UPDATE mc_codex_turns
      SET
        total_tokens = COALESCE(${toSqlNumber(asNumber(total?.totalTokens))}, total_tokens),
        input_tokens = COALESCE(${toSqlNumber(asNumber(total?.inputTokens))}, input_tokens),
        cached_input_tokens = COALESCE(${toSqlNumber(asNumber(total?.cachedInputTokens))}, cached_input_tokens),
        output_tokens = COALESCE(${toSqlNumber(asNumber(total?.outputTokens))}, output_tokens),
        reasoning_output_tokens = COALESCE(${toSqlNumber(asNumber(total?.reasoningOutputTokens))}, reasoning_output_tokens),
        model_context_window = COALESCE(${toSqlNumber(asNumber(tokenUsage?.modelContextWindow))}, model_context_window),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = '${escapeLiteral(turnId)}'
    `;

    await safeQuery(() => prisma.$executeRawUnsafe(sql), 0);
    return;
  }

  if (method === "turn/completed") {
    const threadId = asString(params.threadId);
    const turn = asRecord(params.turn);
    const turnId = asString(turn?.id);
    const completedAt = asDateFromSeconds(turn?.completedAt) ?? new Date();
    const startedAt = asDateFromSeconds(turn?.startedAt);
    const durationMs = asNumber(turn?.durationMs);
    const status = asString(turn?.status) ?? "completed";
    const errorMessage = asString(asRecord(turn?.error)?.message);
    if (!threadId || !turnId) return;

    await ensureMirrorTurn(threadId, turnId);
    await safeQuery(
      () =>
        prisma.$executeRawUnsafe(`
          UPDATE mc_codex_turns
          SET
            status = '${escapeLiteral(status)}',
            error = ${toSqlString(errorMessage)},
            started_at = COALESCE(${toSqlTimestamp(startedAt)}, started_at),
            completed_at = ${toSqlTimestamp(completedAt)},
            duration_ms = COALESCE(${toSqlNumber(durationMs)}, duration_ms),
            updated_at = CURRENT_TIMESTAMP
          WHERE id = '${escapeLiteral(turnId)}'
        `),
      0,
    );

    await safeQuery(
      () =>
        prisma.$executeRawUnsafe(`
          UPDATE mc_codex_threads
          SET
            status = 'idle',
            last_turn_completed_at = ${toSqlTimestamp(completedAt)},
            updated_at = ${toSqlTimestamp(completedAt)}
          WHERE id = '${escapeLiteral(threadId)}'
        `),
      0,
    );
  }
}

export async function syncCodexMirrorThreadFromSession(
  session: CodexSessionSummary | CodexSessionDetail,
  options: {
    lifecycleState?: CodexMirrorLifecycleState | null;
    lastReconciledAt?: Date | string | null;
  } = {},
) {
  await upsertCodexMirrorThread({
    sessionId: session.sessionId,
    threadName: session.threadName,
    cwd: session.cwd,
    model: session.model,
    source: session.source,
    cliVersion: session.cliVersion,
    transcriptPath: session.transcriptPath,
    lastMessagePreview: session.lastMessagePreview,
    updatedAt: session.updatedAt ? new Date(session.updatedAt) : null,
    lifecycleState: options.lifecycleState,
    lastReconciledAt: options.lastReconciledAt,
  });
}
