import { NextResponse } from "next/server";

import { CodexRunError, getActiveCodexSessionIds, startCreateCodexRun } from "@/lib/codex-runs";
import { listVisibleCodexSessions } from "@/lib/codex-session-access";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

const DEFAULT_LIMIT = 20;

type RequestBody = {
  prompt?: string;
  workspaceKey?: string | null;
  model?: string | null;
  imageIds?: string[] | null;
};

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
    const result = await listVisibleCodexSessions(limit);
    const activeSessionIds = getActiveCodexSessionIds();

    return NextResponse.json({
      ...result,
      sessions: result.sessions.map((session) => ({
        ...session,
        activeRun: activeSessionIds.has(session.sessionId),
      })),
      groups: result.groups.map((group) => ({
        ...group,
        sessions: group.sessions.map((session) => ({
          ...session,
          activeRun: activeSessionIds.has(session.sessionId),
        })),
      })),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load Codex sessions";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const body = (await request.json()) as RequestBody;
  const prompt = body.prompt?.trim();

  if (!prompt) {
    return NextResponse.json({ error: "Prompt is required" }, { status: 400 });
  }

  try {
    const { streamId } = await startCreateCodexRun({
      prompt,
      workspaceKey: body.workspaceKey,
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
            : error.code === "prerequisite_failed"
              ? 412
              : 500;
      return NextResponse.json({ error: error.message }, { status });
    }

    const message = error instanceof Error ? error.message : "Failed to create Codex session";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
