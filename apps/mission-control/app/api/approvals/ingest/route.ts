import { NextResponse } from "next/server";
import { reconcileApprovalSignal, type ApprovalSignalState } from "@/lib/approvals";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(request: Request) {
  const body = (await request.json()) as {
    signal_state?: ApprovalSignalState;
    agent_id?: string;
    action_type?: string;
    correlation_key?: string;
    proposal?: Record<string, unknown>;
    rationale?: string | null;
    risk_level?: "p0" | "p1" | "p2" | "p3";
    blast_radius?: string | null;
    resume_payload?: Record<string, unknown> | null;
    run_id?: string | null;
    task_id?: string | null;
    actor?: string | null;
    clear_reason?: string | null;
  };

  if (!body.signal_state || !body.agent_id || !body.action_type || !body.correlation_key || !body.proposal) {
    return NextResponse.json(
      { error: "Missing required fields: signal_state, agent_id, action_type, correlation_key, proposal" },
      { status: 400 },
    );
  }

  if (!["pending", "cleared"].includes(body.signal_state)) {
    return NextResponse.json({ error: "Invalid signal_state" }, { status: 400 });
  }

  if (body.signal_state === "pending" && !body.risk_level) {
    return NextResponse.json({ error: "risk_level is required for pending approval signals" }, { status: 400 });
  }

  const result = await reconcileApprovalSignal({
    signalState: body.signal_state,
    agentId: body.agent_id,
    actionType: body.action_type,
    correlationKey: body.correlation_key,
    proposal: body.proposal,
    rationale: body.rationale ?? null,
    riskLevel: body.risk_level ?? "p2",
    blastRadius: body.blast_radius ?? null,
    resumePayload: body.resume_payload ?? null,
    runId: body.run_id ?? null,
    taskId: body.task_id ?? null,
    actor: body.actor ?? null,
    clearReason: body.clear_reason ?? null,
  });

  return NextResponse.json(result, {
    status: result.state === "created" ? 201 : 200,
    headers: {
      "cache-control": "no-store, no-cache, must-revalidate, proxy-revalidate",
    },
  });
}
