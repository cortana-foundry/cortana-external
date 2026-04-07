import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/decisions/route";
import { getDecisionTraces } from "@/lib/decision-traces";

vi.mock("@/lib/decision-traces", () => ({
  getDecisionTraces: vi.fn(),
}));

describe("GET /api/decisions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns decision traces with parsed filters", async () => {
    vi.mocked(getDecisionTraces).mockResolvedValueOnce({
      traces: [{ id: 1, traceId: "trace-1" }],
      facets: { actionTypes: ["deploy"], triggerTypes: ["schedule"], outcomes: ["success"] },
      source: "cortana",
    } as never);

    const response = await GET(new Request(
      "http://localhost/api/decisions?rangeHours=24&actionType=deploy&triggerType=schedule&outcome=success&confidenceMin=0.5&confidenceMax=0.9&limit=5",
    ));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.traces).toEqual([{ id: 1, traceId: "trace-1" }]);
    expect(getDecisionTraces).toHaveBeenCalledWith({
      rangeHours: 24,
      actionType: "deploy",
      triggerType: "schedule",
      outcome: "success",
      confidenceMin: 0.5,
      confidenceMax: 0.9,
      limit: 5,
    });
  });

  it("uses a 30 day default range", async () => {
    vi.mocked(getDecisionTraces).mockResolvedValueOnce({
      traces: [],
      facets: { actionTypes: [], triggerTypes: [], outcomes: [] },
      source: "app",
      warning: "fallback",
    } as never);

    await GET(new Request("http://localhost/api/decisions"));

    expect(getDecisionTraces).toHaveBeenCalledWith({
      rangeHours: 24 * 30,
      actionType: undefined,
      triggerType: undefined,
      outcome: "all",
      confidenceMin: undefined,
      confidenceMax: undefined,
      limit: 120,
    });
  });
});
