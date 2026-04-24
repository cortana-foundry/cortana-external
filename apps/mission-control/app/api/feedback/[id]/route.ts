import { NextResponse } from "next/server";
import {
  FEEDBACK_WORKFLOW_STATUSES,
  getFeedbackById,
  REMEDIATION_STATUSES,
  updateFeedbackRemediation,
  updateFeedbackStatus,
  type FeedbackWorkflowStatus,
  type RemediationStatus,
} from "@/lib/feedback";
import { isUuid } from "@/lib/route-ids";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  if (!isUuid(id)) {
    return NextResponse.json({ error: "Invalid feedback id" }, { status: 400 });
  }

  const item = await getFeedbackById(id);

  if (!item) {
    return NextResponse.json({ error: "Feedback item not found" }, { status: 404 });
  }

  return NextResponse.json(item, {
    headers: {
      "cache-control": "no-store, no-cache, must-revalidate, proxy-revalidate",
    },
  });
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  if (!isUuid(id)) {
    return NextResponse.json({ error: "Invalid feedback id" }, { status: 400 });
  }

  const body = (await request.json()) as {
    remediationStatus?: string;
    remediationNotes?: string | null;
    resolvedBy?: string | null;
    status?: string;
    owner?: string | null;
  };

  if (!body.remediationStatus && !body.status) {
    return NextResponse.json({ error: "status or remediationStatus is required" }, { status: 400 });
  }

  if (body.remediationStatus && !REMEDIATION_STATUSES.includes(body.remediationStatus as RemediationStatus)) {
    return NextResponse.json({ error: "Invalid remediationStatus" }, { status: 400 });
  }

  if (body.status && !FEEDBACK_WORKFLOW_STATUSES.includes(body.status as FeedbackWorkflowStatus)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  let updated = true;

  if (body.status) {
    updated = await updateFeedbackStatus(id, body.status as FeedbackWorkflowStatus, body.owner ?? undefined);
  }

  if (body.remediationStatus) {
    updated = (
      await updateFeedbackRemediation(
        id,
        body.remediationStatus as RemediationStatus,
        body.remediationNotes,
        body.resolvedBy,
      )
    ) && updated;
  }

  if (!updated) {
    return NextResponse.json({ error: "Feedback item not found" }, { status: 404 });
  }

  const item = await getFeedbackById(id);

  return NextResponse.json({ ok: true, item }, {
    headers: {
      "cache-control": "no-store, no-cache, must-revalidate, proxy-revalidate",
    },
  });
}
