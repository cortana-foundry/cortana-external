import { describe, expect, it } from "vitest";
import { buildUsageAnalytics } from "@/lib/usage-analytics";

describe("buildUsageAnalytics", () => {
  it("aggregates totals by model and agent", () => {
    const payload = {
      sessions: [
        {
          id: "s1",
          model: "gpt-5.3-codex",
          agentId: "huragok",
          inputTokens: 1000,
          outputTokens: 500,
          totalTokens: 1500,
        },
        {
          id: "s2",
          model: "claude-3.5-sonnet",
          agentId: "oracle",
          totalTokens: 2000,
        },
      ],
    };

    const result = buildUsageAnalytics(payload, 120);

    expect(result.windowMinutes).toBe(120);
    expect(result.totals.sessions).toBe(2);
    expect(result.byModel[0]?.estimatedCost).toBeGreaterThanOrEqual(result.byModel[1]?.estimatedCost ?? 0);
    expect(result.byAgent.map((row) => row.agentId)).toEqual(expect.arrayContaining(["huragok", "oracle"]));
    expect(result.totals.totalTokens).toBe(3500);
  });
});
