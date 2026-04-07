"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { StatusBadge } from "@/components/status-badge";
import { FeedbackItem, FeedbackWorkflowStatus, RemediationStatus } from "@/lib/feedback";

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

const severityVariant = (severity: string) => {
  if (severity === "critical") return "destructive" as const;
  if (severity === "high") return "warning" as const;
  if (severity === "medium") return "info" as const;
  return "secondary" as const;
};

const remediationVariant = (status: RemediationStatus) => {
  if (status === "open") return "warning" as const;
  if (status === "in_progress") return "info" as const;
  if (status === "resolved") return "success" as const;
  return "secondary" as const;
};

const remediationLabel = (status: RemediationStatus) => status.replaceAll("_", " ");
const workflowLabel = (status: FeedbackWorkflowStatus) =>
  status.replaceAll("_", " ");
const workflowToRemediation: Record<FeedbackWorkflowStatus, RemediationStatus> = {
  new: "open",
  triaged: "open",
  in_progress: "in_progress",
  verified: "resolved",
  wont_fix: "wont_fix",
};

export function FeedbackCard({
  feedback,
  highlighted = false,
  initiallyExpanded = false,
}: {
  feedback: FeedbackItem;
  highlighted?: boolean;
  initiallyExpanded?: boolean;
}) {
  const router = useRouter();
  const cardRef = useRef<HTMLDivElement | null>(null);
  const [expanded, setExpanded] = useState(initiallyExpanded);
  const [actionType, setActionType] = useState("patch");
  const [actionRef, setActionRef] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<"planned" | "applied" | "verified" | "failed">("planned");
  const [submitting, setSubmitting] = useState(false);
  const [actions, setActions] = useState(feedback.actions || []);
  const [workflowStatus, setWorkflowStatus] = useState<FeedbackWorkflowStatus>(feedback.status);
  const [remediationStatus, setRemediationStatus] = useState<RemediationStatus>(feedback.remediationStatus);
  const [remediationNotes, setRemediationNotes] = useState(feedback.remediationNotes ?? "");

  useEffect(() => {
    if (!highlighted) return;
    setExpanded(true);
    cardRef.current?.scrollIntoView?.({ block: "center", behavior: "smooth" });
  }, [highlighted]);

  useEffect(() => {
    if (!expanded) return;
    let alive = true;

    const load = async () => {
      const response = await fetch(`/api/feedback/${feedback.id}`, { cache: "no-store" });
      if (!response.ok) return;
      const payload = (await response.json()) as FeedbackItem;
      if (!alive) return;
      setActions(payload.actions || []);
      setWorkflowStatus(payload.status);
      setRemediationStatus(payload.remediationStatus);
      setRemediationNotes(payload.remediationNotes ?? "");
    };

    load();
    return () => {
      alive = false;
    };
  }, [expanded, feedback.id]);

  const detailsText = useMemo(() => JSON.stringify(feedback.details || {}, null, 2), [feedback.details]);

  const addAction = async () => {
    try {
      setSubmitting(true);
      await fetch(`/api/feedback/${feedback.id}/actions`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ actionType, actionRef: actionRef || null, description: description || null, status }),
      });
      setDescription("");
      setActionRef("");
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  };

  const setWorkflowStage = async (nextStatus: FeedbackWorkflowStatus) => {
    const nextRemediation = workflowToRemediation[nextStatus];
    try {
      setSubmitting(true);
      const response = await fetch(`/api/feedback/${feedback.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          status: nextStatus,
          owner: "mission-control-ui",
          remediationStatus: nextRemediation,
          remediationNotes,
          resolvedBy: nextRemediation === "resolved" ? "mission-control-ui" : null,
        }),
      });
      if (!response.ok) return;
      setWorkflowStatus(nextStatus);
      setRemediationStatus(nextRemediation);
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  };

  const saveRemediationNotes = async () => {
    try {
      setSubmitting(true);
      const response = await fetch(`/api/feedback/${feedback.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          status: workflowStatus,
          owner: "mission-control-ui",
          remediationStatus,
          remediationNotes,
          resolvedBy: remediationStatus === "resolved" ? "mission-control-ui" : null,
        }),
      });
      if (!response.ok) return;
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card
      ref={cardRef}
      className={`overflow-hidden ${highlighted ? "border-primary/40 ring-1 ring-primary/20" : ""}`}
    >
      <CardHeader className="cursor-pointer pb-2" onClick={() => setExpanded((prev) => !prev)}>
        <CardTitle className="flex flex-wrap items-center gap-2 text-base">
          <Badge variant={severityVariant(feedback.severity)}>{feedback.severity.toUpperCase()}</Badge>
          <Badge variant="outline">{feedback.category}</Badge>
          <Badge variant="secondary">{feedback.source}</Badge>
          <Badge variant="outline">{workflowLabel(workflowStatus)}</Badge>
          <Badge variant={remediationVariant(remediationStatus)}>{remediationLabel(remediationStatus)}</Badge>
          {highlighted ? <Badge variant="info">focused</Badge> : null}
        </CardTitle>
        <p className="text-sm text-foreground">{feedback.summary}</p>
        {feedback.linkedTaskId && feedback.linkedTaskStatus && (
          <Link
            href={`/task-board?highlight=${encodeURIComponent(String(feedback.linkedTaskId))}`}
            onClick={(event) => event.stopPropagation()}
            className="inline-flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground"
          >
            <Badge variant="outline">Task {feedback.linkedTaskId}</Badge>
            <StatusBadge value={feedback.linkedTaskStatus} variant="task" />
          </Link>
        )}
        <p className="text-xs text-muted-foreground">
          {toRelativeTime(feedback.createdAt)} · resolved {toRelativeTime(feedback.resolvedAt)}
        </p>
      </CardHeader>

      {expanded && (
        <CardContent className="space-y-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Workflow stage</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {(["new", "triaged", "in_progress", "verified", "wont_fix"] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  disabled={submitting}
                  onClick={() => setWorkflowStage(option)}
                >
                  <Badge variant={workflowStatus === option ? "secondary" : "outline"}>
                    {workflowLabel(option)}
                  </Badge>
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Remediation Notes</p>
            <Textarea
              value={remediationNotes}
              onChange={(event) => setRemediationNotes(event.target.value)}
              placeholder="Document context, fix details, and follow-up steps"
              className="mt-2"
            />
            <div className="mt-2 flex justify-end">
              <Button disabled={submitting} variant="outline" onClick={saveRemediationNotes}>
                Save notes
              </Button>
            </div>
          </div>

          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Details</p>
            <pre className="mt-1 max-w-full overflow-x-auto whitespace-pre-wrap break-all rounded bg-muted p-2 text-xs">
              <code>{detailsText}</code>
            </pre>
          </div>

          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Actions</p>
            {actions.length > 0 ? (
              <div className="mt-2 space-y-2">
                {actions.map((action) => (
                  <div key={action.id} className="rounded border bg-card/60 p-2 text-xs">
                    <p className="font-medium">{action.actionType}</p>
                    <p className="text-muted-foreground">{action.status} · {toRelativeTime(action.createdAt)}</p>
                    {action.actionRef && <p className="text-muted-foreground">ref: {action.actionRef}</p>}
                    {action.description && <p className="text-muted-foreground">{action.description}</p>}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No remediation actions yet.</p>
            )}
          </div>

          <div className="space-y-2 rounded border p-3">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Add action</p>
            <Input value={actionType} onChange={(event) => setActionType(event.target.value)} placeholder="Action type" />
            <Input value={actionRef} onChange={(event) => setActionRef(event.target.value)} placeholder="Action ref (optional)" />
            <Textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Description (optional)" />
            <div className="flex flex-wrap gap-2">
              {(["planned", "applied", "verified", "failed"] as const).map((option) => (
                <button key={option} type="button" onClick={() => setStatus(option)}>
                  <Badge variant={status === option ? "secondary" : "outline"}>{option}</Badge>
                </button>
              ))}
            </div>
            <Button disabled={submitting || !actionType.trim()} onClick={addAction}>Add action</Button>
          </div>
        </CardContent>
      )}
    </Card>
  );
}
