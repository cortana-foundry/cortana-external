// @vitest-environment node

import React from "react";
import { renderToString } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockReplace = vi.fn();
const mockSearchParamsGet = vi.fn<(key: string) => string | null>();
const mockSearchParamsToString = vi.fn(() => "");

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mockReplace }),
  useSearchParams: () => ({
    get: mockSearchParamsGet,
    toString: mockSearchParamsToString,
  }),
}));

vi.mock("./services-client", () => ({
  default: () => <div>Mock services workspace</div>,
}));

vi.mock("@/app/cron/cron-client", () => ({
  CronClient: () => <div>Mock cron workspace</div>,
}));

describe("ServicesHub", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockReplace.mockReset();
    mockSearchParamsGet.mockReset();
    mockSearchParamsToString.mockReset();
    mockSearchParamsToString.mockReturnValue("");
  });

  it("renders the config tab behind a suspense fallback", async () => {
    mockSearchParamsGet.mockImplementation((key: string) => (key === "tab" ? "config" : null));

    const { default: ServicesHub } = await import("./services-hub");
    const markup = renderToString(<ServicesHub />);

    expect(markup).toContain("animate-pulse");
  });

  it("renders the cron tab behind a suspense fallback", async () => {
    mockSearchParamsGet.mockImplementation((key: string) => (key === "tab" ? "cron" : null));

    const { default: ServicesHub } = await import("./services-hub");
    const markup = renderToString(<ServicesHub />);

    expect(markup).toContain("animate-pulse");
    expect(markup).toContain("Cron Jobs");
  });
});
