import { NextResponse } from "next/server";

import path from "node:path";

import { backfillCodexThreadName, createCodexThread } from "@/lib/codex-app-server";
import { recordCodexMirrorNotification, upsertCodexMirrorThread } from "@/lib/codex-mirror";
import { listVisibleCodexSessions, waitForVisibleCodexSessionDetail } from "@/lib/codex-session-access";
import { listUnindexedCodexSessions } from "@/lib/codex-sessions";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

const DEFAULT_LIMIT = 20;
const DEFAULT_CWD = path.resolve(process.cwd(), "..", "..");
const encoder = new TextEncoder();

function buildThreadName(prompt: string) {
  const normalized = prompt.replace(/\s+/g, " ").trim();
  if (!normalized) return "Untitled Codex session";
  return normalized.length > 72 ? `${normalized.slice(0, 71)}…` : normalized;
}

function parseLimit(value: string | null): number {
  if (!value) return DEFAULT_LIMIT;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_LIMIT;
  return Math.floor(parsed);
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const limit = parseLimit(searchParams.get("limit"));

  try {
    const unindexedSessions = await listUnindexedCodexSessions({ limit });
    await Promise.allSettled(
      unindexedSessions.map((session) => backfillCodexThreadName(session.sessionId, session.threadName)),
    );

    const result = await listVisibleCodexSessions(limit);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load Codex sessions";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

type RequestBody = {
  prompt?: string;
};

function wantsEventStream(request: Request) {
  return request.headers.get("accept")?.includes("text/event-stream") ?? false;
}

function sendEvent(
  controller: ReadableStreamDefaultController<Uint8Array>,
  event: string,
  data: unknown,
) {
  controller.enqueue(encoder.encode(`event: ${event}\n`));
  controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
}

function buildEventStreamResponse(
  request: Request,
  run: (controller: ReadableStreamDefaultController<Uint8Array>) => Promise<void>,
) {
  let closed = false;
  let abortHandler: (() => void) | null = null;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const close = () => {
        if (closed) return;
        closed = true;
        controller.close();
      };

      abortHandler = close;
      request.signal.addEventListener("abort", close, { once: true });

      try {
        sendEvent(controller, "ready", { kind: "create", ts: Date.now() });
        await run(controller);
      } catch (error) {
        if (request.signal.aborted) {
          return;
        }
        sendEvent(controller, "error", {
          error: error instanceof Error ? error.message : "Failed to create Codex session",
        });
      } finally {
        if (abortHandler) {
          request.signal.removeEventListener("abort", abortHandler);
        }
        close();
      }
    },
    cancel() {
      closed = true;
      if (abortHandler) {
        request.signal.removeEventListener("abort", abortHandler);
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

export async function POST(request: Request) {
  const body = (await request.json()) as RequestBody;
  const prompt = body.prompt?.trim();

  if (!prompt) {
    return NextResponse.json({ error: "Prompt is required" }, { status: 400 });
  }

  if (wantsEventStream(request)) {
    return buildEventStreamResponse(request, async (controller) => {
      const provisionalName = buildThreadName(prompt);
      const { threadId: sessionId } = await createCodexThread(prompt, DEFAULT_CWD, {
        signal: request.signal,
        onEvent: (event) => sendEvent(controller, "codex_event", event),
        onNotification: (notification) => {
          void recordCodexMirrorNotification(notification);
        },
      });

      await upsertCodexMirrorThread({
        sessionId,
        threadName: provisionalName,
        cwd: DEFAULT_CWD,
        source: "vscode",
        status: "active",
        lastMessagePreview: prompt,
        updatedAt: new Date(),
      });

      const session = await waitForVisibleCodexSessionDetail(sessionId);
      await upsertCodexMirrorThread({
        sessionId,
        threadName: session.threadName,
        cwd: session.cwd,
        model: session.model,
        source: session.source,
        cliVersion: session.cliVersion,
        transcriptPath: session.transcriptPath,
        lastMessagePreview: session.lastMessagePreview,
        updatedAt: session.updatedAt ? new Date(session.updatedAt) : null,
      });
      sendEvent(controller, "done", { sessionId, session });
    });
  }

  try {
    const provisionalName = buildThreadName(prompt);
    const { threadId: sessionId } = await createCodexThread(prompt, DEFAULT_CWD, {
      onNotification: (notification) => {
        void recordCodexMirrorNotification(notification);
      },
    });
    await upsertCodexMirrorThread({
      sessionId,
      threadName: provisionalName,
      cwd: DEFAULT_CWD,
      source: "vscode",
      status: "active",
      lastMessagePreview: prompt,
      updatedAt: new Date(),
    });
    const session = await waitForVisibleCodexSessionDetail(sessionId);
    await upsertCodexMirrorThread({
      sessionId,
      threadName: session.threadName,
      cwd: session.cwd,
      model: session.model,
      source: session.source,
      cliVersion: session.cliVersion,
      transcriptPath: session.transcriptPath,
      lastMessagePreview: session.lastMessagePreview,
      updatedAt: session.updatedAt ? new Date(session.updatedAt) : null,
    });
    return NextResponse.json({ session });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create Codex session";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
