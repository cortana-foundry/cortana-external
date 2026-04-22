import { describe, expect, it } from "vitest";

import { FitnessClient } from "@cortana/fitness-client";
import { TonalHealthResponseSchema, WhoopHealthResponseSchema } from "@cortana/fitness-types";

describe("fitness shared packages", () => {
  it("parses the strict whoop and tonal health schemas", () => {
    expect(
      WhoopHealthResponseSchema.parse({
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
      }).auth_alert.active,
    ).toBe(true);

    expect(
      TonalHealthResponseSchema.parse({
        status: "healthy",
        authenticated: true,
        user_id: "user-1",
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
      }).user_id,
    ).toBe("user-1");
  });

  it("fetches whoop health through the typed client", async () => {
    const client = new FitnessClient({
      baseUrl: "http://fitness.test",
      fetchImpl: async () =>
        new Response(
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
          { status: 200, headers: { "content-type": "application/json" } },
        ),
    });

    const response = await client.getWhoopHealth();

    expect(response.status).toBe("healthy");
    expect(response.authenticated).toBe(true);
    expect(response.stale_cache.available).toBe(true);
  });
});
