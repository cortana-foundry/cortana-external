import { describe, expect, it } from "vitest";
import { getProjectColor } from "./project-color";

describe("getProjectColor", () => {
  it("returns a deterministic neutral for null/undefined/empty inputs", () => {
    const a = getProjectColor(null);
    const b = getProjectColor(undefined);
    const c = getProjectColor("");
    const d = getProjectColor("   ");
    expect(a).toEqual(b);
    expect(b).toEqual(c);
    expect(c).toEqual(d);
    expect(a.hue).toBe(0);
  });

  it("returns identical output for the same input across calls", () => {
    const x1 = getProjectColor("/Users/hd/Developer/cortana-external");
    const x2 = getProjectColor("/Users/hd/Developer/cortana-external");
    expect(x1).toEqual(x2);
  });

  it("produces multiple different hues across diverse inputs", () => {
    const samples = [
      "/Users/hd/Developer/cortana-external",
      "/Users/hd/Developer/mjolnir",
      "/Users/hd/Developer/tonal-ppl",
      "/tmp/repo-a",
      "/tmp/repo-b",
      "/tmp/repo-c",
      "/home/user/project-one",
      "/home/user/project-two",
      "/home/user/project-three",
      "/home/user/project-four",
      "/var/apps/alpha",
      "/var/apps/beta",
      "/var/apps/gamma",
      "/var/apps/delta",
      "/workspace/cortana",
      "/workspace/halo",
      "/workspace/reach",
      "/opt/code/one",
      "/opt/code/two",
      "/opt/code/three",
    ];
    const hues = new Set(samples.map((p) => getProjectColor(p).hue));
    expect(hues.size).toBeGreaterThan(10);
  });

  it("keeps all hues within [0, 330)", () => {
    for (let i = 0; i < 200; i += 1) {
      const hue = getProjectColor(`/fake/path/${i}`).hue;
      expect(hue).toBeGreaterThanOrEqual(0);
      expect(hue).toBeLessThan(330);
    }
  });

  it("returns valid OKLCH strings", () => {
    const color = getProjectColor("/some/path");
    expect(color.stripe).toMatch(/^oklch\(/);
    expect(color.tint).toMatch(/^oklch\(/);
    expect(color.ring).toMatch(/^oklch\(/);
  });

  it("is case-insensitive and trim-insensitive", () => {
    const a = getProjectColor("/SOME/PATH");
    const b = getProjectColor("  /some/path  ");
    expect(a).toEqual(b);
  });
});
