import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MarketDataGovernanceReporter } from "./governance-reporter.js";

const logger = {
  log: vi.fn(),
  printf: vi.fn(),
  error: vi.fn(),
};

describe("MarketDataGovernanceReporter", () => {
  const originalBaseUrl = process.env.MISSION_CONTROL_BASE_URL;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.MISSION_CONTROL_BASE_URL = "http://127.0.0.1:3000";
  });

  afterEach(() => {
    if (originalBaseUrl == null) {
      delete process.env.MISSION_CONTROL_BASE_URL;
    } else {
      process.env.MISSION_CONTROL_BASE_URL = originalBaseUrl;
    }
  });

  it("emits an active feedback signal for tracked operator states and avoids duplicates", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({ state: "created" }), { status: 201 }));
    const reporter = new MarketDataGovernanceReporter({ fetchImpl, logger });

    await reporter.reconcile({
      serviceOperatorState: "human_action_required",
      serviceOperatorAction: "Re-auth Schwab",
      streamerOperatorState: "healthy",
      streamerOperatorAction: "No operator action required.",
      health: {},
    });

    await reporter.reconcile({
      serviceOperatorState: "human_action_required",
      serviceOperatorAction: "Re-auth Schwab",
      streamerOperatorState: "healthy",
      streamerOperatorAction: "No operator action required.",
      health: {},
    });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl.mock.calls[0]?.[0]).toBe("http://127.0.0.1:3000/api/feedback/ingest");
    expect(String(fetchImpl.mock.calls[0]?.[1]?.body)).toContain("\"signal_state\":\"active\"");
  });

  it("emits a cleared signal when a tracked issue recovers", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({ state: "ok" }), { status: 200 }));
    const reporter = new MarketDataGovernanceReporter({ fetchImpl, logger });

    await reporter.reconcile({
      serviceOperatorState: "max_connections_blocked",
      serviceOperatorAction: "Reduce competing streams",
      streamerOperatorState: "healthy",
      streamerOperatorAction: "No operator action required.",
      health: {},
    });

    await reporter.reconcile({
      serviceOperatorState: "healthy",
      serviceOperatorAction: "No operator action required.",
      streamerOperatorState: "healthy",
      streamerOperatorAction: "No operator action required.",
      health: {},
    });

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(String(fetchImpl.mock.calls[1]?.[1]?.body)).toContain("\"signal_state\":\"cleared\"");
  });
});
