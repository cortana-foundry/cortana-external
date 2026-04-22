import { afterEach, describe, expect, it, vi } from "vitest";

import { getExternalHealth, getTonalHealth, getWhoopHealth } from "./workspace-health";

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
});
