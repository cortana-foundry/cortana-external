import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SessionHeader } from "./session-header";

describe("SessionHeader", () => {
  it("shows idle state when mutationPending is null", () => {
    render(<SessionHeader mutationPending={null} />);
    expect(screen.getByText(/idle and ready/i)).toBeInTheDocument();
  });

  it("shows starting state when mutationPending=create", () => {
    render(<SessionHeader mutationPending="create" />);
    expect(screen.getByText(/starting thread/i)).toBeInTheDocument();
  });

  it("shows streaming state when mutationPending=reply", () => {
    render(<SessionHeader mutationPending="reply" />);
    expect(screen.getByText(/streaming reply/i)).toBeInTheDocument();
  });

  it("renders the title", () => {
    render(<SessionHeader mutationPending={null} />);
    expect(screen.getByRole("heading", { name: "Sessions" })).toBeInTheDocument();
  });
});
