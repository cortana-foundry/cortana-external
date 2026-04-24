import { describe, expect, it } from "vitest";
import { resolveTradingRunStateSource, type TradingRunStateRecord } from "@/lib/trading-run-state";

const dbRecord: TradingRunStateRecord = {
  runId: "20260424-140000",
  schemaVersion: 1,
  strategy: "Trading market-session unified",
  status: "success",
  createdAt: "2026-04-24T14:00:00.000Z",
  startedAt: "2026-04-24T14:00:00.000Z",
  completedAt: "2026-04-24T14:02:00.000Z",
  notifiedAt: "2026-04-24T14:03:00.000Z",
  deliveryStatus: "notified",
  decision: "WATCH",
  confidence: null,
  risk: null,
  correctionMode: false,
  buyCount: 0,
  watchCount: 2,
  noBuyCount: 48,
  symbolsScanned: null,
  candidatesEvaluated: null,
  focusTicker: null,
  focusAction: null,
  focusStrategy: null,
  dipBuyerBuy: [],
  dipBuyerWatch: [],
  dipBuyerNoBuy: [],
  canslimBuy: [],
  canslimWatch: [],
  canslimNoBuy: [],
  artifactDirectory: null,
  summaryPath: null,
  messagePath: null,
  watchlistPath: null,
  messagePreview: null,
  metrics: null,
  lastError: null,
  sourceHost: null,
};

describe("trading run state source resolution", () => {
  it("keeps DB as canonical when it matches the file artifact", () => {
    expect(resolveTradingRunStateSource(dbRecord, {
      runId: dbRecord.runId,
      status: dbRecord.status,
      decision: "WATCH",
      buyCount: 0,
      watchCount: 2,
      noBuyCount: 48,
      completedAt: dbRecord.completedAt,
      notifiedAt: dbRecord.notifiedAt,
    })).toEqual({ source: "db", warning: null });
  });

  it("falls back to file artifact when DB and file disagree", () => {
    const resolution = resolveTradingRunStateSource(dbRecord, {
      runId: "20260424-150000",
      status: "success",
      decision: "WATCH",
      buyCount: 0,
      watchCount: 2,
      noBuyCount: 48,
      completedAt: dbRecord.completedAt,
      notifiedAt: dbRecord.notifiedAt,
    });

    expect(resolution.source).toBe("file_fallback");
    expect(resolution.warning).toContain("does not match");
  });
});
