import { NextResponse } from "next/server";

import { apiJson } from "@/lib/api-route";
import { CodexRunError } from "@/lib/codex-runs";
import {
  codexRunErrorStatus,
  createCodexSessionRun,
  listCodexSessionWorkspace,
  type CodexSessionRunRequest,
} from "@/lib/codex-session-workspace";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  try {
    return NextResponse.json(await listCodexSessionWorkspace(searchParams));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load Codex sessions";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const body = (await request.json()) as CodexSessionRunRequest;

  try {
    return apiJson(await createCodexSessionRun(body), { status: 202 });
  } catch (error) {
    if (error instanceof CodexRunError) {
      return NextResponse.json({ error: error.message }, { status: codexRunErrorStatus(error) });
    }

    const message = error instanceof Error ? error.message : "Failed to create Codex session";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
