import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StatusStrip } from "./status-strip";

describe("StatusStrip", () => {
  it("renders workspace path, counts, and state", () => {
    render(
      <StatusStrip
        workspacePath="/tmp/workspace"
        threadCount={7}
        projectCount={2}
        previewCount={3}
        latestUpdatedAt={null}
        state="idle"
      />,
    );
    expect(screen.getByText("/tmp/workspace")).toBeInTheDocument();
    expect(screen.getByText(/7 threads/)).toBeInTheDocument();
    expect(screen.getByText(/2 projects/)).toBeInTheDocument();
    expect(screen.getByText(/3 with preview/)).toBeInTheDocument();
    expect(screen.getByText("idle")).toBeInTheDocument();
  });

  it("pluralizes singular counts", () => {
    render(
      <StatusStrip
        workspacePath="/x"
        threadCount={1}
        projectCount={1}
        previewCount={1}
        latestUpdatedAt={null}
        state="idle"
      />,
    );
    expect(screen.getByText(/^1 thread$/)).toBeInTheDocument();
    expect(screen.getByText(/^1 project$/)).toBeInTheDocument();
    expect(screen.getByText(/^1 with preview$/)).toBeInTheDocument();
  });
});
