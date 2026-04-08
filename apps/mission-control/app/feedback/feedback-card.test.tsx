import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FeedbackCard } from "@/components/feedback-card";

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: any) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

const baseFeedback = {
  id: "fb-1",
  runId: null,
  taskId: null,
  linkedTaskId: null,
  linkedTaskStatus: null,
  agentId: null,
  source: "user",
  category: "correction",
  severity: "medium",
  summary: "Mission Control feedback test",
  details: { lesson: "feedback ledger test" },
  recurrenceKey: "feedback ledger test",
  status: "new",
  owner: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  actionCount: 0,
  remediationStatus: "open",
  remediationNotes: null,
  resolvedAt: null,
  resolvedBy: null,
  actions: [],
} as const;

describe("FeedbackCard", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("updates the card after saving notes", async () => {
    const fetchMock = vi.spyOn(global, "fetch").mockImplementation(async (input, init) => {
      const url = typeof input === "string" ? input : input.toString();
      const method = init?.method ?? "GET";

      if (url === "/api/feedback/fb-1" && method === "PATCH") {
        return {
          ok: true,
          json: async () => ({
            ok: true,
            item: {
              ...baseFeedback,
              remediationNotes: "saved note",
            },
          }),
        } as Response;
      }

      if (url === "/api/feedback/fb-1" && method === "GET") {
        return {
          ok: true,
          json: async () => ({
            ...baseFeedback,
            remediationNotes: null,
            actions: [],
          }),
        } as Response;
      }

      throw new Error(`Unhandled request: ${method} ${url}`);
    });

    render(<FeedbackCard feedback={baseFeedback as any} highlighted={false} initiallyExpanded />);

    fireEvent.change(screen.getByPlaceholderText("Document context, fix details, and follow-up steps"), {
      target: { value: "saved note" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save notes" }));

    await screen.findByText("Notes saved.");
    expect(screen.getByDisplayValue("saved note")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/feedback/fb-1",
      expect.objectContaining({ method: "PATCH" }),
    );
  });

  it("updates the action list after adding an action", async () => {
    const fetchMock = vi.spyOn(global, "fetch").mockImplementation(async (input, init) => {
      const url = typeof input === "string" ? input : input.toString();
      const method = init?.method ?? "GET";

      if (url === "/api/feedback/fb-1" && method === "GET") {
        return {
          ok: true,
          json: async () => ({
            ...baseFeedback,
            actions: [
              {
                id: 1,
                feedbackId: "fb-1",
                actionType: "patch",
                actionRef: "local-test",
                description: "test action",
                status: "planned",
                createdAt: new Date().toISOString(),
                verifiedAt: null,
              },
            ],
          }),
        } as Response;
      }

      if (url === "/api/feedback/fb-1/actions" && method === "POST") {
        return {
          ok: true,
          json: async () => ({ ok: true }),
        } as Response;
      }

      throw new Error(`Unhandled request: ${method} ${url}`);
    });

    render(<FeedbackCard feedback={baseFeedback as any} highlighted={false} initiallyExpanded />);

    fireEvent.change(screen.getByPlaceholderText("Action ref (optional)"), {
      target: { value: "local-test" },
    });
    fireEvent.change(screen.getByPlaceholderText("Description (optional)"), {
      target: { value: "test action" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add action" }));

    await screen.findByText("Action added.");
    await waitFor(() => expect(screen.getByText("ref: local-test")).toBeInTheDocument());
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/feedback/fb-1/actions",
      expect.objectContaining({ method: "POST" }),
    );
  });
});
