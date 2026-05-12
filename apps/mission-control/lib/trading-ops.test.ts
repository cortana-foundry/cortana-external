import { describe, expect, it, vi } from "vitest";
import { loadTradingOpsDashboardData } from "@/lib/trading-ops";

describe("loadTradingOpsDashboardData", () => {
  it("retires legacy backtester artifacts and keeps external-service health", async () => {
    const fetchImpl: typeof fetch = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith("/market-data/ops")) {
        return Response.json({
          data: {
            health: {
              providers: {
                fred: "configured",
                coinmarketcap: "configured",
                schwab: "configured",
                schwabStreamer: "enabled",
                schwabStreamerMeta: {
                  connected: true,
                  operatorState: "healthy",
                  activeSubscriptions: { LEVELONE_EQUITIES: 4, ACCT_ACTIVITY: 0 },
                },
              },
            },
            providerMetrics: {
              schwabTokenStatus: "ready",
              lastSuccessfulSchwabRestAt: "2026-05-12T16:00:00.000Z",
            },
          },
        });
      }

      if (url.endsWith("/alpaca/health") || url.endsWith("/polymarket/health")) {
        return Response.json({ status: "healthy" });
      }

      if (url.endsWith("/polymarket/live")) {
        return Response.json({ streamer: { marketsConnected: true, privateConnected: true, operatorState: "healthy" } });
      }

      throw new Error(`Unexpected URL: ${url}`);
    });

    const data = await loadTradingOpsDashboardData({
      externalServiceBaseUrl: "http://127.0.0.1:3033",
      fetchImpl,
    });

    expect(data.repoPath).not.toContain("/backtester");
    expect(data.market).toMatchObject({
      state: "missing",
      badgeText: "retired",
      source: "legacy backtester retired",
    });
    expect(data.tradingRun).toMatchObject({
      state: "missing",
      badgeText: "retired",
    });
    expect(data.financialServices.state).toBe("ok");
  });
});
