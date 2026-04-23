import { describe, expect, it } from "vitest";

import { calculateExitPerformance, mapTradeLedgerRow } from "../alpaca/trade-ledger.js";
import { isFreshCache, jsonErrorResponse } from "../lib/cached-connector.js";
import { providerLaneResult } from "../market-data/provider-lane.js";
import {
  initialActiveStreamerRole,
  shouldDemoteStreamerLeader,
  shouldStartLeaderStreamer,
} from "../market-data/streamer-runtime-state.js";
import { ExternalServiceLifecycleSupervisor } from "../service-lifecycle.js";

const logger = {
  log() {},
  printf() {},
  error() {},
};

describe("external service boundary helpers", () => {
  it("builds market-data lane envelopes", () => {
    const result = providerLaneResult(
      {
        source: "alpaca",
        status: "ok",
        stalenessSeconds: 0,
        providerMode: "alpaca_fallback",
        fallbackEngaged: true,
        providerModeReason: "fallback",
      },
      { rows: [{ close: 12 }] },
    );

    expect(result).toMatchObject({
      source: "alpaca",
      providerMode: "alpaca_fallback",
      fallbackEngaged: true,
      rows: [{ close: 12 }],
    });
  });

  it("keeps Schwab streamer role policy isolated", () => {
    expect(initialActiveStreamerRole("auto")).toBe("follower");
    expect(shouldStartLeaderStreamer({
      enabled: true,
      activeRole: "leader",
      hasStreamer: false,
      credentialsConfigured: true,
    })).toBe(true);
    expect(shouldDemoteStreamerLeader({
      activeRole: "leader",
      failurePolicy: "max_connections_exceeded",
    })).toBe(true);
  });

  it("normalizes cached connector freshness and errors", async () => {
    expect(isFreshCache(1_000, 500, 1_499)).toBe(true);
    expect(isFreshCache(1_000, 500, 1_501)).toBe(false);

    const error = new Error("expired") as Error & { statusCode: number };
    error.statusCode = 401;
    const response = jsonErrorResponse(error);
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "expired" });
  });

  it("maps Alpaca ledger rows and exit performance", () => {
    const performance = calculateExitPerformance(10, 3, 12);
    expect(performance.pnl).toBe(6);
    expect(performance.pnlPct).toBeCloseTo(20);
    expect(mapTradeLedgerRow({
      id: 7,
      timestamp: new Date("2026-01-02T03:04:05Z"),
      symbol: "AAPL",
      side: "buy",
      qty: 1,
      notional: null,
      entry_price: 10,
      target_price: null,
      stop_loss: null,
      thesis: null,
      signal_source: null,
      status: "open",
      exit_price: null,
      exit_timestamp: null,
      pnl: null,
      pnl_pct: null,
      outcome: null,
      metadata: { source: "test" },
    })).toMatchObject({
      id: 7,
      timestamp: "2026-01-02T03:04:05.000Z",
      thesis: "",
      signal_source: "",
      status: "open",
    });
  });

  it("supervises startup, maintenance, and shutdown without route/server state", async () => {
    const calls: string[] = [];
    const services = {
      marketData: {
        startup: async () => calls.push("market-startup"),
        shutdown: async () => calls.push("market-shutdown"),
      },
      whoop: {
        warmup: async () => calls.push("whoop-warmup"),
        proactiveRefreshIfExpiring: async () => calls.push("whoop-refresh"),
      },
      tonal: {
        warmup: async () => calls.push("tonal-warmup"),
        proactiveRefreshIfExpiring: async () => calls.push("tonal-refresh"),
      },
    } as never;

    const supervisor = new ExternalServiceLifecycleSupervisor(services, {
      startup: logger,
      refresh: logger,
      shutdown: logger,
    });

    await supervisor.startup();
    await supervisor.runMaintenanceOnce();
    await supervisor.shutdown();

    expect(calls).toEqual([
      "market-startup",
      "whoop-warmup",
      "tonal-warmup",
      "whoop-refresh",
      "tonal-refresh",
      "market-shutdown",
    ]);
  });
});
