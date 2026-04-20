import { describe, expect, it } from "vitest";
import { parseCodexDirectives } from "./codex-directives";

describe("parseCodexDirectives", () => {
  it("returns empty array for empty string", () => {
    expect(parseCodexDirectives("")).toEqual([]);
  });

  it("returns single text segment for input with no directives", () => {
    const input = "This is plain text";
    const result = parseCodexDirectives(input);
    expect(result).toEqual([{ kind: "text", text: input }]);
  });

  it("parses a single directive at the start of string", () => {
    const input = "::git-stage{cwd=\"/Users/hd\"}";
    const result = parseCodexDirectives(input);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      kind: "directive",
      directive: {
        name: "git-stage",
        attrs: { cwd: "/Users/hd" },
        raw: "::git-stage{cwd=\"/Users/hd\"}",
      },
    });
  });

  it("parses directive in the middle with text on both sides", () => {
    const input = "Start ::git-commit{msg=\"test\"} end";
    const result = parseCodexDirectives(input);
    expect(result).toHaveLength(3);
    expect(result[0]).toEqual({ kind: "text", text: "Start " });
    expect(result[1]).toEqual({
      kind: "directive",
      directive: {
        name: "git-commit",
        attrs: { msg: "test" },
        raw: "::git-commit{msg=\"test\"}",
      },
    });
    expect(result[2]).toEqual({ kind: "text", text: " end" });
  });

  it("parses multiple directives separated by whitespace", () => {
    const input =
      "::git-stage{cwd=\"/a\"} ::git-commit{cwd=\"/a\"} ::git-push{cwd=\"/a\"}";
    const result = parseCodexDirectives(input);
    expect(result).toHaveLength(5);
    expect(result[0].kind).toBe("directive");
    expect(result[1].kind).toBe("text");
    expect(result[2].kind).toBe("directive");
    expect(result[3].kind).toBe("text");
    expect(result[4].kind).toBe("directive");
  });

  it("parses attribute values with and without quotes", () => {
    const input = "::test{quoted=\"value\" bare=value}";
    const result = parseCodexDirectives(input);
    expect(result).toHaveLength(1);
    const directive = result[0];
    if (directive.kind === "directive") {
      expect(directive.directive.attrs).toEqual({
        quoted: "value",
        bare: "value",
      });
    }
  });

  it("preserves directive name hyphens like git-create-pr", () => {
    const input = "::git-create-pr{url=\"https://example.com\"}";
    const result = parseCodexDirectives(input);
    expect(result).toHaveLength(1);
    const directive = result[0];
    if (directive.kind === "directive") {
      expect(directive.directive.name).toBe("git-create-pr");
    }
  });

  it("treats malformed directive (missing }) as plain text", () => {
    const input = "::git-stage{cwd=\"/a\" rest of text";
    const result = parseCodexDirectives(input);
    expect(result).toEqual([{ kind: "text", text: input }]);
  });

  it("handles multiple attributes in a directive", () => {
    const input =
      "::git-create-pr{cwd=\"/a\" branch=\"feature\" url=\"https://example.com\" isDraft=false}";
    const result = parseCodexDirectives(input);
    expect(result).toHaveLength(1);
    const directive = result[0];
    if (directive.kind === "directive") {
      expect(directive.directive.attrs).toEqual({
        cwd: "/a",
        branch: "feature",
        url: "https://example.com",
        isDraft: "false",
      });
    }
  });

  it("handles real example from spec", () => {
    const input =
      '::git-stage{cwd="/Users/hd/Developer/cortana-external"} ::git-commit{cwd="/Users/hd/Developer/cortana-external"} ::git-push{cwd="/Users/hd/Developer/cortana-external" branch="codex/update-mission-control-readme"} ::git-create-pr{cwd="/Users/hd/Developer/cortana-external" branch="codex/update-mission-control-readme" url="https://github.com/cortana-foundry/cortana-external/pull/281" isDraft=false}';
    const result = parseCodexDirectives(input);
    expect(result.length).toBeGreaterThan(0);
    const directives = result.filter((s) => s.kind === "directive");
    expect(directives).toHaveLength(4);
  });
});
