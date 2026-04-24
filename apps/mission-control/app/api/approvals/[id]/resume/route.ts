import { NextResponse } from "next/server";
import { getApprovalById, recordExecution, resumeApproval } from "@/lib/approvals";
import { isUuid } from "@/lib/route-ids";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!isUuid(id)) {
    return NextResponse.json({ error: "Invalid approval id" }, { status: 400 });
  }

  const approval = await getApprovalById(id);

  if (!approval) {
    return NextResponse.json({ error: "Approval not found" }, { status: 404 });
  }

  if (!["approved", "approved_edited"].includes(approval.status)) {
    return NextResponse.json(
      { error: "Approval must be approved before resume", status: approval.status },
      { status: 400 },
    );
  }

  const body = (await request.json().catch(() => ({}))) as {
    execution_result?: Record<string, unknown>;
    actor?: string;
    payload?: Record<string, unknown>;
  };

  if (body.execution_result && approval.executedAt) {
    return NextResponse.json(
      { error: "Execution already recorded", status: approval.status },
      { status: 409 },
    );
  }

  if (!body.execution_result && approval.resumedAt) {
    return NextResponse.json(
      { error: "Resume already requested", status: approval.status },
      { status: 409 },
    );
  }

  if (body.execution_result) {
    await recordExecution(id, body.execution_result, body.actor ?? approval.agentId);
  } else {
    await resumeApproval(id, body.actor ?? approval.agentId, {
      proposal: approval.proposal,
      resume_payload: approval.resumePayload,
      ...body.payload,
    });
  }

  const updated = await getApprovalById(id);

  return NextResponse.json({ approval: updated }, {
    headers: {
      "cache-control": "no-store, no-cache, must-revalidate, proxy-revalidate",
    },
  });
}
