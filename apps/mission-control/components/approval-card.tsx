"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { ApprovalRequest } from "@/lib/approvals";

const toRelativeTime = (iso: string | null) => {
  if (!iso) return "never";
  const ts = new Date(iso).getTime();
  if (Number.isNaN(ts)) return "—";

  const diff = Date.now() - ts;
  if (diff < 60_000) return "just now";

  const minutes = Math.floor(diff / 60_000);
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  return `${days}d ago`;
};

const riskBadgeClass = (risk: string) => {
  if (risk === "p0") return "destructive" as const;
  if (risk === "p1") return "warning" as const;
  if (risk === "p2") return "info" as const;
  return "secondary" as const;
};

const statusLabel = (approval: ApprovalRequest) => {
  if (approval.executedAt) {
    return `Executed ${toRelativeTime(approval.executedAt)}`;
  }
  if (approval.resumedAt) {
    return `Resume requested ${toRelativeTime(approval.resumedAt)}`;
  }
  if (approval.status === "rejected") {
    return `Rejected by ${approval.rejectedBy || "unknown"} · ${toRelativeTime(approval.rejectedAt)}`;
  }
  if (approval.status === "expired") {
    return `Expired ${toRelativeTime(approval.expiresAt)}`;
  }
  if (["approved", "approved_edited"].includes(approval.status)) {
    return `Approved by ${approval.approvedBy || "unknown"} · ${toRelativeTime(approval.approvedAt)}`;
  }
  return `Created ${toRelativeTime(approval.createdAt)}`;
};

export function ApprovalCard({
  approval,
  highlighted = false,
  initiallyExpanded = false,
}: {
  approval: ApprovalRequest;
  highlighted?: boolean;
  initiallyExpanded?: boolean;
}) {
  const router = useRouter();
  const cardRef = useRef<HTMLDivElement | null>(null);
  const [expanded, setExpanded] = useState(initiallyExpanded);
  const [loadingAction, setLoadingAction] = useState<"approve" | "reject" | "approve_edited" | "resume" | "execute" | null>(null);
  const [decisionNote, setDecisionNote] = useState("");
  const [resumeNote, setResumeNote] = useState("");
  const [executionNote, setExecutionNote] = useState("");
  const [currentApproval, setCurrentApproval] = useState(approval);
  const [events, setEvents] = useState(approval.events || []);

  useEffect(() => {
    setCurrentApproval(approval);
    setEvents(approval.events || []);
  }, [approval]);

  useEffect(() => {
    if (!highlighted) return;
    setExpanded(true);
    cardRef.current?.scrollIntoView?.({ block: "center", behavior: "smooth" });
  }, [highlighted]);

  useEffect(() => {
    if (!expanded) return;
    let alive = true;

    const load = async () => {
      const response = await fetch(`/api/approvals/${approval.id}`, { cache: "no-store" });
      if (!response.ok) return;
      const payload = (await response.json()) as ApprovalRequest;
      if (!alive) return;
      setCurrentApproval(payload);
      setEvents(payload.events || []);
    };

    load();
    return () => {
      alive = false;
    };
  }, [approval.id, expanded]);

  const truncatedRationale = useMemo(() => {
    if (!currentApproval.rationale) return "No rationale provided.";
    if (currentApproval.rationale.length <= 220) return currentApproval.rationale;
    return `${currentApproval.rationale.slice(0, 220)}…`;
  }, [currentApproval.rationale]);

  const feedbackId = useMemo(() => {
    if (currentApproval.feedbackId && currentApproval.feedbackId.trim()) return currentApproval.feedbackId.trim();
    if (currentApproval.proposal && typeof currentApproval.proposal === "object" && !Array.isArray(currentApproval.proposal)) {
      const proposal = currentApproval.proposal as Record<string, unknown>;
      const candidate = proposal.feedback_id ?? proposal.feedbackId;
      if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
    }
    return null;
  }, [currentApproval.feedbackId, currentApproval.proposal]);

  const feedbackSummary = currentApproval.feedbackSummary?.trim();
  const truncatedFeedbackSummary = feedbackSummary && feedbackSummary.length > 140
    ? `${feedbackSummary.slice(0, 140)}…`
    : feedbackSummary;
  const feedbackLabel = feedbackId
    ? truncatedFeedbackSummary || `feedback ${feedbackId.slice(0, 8)}`
    : null;

  const takeAction = async (action: "approve" | "reject" | "approve_edited") => {
    try {
      setLoadingAction(action);
      const response = await fetch(`/api/approvals/${approval.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action,
          actor: "mission-control-ui",
          decision: decisionNote ? { note: decisionNote } : undefined,
        }),
      });
      if (!response.ok) return;
      const payload = (await response.json()) as { approval?: ApprovalRequest };
      if (payload.approval) {
        setCurrentApproval(payload.approval);
        setEvents(payload.approval.events || []);
      }
      setDecisionNote("");
      router.refresh();
    } finally {
      setLoadingAction(null);
    }
  };

  const requestResume = async () => {
    try {
      setLoadingAction("resume");
      const response = await fetch(`/api/approvals/${approval.id}/resume`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          actor: "mission-control-ui",
          payload: resumeNote.trim() ? { note: resumeNote.trim(), source: "mission-control-ui" } : undefined,
        }),
      });
      if (!response.ok) return;
      const payload = (await response.json()) as { approval?: ApprovalRequest };
      if (payload.approval) {
        setCurrentApproval(payload.approval);
        setEvents(payload.approval.events || []);
      }
      setResumeNote("");
      router.refresh();
    } finally {
      setLoadingAction(null);
    }
  };

  const markExecuted = async () => {
    try {
      setLoadingAction("execute");
      const response = await fetch(`/api/approvals/${approval.id}/resume`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          actor: "mission-control-ui",
          execution_result: {
            status: "completed",
            note: executionNote.trim() || "Marked executed from Mission Control",
            source: "mission-control-ui",
          },
        }),
      });
      if (!response.ok) return;
      const payload = (await response.json()) as { approval?: ApprovalRequest };
      if (payload.approval) {
        setCurrentApproval(payload.approval);
        setEvents(payload.approval.events || []);
      }
      setExecutionNote("");
      router.refresh();
    } finally {
      setLoadingAction(null);
    }
  };

  return (
    <Card
      ref={cardRef}
      className={`overflow-hidden ${highlighted ? "border-primary/40 ring-1 ring-primary/20" : ""}`}
    >
      <CardHeader className="cursor-pointer pb-2" onClick={() => setExpanded((prev) => !prev)}>
        <CardTitle className="flex flex-wrap items-center gap-2 text-base">
          <Badge variant={riskBadgeClass(currentApproval.riskLevel)}>{currentApproval.riskLevel.toUpperCase()}</Badge>
          <span className="font-semibold">{currentApproval.actionType}</span>
          <span className="text-xs font-normal text-muted-foreground">{currentApproval.agentId}</span>
          <Badge variant="outline">{currentApproval.status}</Badge>
          {highlighted ? <Badge variant="info">focused</Badge> : null}
        </CardTitle>
        <p className="text-sm text-muted-foreground">{truncatedRationale}</p>
        {feedbackId && feedbackLabel && (
          <Link
            href={`/feedback?id=${encodeURIComponent(feedbackId)}`}
            onClick={(event) => event.stopPropagation()}
            className="text-xs text-muted-foreground hover:text-foreground hover:underline"
          >
            From feedback: {feedbackLabel}
          </Link>
        )}
        <p className="text-xs text-muted-foreground">{statusLabel(currentApproval)}</p>
      </CardHeader>

      {expanded && (
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-4">
            <div className="rounded border bg-card/60 p-3 text-xs">
              <p className="font-medium uppercase tracking-wide text-muted-foreground">Approved</p>
              <p className="mt-1 text-sm">{currentApproval.approvedAt ? toRelativeTime(currentApproval.approvedAt) : "pending"}</p>
            </div>
            <div className="rounded border bg-card/60 p-3 text-xs">
              <p className="font-medium uppercase tracking-wide text-muted-foreground">Resumed</p>
              <p className="mt-1 text-sm">{currentApproval.resumedAt ? toRelativeTime(currentApproval.resumedAt) : "not yet"}</p>
            </div>
            <div className="rounded border bg-card/60 p-3 text-xs">
              <p className="font-medium uppercase tracking-wide text-muted-foreground">Executed</p>
              <p className="mt-1 text-sm">{currentApproval.executedAt ? toRelativeTime(currentApproval.executedAt) : "not yet"}</p>
            </div>
            <div className="rounded border bg-card/60 p-3 text-xs">
              <p className="font-medium uppercase tracking-wide text-muted-foreground">Expires</p>
              <p className="mt-1 text-sm">{currentApproval.expiresAt ? toRelativeTime(currentApproval.expiresAt) : "n/a"}</p>
            </div>
          </div>

          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Proposal</p>
            <pre className="mt-1 max-w-full overflow-x-auto whitespace-pre-wrap break-all rounded bg-muted p-2 text-xs">
              <code>{JSON.stringify(currentApproval.proposal, null, 2)}</code>
            </pre>
          </div>

          {currentApproval.diff && (
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Diff</p>
              <pre className="mt-1 max-w-full overflow-x-auto whitespace-pre-wrap break-all rounded bg-muted p-2 text-xs">
                <code>{JSON.stringify(currentApproval.diff, null, 2)}</code>
              </pre>
            </div>
          )}

          {currentApproval.status === "pending" ? (
            <div className="space-y-2">
              <Textarea
                value={decisionNote}
                onChange={(event) => setDecisionNote(event.target.value)}
                placeholder="Optional reason for audit trail"
              />
              <div className="flex flex-wrap gap-2">
                <Button disabled={!!loadingAction} onClick={() => takeAction("approve")}>Approve</Button>
                <Button disabled={!!loadingAction} variant="destructive" onClick={() => takeAction("reject")}>
                  Reject
                </Button>
                <Button disabled={!!loadingAction} variant="outline" onClick={() => takeAction("approve_edited")}>
                  Approve Edited
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">{statusLabel(currentApproval)}</p>

              {["approved", "approved_edited"].includes(currentApproval.status) && !currentApproval.resumedAt && (
                <div className="space-y-2 rounded border p-3">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Resume flow</p>
                  <Textarea
                    value={resumeNote}
                    onChange={(event) => setResumeNote(event.target.value)}
                    placeholder="Optional context for the resumed execution payload"
                  />
                  <Button disabled={!!loadingAction} variant="outline" onClick={requestResume}>
                    Request Resume
                  </Button>
                </div>
              )}

              {["approved", "approved_edited"].includes(currentApproval.status) && !currentApproval.executedAt && (
                <div className="space-y-2 rounded border p-3">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Execution result</p>
                  <Textarea
                    value={executionNote}
                    onChange={(event) => setExecutionNote(event.target.value)}
                    placeholder="Optional note for the execution record"
                  />
                  <Button disabled={!!loadingAction} onClick={markExecuted}>
                    Mark Executed
                  </Button>
                </div>
              )}
            </div>
          )}

          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Audit events</p>
            {events.length > 0 ? (
              <div className="mt-2 space-y-2">
                {events.map((event) => (
                  <div key={event.id} className="rounded border bg-card/60 p-2 text-xs">
                    <p className="font-medium">{event.eventType}</p>
                    <p className="text-muted-foreground">{event.actor || "system"} · {toRelativeTime(event.createdAt)}</p>
                    {Object.keys(event.payload).length > 0 && (
                      <pre className="mt-1 max-w-full overflow-x-auto whitespace-pre-wrap break-all rounded bg-muted p-2 text-xs">
                        <code>{JSON.stringify(event.payload, null, 2)}</code>
                      </pre>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No events yet.</p>
            )}
          </div>
        </CardContent>
      )}
    </Card>
  );
}
