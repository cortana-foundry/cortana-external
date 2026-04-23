import { describe, expect, it } from "vitest";
import {
  buildVacationTierRollup,
  countVacationIncidents,
  countVacationSystemsByTier,
} from "@/lib/vacation-ops-model";

describe("vacation ops model helpers", () => {
  it("rolls check statuses up by tier", () => {
    expect(buildVacationTierRollup([
      { tier: 2, status: "green" },
      { tier: 1, status: "warn" },
      { tier: 1, status: "fail" },
      { tier: 1, status: "unknown" },
    ])).toEqual([
      { tier: 1, total: 3, green: 0, yellow: 1, red: 1, other: 1 },
      { tier: 2, total: 1, green: 1, yellow: 0, red: 0, other: 0 },
    ]);
  });

  it("counts configured systems and incidents for the snapshot", () => {
    expect(countVacationSystemsByTier({
      alpha: { tier: 1 },
      beta: { tier: 2 },
      gamma: { tier: 2 },
    })).toEqual({ tier1: 1, tier2: 2 });

    expect(countVacationIncidents([
      { status: "open", humanRequired: true, resolutionReason: null },
      { status: "resolved", humanRequired: false, resolutionReason: "remediated" },
      { status: "resolved", humanRequired: false, resolutionReason: "ignored" },
    ])).toEqual({
      activeIncidents: 1,
      humanRequiredIncidents: 1,
      resolvedIncidents: 2,
      selfHeals: 1,
    });
  });
});
