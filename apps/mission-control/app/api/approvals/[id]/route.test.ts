import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET, PATCH } from "@/app/api/approvals/[id]/route";
import { getApprovalById, updateApprovalStatus } from "@/lib/approvals";

vi.mock("@/lib/approvals", () => ({
  getApprovalById: vi.fn(),
  updateApprovalStatus: vi.fn(),
}));

describe("/api/approvals/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("GET rejects malformed approval ids before querying", async () => {
    const response = await GET(new Request("http://localhost"), { params: Promise.resolve({ id: "not-real" }) });
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("Invalid approval id");
    expect(getApprovalById).not.toHaveBeenCalled();
  });

  it("PATCH rejects malformed approval ids before querying", async () => {
    const request = new Request("http://localhost", {
      method: "PATCH",
      body: JSON.stringify({ action: "approve" }),
    });

    const response = await PATCH(request, { params: Promise.resolve({ id: "not-real" }) });
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("Invalid approval id");
    expect(getApprovalById).not.toHaveBeenCalled();
    expect(updateApprovalStatus).not.toHaveBeenCalled();
  });

  it("GET returns single approval with events", async () => {
    vi.mocked(getApprovalById).mockResolvedValueOnce({
      id: "11111111-1111-4111-8111-111111111111",
      status: "pending",
      events: [{ id: 1, eventType: "created" }],
    } as never);

    const response = await GET(new Request("http://localhost"), { params: Promise.resolve({ id: "11111111-1111-4111-8111-111111111111" }) });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.id).toBe("11111111-1111-4111-8111-111111111111");
    expect(body.events).toHaveLength(1);
  });

  it("PATCH approve flow updates status and returns updated record", async () => {
    vi.mocked(updateApprovalStatus).mockResolvedValueOnce();
    vi.mocked(getApprovalById)
      .mockResolvedValueOnce({ id: "11111111-1111-4111-8111-111111111111", status: "pending" } as never)
      .mockResolvedValueOnce({ id: "11111111-1111-4111-8111-111111111111", status: "approved" } as never);

    const request = new Request("http://localhost", {
      method: "PATCH",
      body: JSON.stringify({ action: "approve", decision: { note: "ship" }, actor: "hamel" }),
    });

    const response = await PATCH(request, { params: Promise.resolve({ id: "11111111-1111-4111-8111-111111111111" }) });
    const body = await response.json();

    expect(updateApprovalStatus).toHaveBeenCalledWith("11111111-1111-4111-8111-111111111111", "approve", { note: "ship" }, "hamel");
    expect(response.status).toBe(200);
    expect(body).toEqual({ ok: true, approval: { id: "11111111-1111-4111-8111-111111111111", status: "approved" } });
  });

  it("PATCH reject flow updates status with reason", async () => {
    vi.mocked(updateApprovalStatus).mockResolvedValueOnce();
    vi.mocked(getApprovalById)
      .mockResolvedValueOnce({ id: "11111111-1111-4111-8111-111111111111", status: "pending" } as never)
      .mockResolvedValueOnce({ id: "11111111-1111-4111-8111-111111111111", status: "rejected" } as never);

    const request = new Request("http://localhost", {
      method: "PATCH",
      body: JSON.stringify({ action: "reject", decision: { reason: "unsafe" }, actor: "reviewer" }),
    });

    const response = await PATCH(request, { params: Promise.resolve({ id: "11111111-1111-4111-8111-111111111111" }) });
    const body = await response.json();

    expect(updateApprovalStatus).toHaveBeenCalledWith("11111111-1111-4111-8111-111111111111", "reject", { reason: "unsafe" }, "reviewer");
    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.approval.status).toBe("rejected");
  });
});
