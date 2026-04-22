import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import ServicesClient from "@/app/services/services-client";

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("ServicesClient", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(window, "open").mockImplementation(() => null);
  });

  it("renders explicit provider cards and launches streamer auth from the services workspace", async () => {
    vi.spyOn(global, "fetch").mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/services/workspace") {
        return jsonResponse({
          status: "ok",
          data: {
            generatedAt: "2026-04-22T15:00:00.000Z",
            files: [],
            sections: [],
            openclawDocsPath: "/Users/hd/Developer/cortana-external/docs/source/architecture/mission-control.md",
            health: [
              item("openclaw-gateway", "OpenClaw gateway"),
              item("external-service", "External service"),
              item("market-data", "Market data"),
              item("schwab-rest", "Schwab REST"),
              item("schwab-streamer", "Schwab Streamer"),
              item("whoop", "Whoop"),
              item("tonal", "Tonal"),
              item("alpaca", "Alpaca"),
              item("polymarket", "Polymarket"),
            ],
          },
        });
      }

      if (url === "/api/services/actions/schwab-streamer-auth-url") {
        return jsonResponse({ status: "ok", url: "https://schwab.test/streamer" });
      }

      throw new Error(`unexpected url ${url}`);
    });

    render(<ServicesClient />);

    expect(await screen.findByText("Schwab REST")).toBeInTheDocument();
    expect(screen.getByText("Schwab Streamer")).toBeInTheDocument();
    expect(screen.getByText("Polymarket")).toBeInTheDocument();
    expect(screen.getByText("Alpaca")).toBeInTheDocument();
    expect(screen.queryByText(/more health checks/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /schwab streamer oauth/i }));

    await waitFor(() => {
      expect(window.open).toHaveBeenCalledWith("https://schwab.test/streamer", "_blank", "noopener,noreferrer");
    });
  });
});

function item(id: string, label: string) {
  return {
    id,
    label,
    tone: "healthy",
    summary: "Connected",
    detail: "ok",
    checkedAt: "2026-04-22T15:00:00.000Z",
    raw: {},
  };
}
