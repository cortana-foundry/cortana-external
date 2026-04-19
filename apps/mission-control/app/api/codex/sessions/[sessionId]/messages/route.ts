import path from "node:path";
import { NextResponse } from "next/server";

import { runCodexJson } from "@/lib/codex-cli";
import { getCodexSessionDetail, waitForCodexSessionDetail } from "@/lib/codex-sessions";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

type RequestBody = {
  prompt?: string;
};

const DEFAULT_CWD = path.resolve(process.cwd(), "..", "..");

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

