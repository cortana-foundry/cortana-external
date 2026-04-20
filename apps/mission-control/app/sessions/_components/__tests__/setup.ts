import { vi } from "vitest";

type MatchMediaRule = { query: string; matches: boolean };

/**
 * Install a deterministic `window.matchMedia` implementation that returns
 * `matches: true` for the provided queries (or any predicate match).
 */
export function mockMatchMedia(rules: MatchMediaRule[] | ((query: string) => boolean)) {
  const predicate =
    typeof rules === "function"
      ? rules
      : (query: string) => rules.some((rule) => rule.query === query && rule.matches);

  const matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: predicate(query),
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(() => false),
  }));

  Object.defineProperty(window, "matchMedia", {
    writable: true,
    configurable: true,
    value: matchMedia,
  });

  return matchMedia;
}
