import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/feedback/ingest/route";
import { reconcileFeedbackSignal } from "@/lib/feedback";

vi.mock("@/lib/feedback", () => ({
  reconcileFeedbackSignal: vi.fn(),
}));

describe("POST /api/feedback/ingest", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("reconciles an active feedback signal", async () => {
    vi.mocked(reconcileFeedbackSignal).mockResolvedValueOnce({
      id: "fb-1",
      state: "created",
    });

    const request = new Request("http://localhost/api/feedback/ingest", {
      method: "POST",
      body: JSON.stringify({
        source: "system",
        category: "external_service.market_data",
        severity: "critical",
        summary: "Schwab auth required",
        recurrence_key: "external-service:market-data:service-operator",
        signal_state: "active",
      }),
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(reconcileFeedbackSignal).toHaveBeenCalledWith({
      runId: null,
      taskId: null,
      agentId: null,
      source: "system",
      category: "external_service.market_data",
      severity: "critical",
      summary: "Schwab auth required",
      details: undefined,
      recurrenceKey: "external-service:market-data:service-operator",
      owner: null,
      actor: null,
      signalState: "active",
    });
    expect(body).toEqual({ id: "fb-1", state: "created" });
  });
});
