import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET, POST } from "@/app/api/decisions/route";
import { createDecisionTrace, getDecisionTraces } from "@/lib/decision-traces";

vi.mock("@/lib/decision-traces", () => ({
  getDecisionTraces: vi.fn(),
  createDecisionTrace: vi.fn(),
}));

describe("/api/decisions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("GET returns decision traces", async () => {
    vi.mocked(getDecisionTraces).mockResolvedValueOnce({
      traces: [{ id: 1, traceId: "trace-1" }],
      facets: { actionTypes: [], triggerTypes: [], outcomes: [] },
      source: "cortana",
    } as never);

    const response = await GET(new Request("http://localhost/api/decisions?rangeHours=24"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.traces).toHaveLength(1);
    expect(getDecisionTraces).toHaveBeenCalledWith({
      rangeHours: 24,
      actionType: undefined,
      triggerType: undefined,
      outcome: "all",
      confidenceMin: undefined,
      confidenceMax: undefined,
      limit: 120,
    });
  });

  it("POST writes a decision trace", async () => {
    const request = new Request("http://localhost/api/decisions", {
      method: "POST",
      body: JSON.stringify({
        trace_id: "trace-1",
        trigger_type: "market_brief",
        action_type: "market_posture",
        action_name: "WATCH",
        reasoning: "Breadth is mixed.",
      }),
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(createDecisionTrace).toHaveBeenCalledWith({
      traceId: "trace-1",
      eventId: null,
      taskId: null,
      runId: null,
      triggerType: "market_brief",
      actionType: "market_posture",
      actionName: "WATCH",
      reasoning: "Breadth is mixed.",
      confidence: null,
      outcome: null,
      dataInputs: {},
      metadata: {},
      createdAt: null,
      completedAt: null,
    });
    expect(body).toEqual({ ok: true });
  });
});
