import { NextResponse } from "next/server";

import { getVisibleCodexSessionDetail } from "@/lib/codex-session-access";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

const DEFAULT_EVENT_PAGE_SIZE = 60;
const MAX_EVENT_PAGE_SIZE = 200;

function parsePositiveInt(value: string | null) {
  if (!value) return null;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
}

export async function GET(
  request: Request,
  context: { params: Promise<{ sessionId: string }> },
) {
  const { sessionId } = await context.params;
  const { searchParams } = new URL(request.url);
  const before = parsePositiveInt(searchParams.get("before"));
  const requestedLimit = parsePositiveInt(searchParams.get("limit"));
  const limit = Math.min(requestedLimit ?? DEFAULT_EVENT_PAGE_SIZE, MAX_EVENT_PAGE_SIZE);

  try {
    const session = await getVisibleCodexSessionDetail(sessionId);
    if (!session) {
      throw new Error(`Codex session ${sessionId} not found`);
    }

    const totalEvents = session.events.length;
    const end = before == null ? totalEvents : Math.min(before, totalEvents);
    const start = Math.max(0, end - limit);
    const events = session.events.slice(start, end);

    return NextResponse.json({
      session: {
        ...session,
        events,
      },
      pagination: {
        totalEvents,
        loadedEvents: events.length,
        hasMore: start > 0,
        nextBefore: start > 0 ? start : null,
        rangeStart: start,
        rangeEnd: end,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load Codex session";
    const status = message.includes("not found") ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
