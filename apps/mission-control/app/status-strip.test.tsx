import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { StatusStrip } from "@/components/status-strip";

const jsonResponse = (payload: unknown, status = 200) =>
  ({ ok: status >= 200 && status < 300, status, json: async () => payload }) as Response;

describe("StatusStrip", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("renders all four status segments once their hooks resolve", async () => {
    vi.spyOn(global, "fetch").mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/heartbeat-status")) {
        return jsonResponse({ ok: true, lastHeartbeat: Date.now() - 60_000, status: "healthy", ageMs: 60_000 });
      }
      if (url.includes("/api/thinking-status")) {
        return jsonResponse({ ok: true, idle: false, current: "Indexing memex", items: ["Indexing memex"], updatedAt: new Date().toISOString() });
      }
      if (url.includes("/api/db-status")) {
        return jsonResponse({ postgres: true, lancedb: true });
      }
      if (url.includes("/api/autonomy-score")) {
        return jsonResponse({ ok: true, score: 92, trend: { direction: "up", delta: 1.5 }, updatedAt: new Date().toISOString(), source: "cortana" });
      }
      return jsonResponse({});
    });

    render(<StatusStrip />);

    expect(await screen.findByText("LIVE")).toBeInTheDocument();
    expect(await screen.findByText("Indexing memex")).toBeInTheDocument();
    expect(screen.getByText("PG")).toBeInTheDocument();
    expect(screen.getByText("Vector")).toBeInTheDocument();
    expect(await screen.findByText("92")).toBeInTheDocument();
    expect(screen.getByText("autonomy")).toBeInTheDocument();
  });

  it('falls back to "—" tokens when hooks fail to load', async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(jsonResponse({}, 500));

    render(<StatusStrip />);

    expect(screen.getByText("Systems nominal.")).toBeInTheDocument();
    // Heartbeat label collapses to em-dash when status is unknown.
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
  });
});
