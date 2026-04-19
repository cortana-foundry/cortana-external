import path from "node:path";
import { NextResponse } from "next/server";

import { runCodexJson, streamCodexJson } from "@/lib/codex-cli";
import { getCodexSessionDetail, waitForCodexSessionDetail } from "@/lib/codex-sessions";

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
      const existing = await getCodexSessionDetail(sessionId);

      await streamCodexJson(["exec", "resume", "--json", sessionId, prompt], {
        cwd: existing.cwd ?? DEFAULT_CWD,
        signal: request.signal,
        onEvent: (event) => sendEvent(controller, "codex_event", event),
      });

      const session = await waitForCodexSessionDetail(sessionId);
      sendEvent(controller, "done", { sessionId, session });
    });
  }

  try {
    const existing = await getCodexSessionDetail(sessionId);
    await runCodexJson(["exec", "resume", "--json", sessionId, prompt], {
      cwd: existing.cwd ?? DEFAULT_CWD,
    });

    const session = await waitForCodexSessionDetail(sessionId);
    return NextResponse.json({ session });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to resume Codex session";
    const status = message.includes("not found") ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
