import { afterEach, describe, expect, it, vi } from "vitest";

import {
  getExternalHealth,
  getPolymarketHealth,
  getSchwabHealth,
  getSchwabStreamerHealth,
  getTonalHealth,
  getWhoopHealth,
} from "./workspace-health";

describe("workspace health mapping", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("marks whoop unhealthy when auth alert is active even with stale cache", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith("/whoop/health")) {
          return new Response(
            JSON.stringify({
              status: "unhealthy",
              authenticated: true,
              expires_at: "2026-04-17T13:53:25.658Z",
              expires_in_seconds: -30,
              is_expired: true,
              needs_refresh: true,
              refresh_token_present: true,
              error: "authentication failed",
              details: "refresh token endpoint returned status 400",
              auth_alert: {
                active: true,
                consecutive_failures: 3,
                last_error: "refresh token endpoint returned status 400",
                updated_at: "2026-04-22T12:51:56.655Z",
              },
              stale_cache: {
                available: true,
                fetched_at: "2026-04-05T12:00:00.000Z",
              },
            }),
            { status: 503 },
          );
        }

        if (url.endsWith("/auth/status")) {
          return new Response(
            JSON.stringify({
              has_token: true,
              refresh_token_present: true,
            }),
            { status: 200 },
          );
        }

        throw new Error(`unexpected url ${url}`);
      }),
    );

    const result = await getWhoopHealth("http://external.test");

    expect(result.tone).toBe("unhealthy");
    expect(result.summary).toBe("Auth alert active");
    expect(result.detail).toContain("refresh token endpoint returned status 400");
  });

  it("marks tonal unhealthy when auth alert is active", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            status: "unhealthy",
            authenticated: false,
            expires_at: null,
            expires_in_seconds: null,
            is_expired: true,
            needs_refresh: true,
            refresh_token_present: false,
            error: "authentication failed",
            details: "auth failed: 401 Unauthorized",
            auth_alert: {
              active: true,
              consecutive_failures: 3,
              last_error: "auth failed: 401 Unauthorized",
              updated_at: "2026-04-22T12:51:56.655Z",
            },
          }),
          { status: 503 },
        ),
      ),
    );

    const result = await getTonalHealth("http://external.test");

    expect(result.tone).toBe("unhealthy");
    expect(result.summary).toBe("Auth alert active");
    expect(result.detail).toContain("401 Unauthorized");
  });

  it("surfaces failing providers on aggregate external health", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            status: "degraded",
            whoop: {
              status: "unhealthy",
              auth_alert: {
                active: true,
                consecutive_failures: 4,
                last_error: "refresh token endpoint returned status 400",
                updated_at: "2026-04-22T12:51:56.655Z",
              },
            },
            tonal: { status: "healthy" },
            alpaca: { status: "healthy" },
            appleHealth: { status: "unhealthy" },
            marketData: { status: "healthy" },
            polymarket: { status: "healthy" },
          }),
          { status: 200 },
        ),
      ),
    );

    const result = await getExternalHealth("http://external.test");

    expect(result.tone).toBe("degraded");
    expect(result.detail).toContain("Whoop (auth alert)");
    expect(result.detail).toContain("Apple Health (unhealthy)");
  });

  it("returns healthy whoop tone after recovery clears the auth alert", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith("/whoop/health")) {
          return new Response(
            JSON.stringify({
              status: "healthy",
              authenticated: true,
              expires_at: "2026-04-22T13:53:46.589Z",
              expires_in_seconds: 3577,
              is_expired: false,
              needs_refresh: false,
              refresh_token_present: true,
              auth_alert: {
                active: false,
                consecutive_failures: 0,
                last_error: null,
                updated_at: null,
              },
              stale_cache: {
                available: true,
                fetched_at: "2026-04-22T12:53:46.589Z",
              },
            }),
            { status: 200 },
          );
        }

        if (url.endsWith("/auth/status")) {
          return new Response(
            JSON.stringify({
              has_token: true,
              refresh_token_present: true,
            }),
            { status: 200 },
          );
        }

        throw new Error(`unexpected url ${url}`);
      }),
    );

    const result = await getWhoopHealth("http://external.test");

    expect(result.tone).toBe("healthy");
    expect(result.summary).toBe("Authenticated");
  });

  it("surfaces Schwab REST as re-auth required when the operator lane needs human action", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith("/auth/schwab/status")) {
          return new Response(
            JSON.stringify({
              data: {
                clientConfigured: true,
                refreshTokenPresent: true,
                pendingStateIssuedAt: null,
              },
            }),
            { status: 200 },
          );
        }
        if (url.endsWith("/market-data/ready")) {
          return new Response(
            JSON.stringify({
              data: {
                ready: false,
                operatorState: "human_action_required",
                operatorAction: "Re-authorize the Schwab app.",
              },
            }),
            { status: 503 },
          );
        }
        if (url.endsWith("/market-data/ops")) {
          return new Response(
            JSON.stringify({
              data: {
                serviceOperatorState: "human_action_required",
                serviceOperatorAction: "Re-authorize the Schwab app.",
                providerMetrics: {
                  schwabTokenStatus: "human_action_required",
                  schwabTokenReason: "Refresh token rejected by Schwab.",
                },
              },
            }),
            { status: 200 },
          );
        }

        throw new Error(`unexpected url ${url}`);
      }),
    );

    const result = await getSchwabHealth("http://external.test");

    expect(result.tone).toBe("unhealthy");
    expect(result.summary).toBe("Re-auth required");
    expect(result.detail).toContain("Refresh token rejected by Schwab.");
  });

  it("surfaces Schwab streamer as degraded when the stream is reconnecting", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith("/auth/schwab/streamer/status")) {
          return new Response(
            JSON.stringify({
              data: {
                clientConfigured: true,
                refreshTokenPresent: true,
                pendingStateIssuedAt: null,
              },
            }),
            { status: 200 },
          );
        }
        if (url.endsWith("/market-data/ops")) {
          return new Response(
            JSON.stringify({
              data: {
                health: {
                  providers: {
                    schwabStreamerMeta: {
                      connected: false,
                      operatorState: "reconnecting",
                      operatorAction: "Waiting for the shared streamer to reconnect.",
                    },
                  },
                },
              },
            }),
            { status: 200 },
          );
        }

        throw new Error(`unexpected url ${url}`);
      }),
    );

    const result = await getSchwabStreamerHealth("http://external.test");

    expect(result.tone).toBe("degraded");
    expect(result.summary).toBe("Reconnecting");
    expect(result.detail).toContain("shared streamer");
  });

  it("surfaces Polymarket as authenticated from the dedicated health endpoint", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            status: "healthy",
            apiBaseUrl: "https://api.polymarket.us",
            gatewayBaseUrl: "https://gateway.polymarket.us",
            keyIdSuffix: "106dac",
            balanceCount: 0,
          }),
          { status: 200 },
        ),
      ),
    );

    const result = await getPolymarketHealth("http://external.test");

    expect(result.tone).toBe("healthy");
    expect(result.summary).toBe("Authenticated");
  });
});
