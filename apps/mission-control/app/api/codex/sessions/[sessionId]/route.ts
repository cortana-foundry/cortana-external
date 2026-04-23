import { NextResponse } from "next/server";

import {
  archiveCodexWorkspaceSession,
  deleteCodexWorkspaceSession,
  getCodexSessionPage,
} from "@/lib/codex-session-workspace";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

export async function GET(
  request: Request,
  context: { params: Promise<{ sessionId: string }> },
) {
  const { sessionId } = await context.params;
  const { searchParams } = new URL(request.url);

  try {
    return NextResponse.json(await getCodexSessionPage(sessionId, searchParams));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load Codex session";
    const status = message.includes("not found") ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

type MutateSessionBody = {
  action?: string;
};

export async function PATCH(
  request: Request,
  context: { params: Promise<{ sessionId: string }> },
) {
  const { sessionId } = await context.params;

  try {
    const body = (await request.json()) as MutateSessionBody;
    if (body.action !== "archive") {
      return NextResponse.json({ error: "Unsupported session action" }, { status: 400 });
    }

    return NextResponse.json(await archiveCodexWorkspaceSession(sessionId));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to archive Codex session";
    const status = message.includes("not found") ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ sessionId: string }> },
) {
  const { sessionId } = await context.params;

  try {
    return NextResponse.json(await deleteCodexWorkspaceSession(sessionId));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to delete Codex session";
    const status = message.includes("not found") ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
