import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MetadataAccordion } from "./metadata-accordion";

describe("MetadataAccordion", () => {
  const baseProps = {
    cwd: "/tmp/one",
    sessionId: "session-abc",
    transcriptPath: "/tmp/one.jsonl",
    cliVersion: "0.121.0",
    model: "gpt-5.4",
    updatedAt: 1_700_000_000_000,
  };

  it("marks the region aria-hidden when collapsed", () => {
    const { container } = render(<MetadataAccordion open={false} {...baseProps} />);
    const root = container.querySelector("#session-metadata-accordion") as HTMLElement;
    expect(root).toHaveAttribute("aria-hidden", "true");
    expect(root.className).toMatch(/pointer-events-none/);
  });

  it("renders all pills when open", () => {
    render(<MetadataAccordion open {...baseProps} />);
    expect(screen.getByText("Cwd")).toBeInTheDocument();
    expect(screen.getByText("/tmp/one")).toBeInTheDocument();
    expect(screen.getByText("Session id")).toBeInTheDocument();
    expect(screen.getByText("session-abc")).toBeInTheDocument();
    expect(screen.getByText("Transcript path")).toBeInTheDocument();
    expect(screen.getByText("/tmp/one.jsonl")).toBeInTheDocument();
    expect(screen.getByText("CLI version")).toBeInTheDocument();
    expect(screen.getByText("0.121.0")).toBeInTheDocument();
    expect(screen.getByText("Model")).toBeInTheDocument();
    expect(screen.getByText("gpt-5.4")).toBeInTheDocument();
    expect(screen.getByText("Updated")).toBeInTheDocument();
  });

  it("shows Unavailable for missing values", () => {
    render(
      <MetadataAccordion
        open
        cwd={null}
        sessionId={null}
        transcriptPath={null}
        cliVersion={null}
        model={null}
        updatedAt={null}
      />,
    );
    expect(screen.getAllByText("Unavailable").length).toBe(6);
  });
});
