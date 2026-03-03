import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CronClient } from "@/app/cron/cron-client";

const jsonResponse = (payload: unknown, status = 200) =>
  ({ ok: status >= 200 && status < 300, status, json: async () => payload }) as Response;

const hasText = (text: string) => screen.queryAllByText(text).length > 0;
const clickTab = (name: string) => fireEvent.click(screen.getAllByRole("tab", { name }).at(-1)!);

describe("CronClient", () => {
  beforeEach(() => vi.restoreAllMocks());

  const baseJobs = [
    { id: "job-alpha", name: "Alpha Job", enabled: true, state: { consecutiveErrors: 0 } },
    { id: "job-beta", name: "Beta Disabled", enabled: false, state: { consecutiveErrors: 0 } },
    { id: "job-gamma", name: "Gamma Error", enabled: true, state: { consecutiveErrors: 2 } },
  ];

  const mockFetch = () => {
    let currentJobs = [...baseJobs];
    return vi.spyOn(global, "fetch").mockImplementation(async (input, init) => {
      const url = typeof input === "string" ? input : input.toString();
      const method = init?.method ?? "GET";

      if (url === "/api/cron" && method === "GET") return jsonResponse({ jobs: currentJobs });
      if (url.includes("/toggle") && method === "POST") return jsonResponse({ ok: true });
      if (url.includes("/run") && method === "POST") return jsonResponse({ ok: true });
      if (url.endsWith("/job-alpha") && method === "DELETE") {
        currentJobs = currentJobs.filter((job) => job.id !== "job-alpha");
        return jsonResponse({ ok: true });
      }
      if (url === "/api/cron" && method === "POST") return jsonResponse({ ok: true });
      if (url.includes("/runs") && method === "GET") return jsonResponse({ runs: [] });
      return jsonResponse({ error: `Unhandled request: ${method} ${url}` }, 500);
    });
  };

  it("renders page heading / title", async () => {
    mockFetch();
    render(React.createElement(CronClient));
    expect(screen.getByText("Cron editor")).toBeInTheDocument();
    expect(screen.getByText("Cron Scheduler")).toBeInTheDocument();
    await screen.findByText("Schedule control");
  });

  it("shows loading state initially", () => {
    vi.spyOn(global, "fetch").mockImplementation(() => new Promise(() => {}));
    render(React.createElement(CronClient));
    expect(screen.getByText("Loading cron jobs...")).toBeInTheDocument();
  });

  it("renders job list after fetch", async () => {
    mockFetch();
    render(React.createElement(CronClient));
    await waitFor(() => expect(hasText("Alpha Job")).toBe(true));
    expect(hasText("Beta Disabled")).toBe(true);
    expect(hasText("Gamma Error")).toBe(true);
  });

  it("filter tabs work (All/Enabled/Disabled/Errors)", async () => {
    mockFetch();
    render(React.createElement(CronClient));
    await waitFor(() => expect(hasText("Alpha Job")).toBe(true));

    const search = screen.getByPlaceholderText("Search cron jobs");

    clickTab("Enabled");
    fireEvent.change(search, { target: { value: "beta" } });
    expect(screen.getByText("No cron jobs found for this view.")).toBeInTheDocument();

    fireEvent.change(search, { target: { value: "" } });
    clickTab("Disabled");
    fireEvent.change(search, { target: { value: "alpha" } });
    expect(screen.getByText("No cron jobs found for this view.")).toBeInTheDocument();

    fireEvent.change(search, { target: { value: "" } });
    clickTab("Errors");
    fireEvent.change(search, { target: { value: "beta" } });
    expect(screen.getByText("No cron jobs found for this view.")).toBeInTheDocument();

    fireEvent.change(search, { target: { value: "" } });
    clickTab("All");
    fireEvent.change(search, { target: { value: "beta" } });
    expect(hasText("Beta Disabled")).toBe(true);
  });

  it("search filters jobs by name", async () => {
    mockFetch();
    render(React.createElement(CronClient));
    await waitFor(() => expect(hasText("Alpha Job")).toBe(true));

    fireEvent.change(screen.getByPlaceholderText("Search cron jobs"), { target: { value: "gamma" } });

    expect(hasText("Gamma Error")).toBe(true);
    expect(hasText("Alpha Job")).toBe(false);
    expect(hasText("Beta Disabled")).toBe(false);
  });

  it("toggle button calls toggle API", async () => {
    const fetchMock = mockFetch();
    render(React.createElement(CronClient));
    await waitFor(() => expect(hasText("Alpha Job")).toBe(true));

    fireEvent.click(screen.getAllByRole("button", { name: "Disable" })[0]);

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/cron/job-alpha/toggle",
        expect.objectContaining({ method: "POST" })
      )
    );
  });

  it("Run Now button calls run API", async () => {
    const fetchMock = mockFetch();
    render(React.createElement(CronClient));
    await waitFor(() => expect(hasText("Alpha Job")).toBe(true));

    fireEvent.click(screen.getAllByRole("button", { name: "Run" })[0]);

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/cron/job-alpha/run",
        expect.objectContaining({ method: "POST" })
      )
    );
  });

  it("Delete button shows confirmation before calling delete API", async () => {
    const fetchMock = mockFetch();
    render(React.createElement(CronClient));
    await waitFor(() => expect(hasText("Alpha Job")).toBe(true));

    fireEvent.click(screen.getAllByRole("button", { name: "Delete" })[0]);
    expect(screen.getByText("Delete cron job")).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole("button", { name: "Delete" }).at(-1)!);

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/cron/job-alpha",
        expect.objectContaining({ method: "DELETE" })
      )
    );
  });

  it("Create button opens modal with empty fields", async () => {
    mockFetch();
    render(React.createElement(CronClient));
    await waitFor(() => expect(hasText("Alpha Job")).toBe(true));

    fireEvent.click(screen.getByRole("button", { name: "Create cron" }));
    expect(screen.getByText("Create cron job")).toBeInTheDocument();
    expect((screen.getByLabelText("Name") as HTMLInputElement).value).toBe("");
    expect((screen.getByLabelText("Agent ID") as HTMLInputElement).value).toBe("");
  });

  it("Edit button opens modal with pre-populated fields", async () => {
    mockFetch();
    render(React.createElement(CronClient));
    await waitFor(() => expect(hasText("Alpha Job")).toBe(true));

    fireEvent.click(screen.getAllByRole("button", { name: "Edit" })[0]);
    expect(screen.getByText("Edit cron job")).toBeInTheDocument();
    expect((screen.getByLabelText("Name") as HTMLInputElement).value).toBe("Alpha Job");
  });
});
