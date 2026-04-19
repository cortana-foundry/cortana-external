import { NextResponse } from "next/server";

import path from "node:path";

import { getCodexThreadId, runCodexJson } from "@/lib/codex-cli";
import { listCodexSessions, waitForCodexSessionDetail } from "@/lib/codex-sessions";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

const DEFAULT_LIMIT = 20;
const DEFAULT_CWD = path.resolve(process.cwd(), "..", "..");

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

export async function POST(request: Request) {
  const body = (await request.json()) as RequestBody;
  const prompt = body.prompt?.trim();

  if (!prompt) {
    return NextResponse.json({ error: "Prompt is required" }, { status: 400 });
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

