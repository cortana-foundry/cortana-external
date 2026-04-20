import { act, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mockMatchMedia } from "./_components/__tests__/setup";

vi.mock("./_components/transcript", () => ({
  Transcript: () => <div data-testid="transcript" />,
}));

const EMPTY_SESSIONS_RESPONSE = {
  sessions: [
    {
      sessionId: "s1",
      threadName: "Example",
      updatedAt: Date.now(),
      cwd: "/tmp/project",
      model: "gpt-5.4",
      source: "exec",
      cliVersion: "0.121.0",
      lastMessagePreview: "hello",
      transcriptPath: "/tmp/project.jsonl",
    },
  ],
  groups: [
    {
      id: "g1",
      label: "Project",
      rootPath: "/tmp/project",
      isActive: false,
      isCollapsed: false,
      sessions: [
        {
          sessionId: "s1",
          threadName: "Example",
          updatedAt: Date.now(),
          cwd: "/tmp/project",
          model: "gpt-5.4",
          source: "exec",
          cliVersion: "0.121.0",
          lastMessagePreview: "hello",
          transcriptPath: "/tmp/project.jsonl",
        },
      ],
    },
  ],
  latestUpdatedAt: Date.now(),
  totalMatchedSessions: 1,
  totalVisibleSessions: 1,
};

function installFetchMock() {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input.toString();
    if (url === "/api/codex/sessions") {
      return {
        ok: true,
        json: async () => EMPTY_SESSIONS_RESPONSE,
      } as Response;
    }
    return {
      ok: true,
      json: async () => ({ session: { ...EMPTY_SESSIONS_RESPONSE.sessions[0], events: [] } }),
    } as Response;
  });
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

describe("SessionsPage responsive", () => {
  beforeEach(() => {
    installFetchMock();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("below 988px viewport, shows menu button and hides the inbox by default", async () => {
    mockMatchMedia(() => false);
    const { default: SessionsPage } = await import("./page");
    await act(async () => {
      render(<SessionsPage />);
    });
    await waitFor(() => expect(screen.queryByText("Loading Codex sessions…")).toBeNull(), {
      timeout: 3000,
    });
    const menuButton = screen.queryByRole("button", { name: /open thread inbox/i });
    expect(menuButton).not.toBeNull();
  });

  it("at ≥988px viewport, shows the inbox with comfortable density and a New thread button", async () => {
    mockMatchMedia([
      { query: "(min-width: 988px)", matches: true },
      { query: "(hover: hover)", matches: true },
    ]);
    const { default: SessionsPage } = await import("./page");
    await act(async () => {
      render(<SessionsPage />);
    });
    await waitFor(
      () => {
        expect(screen.getAllByText("Example").length).toBeGreaterThan(0);
      },
      { timeout: 3000 },
    );
    const card = screen.getAllByRole("button", { name: /example/i })[0];
    expect(card).toHaveAttribute("data-density", "comfortable");
    expect(screen.getByRole("button", { name: /start a new codex thread/i })).toBeDefined();
  });
});
