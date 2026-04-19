import { NextResponse } from "next/server";

import { getVisibleCodexSessionDetail } from "@/lib/codex-session-access";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ sessionId: string }> },
) {
  const { sessionId } = await context.params;

  try {
    const session = await getVisibleCodexSessionDetail(sessionId);
    if (!session) {
      throw new Error(`Codex session ${sessionId} not found`);
    }
    return NextResponse.json({ session });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load Codex session";
    const status = message.includes("not found") ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
