import path from "node:path";
import { NextResponse } from "next/server";

import { replyToCodexThread } from "@/lib/codex-app-server";
import { recordCodexMirrorNotification, upsertCodexMirrorThread } from "@/lib/codex-mirror";
import { getVisibleCodexSessionDetail, waitForVisibleCodexSessionDetail } from "@/lib/codex-session-access";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

type RequestBody = {
  prompt?: string;
};

const DEFAULT_CWD = path.resolve(process.cwd(), "..", "..");
const encoder = new TextEncoder();

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
  sessionId: string,
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
        sendEvent(controller, "ready", { kind: "reply", sessionId, ts: Date.now() });
        await run(controller);
      } catch (error) {
        if (request.signal.aborted) {
          return;
        }
        sendEvent(controller, "error", {
          error: error instanceof Error ? error.message : "Failed to resume Codex session",
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

export async function POST(
  request: Request,
  context: { params: Promise<{ sessionId: string }> },
) {
  const { sessionId } = await context.params;
  const body = (await request.json()) as RequestBody;
  const prompt = body.prompt?.trim();

  if (!prompt) {
    return NextResponse.json({ error: "Prompt is required" }, { status: 400 });
  }

  if (wantsEventStream(request)) {
    return buildEventStreamResponse(request, sessionId, async (controller) => {
      const existing = await getVisibleCodexSessionDetail(sessionId);
      if (!existing) {
        throw new Error(`Codex session ${sessionId} not found`);
      }
      const priorAssistantCount = existing.events.filter((event) => event.role === "assistant").length;

      await upsertCodexMirrorThread({
        sessionId,
        threadName: existing.threadName,
        cwd: existing.cwd,
        model: existing.model,
        source: existing.source,
        cliVersion: existing.cliVersion,
        transcriptPath: existing.transcriptPath,
        lastMessagePreview: existing.lastMessagePreview,
        updatedAt: existing.updatedAt ? new Date(existing.updatedAt) : null,
      });

      await replyToCodexThread(sessionId, prompt, existing.cwd ?? DEFAULT_CWD, {
        signal: request.signal,
        onEvent: (event) => sendEvent(controller, "codex_event", event),
        onNotification: (notification) => {
          void recordCodexMirrorNotification(notification);
        },
      });

      const session = await waitForVisibleCodexSessionDetail(sessionId, {
        attempts: 20,
        delayMs: 250,
        predicate: (candidate) =>
          candidate.events.filter((event) => event.role === "assistant").length > priorAssistantCount,
      });
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
    const existing = await getVisibleCodexSessionDetail(sessionId);
    if (!existing) {
      throw new Error(`Codex session ${sessionId} not found`);
    }
    const priorAssistantCount = existing.events.filter((event) => event.role === "assistant").length;

    await upsertCodexMirrorThread({
      sessionId,
      threadName: existing.threadName,
      cwd: existing.cwd,
      model: existing.model,
      source: existing.source,
      cliVersion: existing.cliVersion,
      transcriptPath: existing.transcriptPath,
      lastMessagePreview: existing.lastMessagePreview,
      updatedAt: existing.updatedAt ? new Date(existing.updatedAt) : null,
    });

    await replyToCodexThread(sessionId, prompt, existing.cwd ?? DEFAULT_CWD, {
      onNotification: (notification) => {
        void recordCodexMirrorNotification(notification);
      },
    });

    const session = await waitForVisibleCodexSessionDetail(sessionId, {
      attempts: 20,
      delayMs: 250,
      predicate: (candidate) =>
        candidate.events.filter((event) => event.role === "assistant").length > priorAssistantCount,
    });
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
    const message = error instanceof Error ? error.message : "Failed to resume Codex session";
    const status = message.includes("not found") ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
