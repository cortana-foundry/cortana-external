import { NextResponse } from "next/server";

import { getCodexRun } from "@/lib/codex-runs";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

const encoder = new TextEncoder();

function sendEvent(
  controller: ReadableStreamDefaultController<Uint8Array>,
  event: string,
  data: unknown,
) {
  controller.enqueue(encoder.encode(`event: ${event}\n`));
  controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
}

export async function GET(
  request: Request,
  context: { params: Promise<{ streamId: string }> },
) {
  const { streamId } = await context.params;
  const run = getCodexRun(streamId);

  if (!run) {
    return NextResponse.json({ error: `Codex stream ${streamId} not found` }, { status: 404 });
  }

  let closed = false;
  let intervalId: ReturnType<typeof setInterval> | null = null;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let cursor = 0;

      const close = () => {
        if (closed) return;
        closed = true;
        if (intervalId) {
          clearInterval(intervalId);
        }
        controller.close();
      };

      const flush = () => {
        const current = getCodexRun(streamId);
        if (!current) {
          sendEvent(controller, "error", { error: `Codex stream ${streamId} not found` });
          close();
          return;
        }

        while (cursor < current.events.length) {
          const envelope = current.events[cursor];
          cursor += 1;
          sendEvent(controller, envelope.event, envelope.data);
        }

        if (current.status === "completed" || current.status === "errored") {
          close();
        }
      };

      request.signal.addEventListener("abort", close, { once: true });
      flush();
      intervalId = setInterval(flush, 100);
    },
    cancel() {
      if (intervalId) {
        clearInterval(intervalId);
      }
      closed = true;
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
