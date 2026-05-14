import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { QuickActionsPills } from "@/components/quick-actions-pills";

const jsonResponse = (payload: unknown, status = 200) =>
  ({ ok: status >= 200 && status < 300, status, json: async () => payload }) as Response;

describe("QuickActionsPills", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("POSTs to the right action endpoint and renders the result panel", async () => {
    const fetchSpy = vi
      .spyOn(global, "fetch")
      .mockResolvedValue(
        jsonResponse({
          ok: true,
          checks: [{ name: "db", passed: true, details: "all good" }],
          message: "Chaos passed",
        }),
      );

    render(<QuickActionsPills />);

    fireEvent.click(screen.getByRole("button", { name: /chaos/i }));

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith(
        "/api/actions/chaos-test",
        expect.objectContaining({ method: "POST" }),
      );
    });

    // Result panel renders the chaos-test check row.
    expect(await screen.findByText(/PASS · db/)).toBeInTheDocument();
    expect(screen.getByText(/Chaos result/i)).toBeInTheDocument();

    // X dismisses the result.
    fireEvent.click(screen.getByLabelText("Dismiss action result"));
    expect(screen.queryByText(/Chaos result/i)).toBeNull();
  });

  it("surfaces error state when the action endpoint fails", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      jsonResponse({ ok: false, message: "boom" }, 500),
    );

    render(<QuickActionsPills />);

    fireEvent.click(screen.getByRole("button", { name: /budget/i }));

    expect(await screen.findByText(/✕ boom/)).toBeInTheDocument();
  });
});
