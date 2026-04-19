import { NextResponse } from "next/server";

import path from "node:path";

import { getCodexThreadId, runCodexJson, streamCodexJson } from "@/lib/codex-cli";
import { listCodexSessions, waitForCodexSessionDetail } from "@/lib/codex-sessions";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

const DEFAULT_LIMIT = 20;
const DEFAULT_CWD = path.resolve(process.cwd(), "..", "..");
const encoder = new TextEncoder();

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
    const sessions = await listCodexSessions({ limit });
    return NextResponse.json({ sessions });
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
      const events = await streamCodexJson(["exec", "--json", prompt], {
        cwd: DEFAULT_CWD,
        signal: request.signal,
        onEvent: (event) => sendEvent(controller, "codex_event", event),
      });
      const sessionId = getCodexThreadId(events);

      if (!sessionId) {
        throw new Error("Codex did not return a session id");
      }

      const session = await waitForCodexSessionDetail(sessionId);
      sendEvent(controller, "done", { sessionId, session });
    });
  }

  try {
    const events = await runCodexJson(["exec", "--json", prompt], { cwd: DEFAULT_CWD });
    const sessionId = getCodexThreadId(events);

    if (!sessionId) {
      return NextResponse.json({ error: "Codex did not return a session id" }, { status: 502 });
    }

    const session = await waitForCodexSessionDetail(sessionId);
    return NextResponse.json({ session });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create Codex session";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
