import { NextResponse } from "next/server";

import { CodexRunError, startReplyCodexRun } from "@/lib/codex-runs";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

type RequestBody = {
  prompt?: string;
  model?: string | null;
  imageIds?: string[] | null;
};

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

  try {
    const { streamId } = await startReplyCodexRun({
      sessionId,
      prompt,
      model: body.model,
      imageIds: body.imageIds,
    });

    return NextResponse.json({ streamId }, { status: 202 });
  } catch (error) {
    if (error instanceof CodexRunError) {
      const status =
        error.code === "invalid_request"
          ? 400
          : error.code === "conflict"
            ? 409
            : error.code === "not_found"
              ? 404
              : error.code === "prerequisite_failed"
                ? 412
                : 500;
      return NextResponse.json({ error: error.message }, { status });
    }

    const message = error instanceof Error ? error.message : "Failed to resume Codex session";
    const status = message.includes("not found") ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
