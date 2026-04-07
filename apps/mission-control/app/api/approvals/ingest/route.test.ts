import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/approvals/ingest/route";
import { reconcileApprovalSignal } from "@/lib/approvals";

vi.mock("@/lib/approvals", () => ({
  reconcileApprovalSignal: vi.fn(),
}));

describe("POST /api/approvals/ingest", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("reconciles a pending approval signal", async () => {
    vi.mocked(reconcileApprovalSignal).mockResolvedValueOnce({
      state: "created",
      approval: { id: "apr-1", status: "pending" },
    } as never);

    const request = new Request("http://localhost/api/approvals/ingest", {
      method: "POST",
      body: JSON.stringify({
        signal_state: "pending",
        agent_id: "backtester.experimental_alpha",
        action_type: "promote_rank_modifier_overlay",
        correlation_key: "overlay-rank:execution_quality",
        proposal: { overlay_name: "execution_quality" },
        rationale: "Only manual approval is missing.",
        risk_level: "p1",
      }),
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(reconcileApprovalSignal).toHaveBeenCalledWith({
      signalState: "pending",
      agentId: "backtester.experimental_alpha",
      actionType: "promote_rank_modifier_overlay",
      correlationKey: "overlay-rank:execution_quality",
      proposal: { overlay_name: "execution_quality" },
      rationale: "Only manual approval is missing.",
      riskLevel: "p1",
      blastRadius: null,
      resumePayload: null,
      runId: null,
      taskId: null,
      actor: null,
      clearReason: null,
    });
    expect(body.state).toBe("created");
  });
});
