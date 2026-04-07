import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET, PATCH } from "@/app/api/feedback/[id]/route";
import { getFeedbackById, updateFeedbackRemediation, updateFeedbackStatus } from "@/lib/feedback";

vi.mock("@/lib/feedback", () => ({
  FEEDBACK_WORKFLOW_STATUSES: ["new", "triaged", "in_progress", "verified", "wont_fix"],
  REMEDIATION_STATUSES: ["open", "in_progress", "resolved", "wont_fix"],
  getFeedbackById: vi.fn(),
  updateFeedbackStatus: vi.fn(),
  updateFeedbackRemediation: vi.fn(),
}));

describe("/api/feedback/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("GET returns single feedback with actions", async () => {
    vi.mocked(getFeedbackById).mockResolvedValueOnce({
      id: "fb-1",
      actions: [{ id: 1, actionType: "opened_pr" }],
    } as never);

    const response = await GET(new Request("http://localhost"), { params: Promise.resolve({ id: "fb-1" }) });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.id).toBe("fb-1");
    expect(body.actions).toHaveLength(1);
  });

  it("PATCH updates workflow status, remediation status, and notes", async () => {
    vi.mocked(updateFeedbackStatus).mockResolvedValueOnce(true);
    vi.mocked(updateFeedbackRemediation).mockResolvedValueOnce(true);
    vi.mocked(getFeedbackById).mockResolvedValueOnce({
      id: "fb-1",
      status: "verified",
      remediationStatus: "resolved",
    } as never);

    const request = new Request("http://localhost", {
      method: "PATCH",
      body: JSON.stringify({
        status: "verified",
        owner: "hamel",
        remediationStatus: "resolved",
        remediationNotes: "Fixed in #123",
        resolvedBy: "hamel",
      }),
    });

    const response = await PATCH(request, { params: Promise.resolve({ id: "fb-1" }) });
    const body = await response.json();

    expect(updateFeedbackStatus).toHaveBeenCalledWith("fb-1", "verified", "hamel");
    expect(updateFeedbackRemediation).toHaveBeenCalledWith("fb-1", "resolved", "Fixed in #123", "hamel");
    expect(response.status).toBe(200);
    expect(body).toEqual({ ok: true, item: { id: "fb-1", status: "verified", remediationStatus: "resolved" } });
  });

  it("PATCH validates remediation status", async () => {
    const request = new Request("http://localhost", {
      method: "PATCH",
      body: JSON.stringify({ remediationStatus: "bad_status" }),
    });

    const response = await PATCH(request, { params: Promise.resolve({ id: "fb-1" }) });
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("Invalid remediationStatus");
    expect(updateFeedbackRemediation).not.toHaveBeenCalled();
  });

  it("PATCH validates workflow status", async () => {
    const request = new Request("http://localhost", {
      method: "PATCH",
      body: JSON.stringify({ status: "bad_status" }),
    });

    const response = await PATCH(request, { params: Promise.resolve({ id: "fb-1" }) });
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("Invalid status");
    expect(updateFeedbackStatus).not.toHaveBeenCalled();
  });

  it("PATCH requires at least one update field", async () => {
    const request = new Request("http://localhost", {
      method: "PATCH",
      body: JSON.stringify({ remediationNotes: "notes only" }),
    });

    const response = await PATCH(request, { params: Promise.resolve({ id: "fb-1" }) });
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("status or remediationStatus is required");
  });

  it("PATCH returns 404 when feedback item does not exist", async () => {
    vi.mocked(updateFeedbackStatus).mockResolvedValueOnce(false);
    vi.mocked(updateFeedbackRemediation).mockResolvedValueOnce(false);

    const request = new Request("http://localhost", {
      method: "PATCH",
      body: JSON.stringify({ status: "in_progress", remediationStatus: "in_progress" }),
    });

    const response = await PATCH(request, { params: Promise.resolve({ id: "missing" }) });
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error).toBe("Feedback item not found");
  });
});
