import { describe, expect, it } from "vitest";

import { parseUniverseSourceLadder } from "../market-data/universe-utils.js";

describe("universe source ladder parsing", () => {
  it("drops deprecated python_seed entries and keeps supported sources", () => {
    expect(parseUniverseSourceLadder("python_seed, remote_json, local_json")).toEqual([
      "remote_json",
      "local_json",
    ]);
  });

  it("defaults to local_json when no supported sources remain", () => {
    expect(parseUniverseSourceLadder("python_seed")).toEqual(["local_json"]);
    expect(parseUniverseSourceLadder("")).toEqual(["local_json"]);
  });
});
