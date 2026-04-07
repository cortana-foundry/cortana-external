import { NextResponse } from "next/server";
import { reconcileFeedbackSignal, type FeedbackSignalState } from "@/lib/feedback";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(request: Request) {
  const body = (await request.json()) as {
    run_id?: string | null;
    task_id?: string | null;
    agent_id?: string | null;
    source?: "user" | "system" | "evaluator";
    category?: string;
    severity?: "low" | "medium" | "high" | "critical";
    summary?: string;
    details?: Record<string, unknown>;
    recurrence_key?: string;
    owner?: string | null;
    actor?: string | null;
    signal_state?: FeedbackSignalState;
  };

  if (!body.source || !body.category || !body.severity || !body.summary || !body.recurrence_key) {
    return NextResponse.json(
      { error: "Missing required fields: source, category, severity, summary, recurrence_key" },
      { status: 400 },
    );
  }

  const result = await reconcileFeedbackSignal({
    runId: body.run_id ?? null,
    taskId: body.task_id ?? null,
    agentId: body.agent_id ?? null,
    source: body.source,
    category: body.category,
    severity: body.severity,
    summary: body.summary,
    details: body.details,
    recurrenceKey: body.recurrence_key,
    owner: body.owner ?? null,
    actor: body.actor ?? null,
    signalState: body.signal_state ?? "active",
  });

  return NextResponse.json(result, {
    status: result.state === "created" ? 201 : 200,
    headers: {
      "cache-control": "no-store, no-cache, must-revalidate, proxy-revalidate",
    },
  });
}
