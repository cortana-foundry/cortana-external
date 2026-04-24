import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/feedback/[id]/actions/route";
import { addFeedbackAction } from "@/lib/feedback";

vi.mock("@/lib/feedback", () => ({
  addFeedbackAction: vi.fn(),
}));

const FEEDBACK_ID = "22222222-2222-4222-8222-222222222222";

describe("POST /api/feedback/[id]/actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects malformed feedback ids before writing", async () => {
    const request = new Request("http://localhost", {
      method: "POST",
      body: JSON.stringify({ actionType: "patch", status: "planned" }),
    });

    const response = await POST(request, { params: Promise.resolve({ id: "not-real" }) });
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("Invalid feedback id");
    expect(addFeedbackAction).not.toHaveBeenCalled();
  });

  it("adds a feedback action for valid ids", async () => {
    vi.mocked(addFeedbackAction).mockResolvedValueOnce();

    const request = new Request("http://localhost", {
      method: "POST",
      body: JSON.stringify({
        actionType: "patch",
        actionRef: "#123",
        description: "fixed",
        status: "verified",
      }),
    });

    const response = await POST(request, { params: Promise.resolve({ id: FEEDBACK_ID }) });
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body).toEqual({ ok: true });
    expect(addFeedbackAction).toHaveBeenCalledWith(FEEDBACK_ID, {
      actionType: "patch",
      actionRef: "#123",
      description: "fixed",
      status: "verified",
      verifiedAt: undefined,
    });
  });
});
