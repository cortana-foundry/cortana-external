import { NextResponse } from "next/server";

import { apiJson } from "@/lib/api-route";
import { CodexRunError } from "@/lib/codex-runs";
import {
  codexRunErrorStatus,
  replyToCodexSession,
  type CodexSessionReplyRequest,
} from "@/lib/codex-session-workspace";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

export async function POST(
  request: Request,
  context: { params: Promise<{ sessionId: string }> },
) {
  const { sessionId } = await context.params;
  const body = (await request.json()) as CodexSessionReplyRequest;

  try {
    return apiJson(await replyToCodexSession(sessionId, body), { status: 202 });
  } catch (error) {
    if (error instanceof CodexRunError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: codexRunErrorStatus(error) },
      );
    }

    const message = error instanceof Error ? error.message : "Failed to resume Codex session";
    const status = message.includes("not found") ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
