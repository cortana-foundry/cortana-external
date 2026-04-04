import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const existsSyncMock = vi.fn();
const readFileSyncMock = vi.fn();

vi.mock("node:fs", () => ({
  default: {
    existsSync: existsSyncMock,
    readFileSync: readFileSyncMock,
  },
}));

const originalToken = process.env.MISSION_CONTROL_API_TOKEN;

afterEach(() => {
  if (originalToken === undefined) {
    delete process.env.MISSION_CONTROL_API_TOKEN;
  } else {
    process.env.MISSION_CONTROL_API_TOKEN = originalToken;
  }
  vi.unstubAllGlobals();
});

describe("GET /api/services/actions/[action]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    existsSyncMock.mockImplementation((target: string) => target.endsWith(".git") || target.endsWith(".env"));
    readFileSyncMock.mockReturnValue("PORT=4040\n");
  });

  it("requires a configured Mission Control API token", async () => {
    delete process.env.MISSION_CONTROL_API_TOKEN;

    const { GET } = await import("@/app/api/services/actions/[action]/route");
    const response = await GET(
      new Request("http://remote.test/api/services/actions/whoop-auth-url", {
        headers: { host: "100.120.198.12:3000" },
      }),
      { params: Promise.resolve({ action: "whoop-auth-url" }) },
    );

    expect(response.status).toBe(503);
  });

  it("allows loopback bootstrap actions when no token is configured", async () => {
    delete process.env.MISSION_CONTROL_API_TOKEN;
    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(JSON.stringify({ url: "https://whoop.test/oauth" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock as typeof fetch);

    const { GET } = await import("@/app/api/services/actions/[action]/route");
    const response = await GET(
      new Request("http://127.0.0.1:3000/api/services/actions/whoop-auth-url", {
        headers: { host: "127.0.0.1:3000" },
      }),
      { params: Promise.resolve({ action: "whoop-auth-url" }) },
    );

    expect(response.status).toBe(200);
  });

  it("returns the OAuth URL when the request is authorized", async () => {
    process.env.MISSION_CONTROL_API_TOKEN = "secret";
    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(JSON.stringify({ url: "https://whoop.test/oauth" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock as typeof fetch);

    const { GET } = await import("@/app/api/services/actions/[action]/route");
    const response = await GET(
      new Request("http://localhost/api/services/actions/whoop-auth-url", {
        headers: { authorization: "Bearer secret" },
      }),
      { params: Promise.resolve({ action: "whoop-auth-url" }) },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      status: "ok",
      url: "https://whoop.test/oauth",
    });
    expect(fetchMock).toHaveBeenCalledWith("http://127.0.0.1:4040/auth/url", { cache: "no-store" });
  });
});
