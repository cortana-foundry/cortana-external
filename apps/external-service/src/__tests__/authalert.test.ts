import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { markFailure, markSuccess, readAuthAlert, resetAuthAlertsForTests } from "../lib/authalert.js";

describe("auth alert lifecycle", () => {
  const originalHome = process.env.HOME;
  const homes: string[] = [];

  afterEach(async () => {
    process.env.HOME = originalHome;
    resetAuthAlertsForTests();
    await Promise.all(
      homes.splice(0).map(async (home) => {
        await fs.rm(home, { recursive: true, force: true });
      }),
    );
  });

  it("writes thresholded auth alerts and clears them on recovery", async () => {
    const tempHome = await fs.mkdtemp(path.join(os.tmpdir(), "auth-alert-home-"));
    homes.push(tempHome);
    process.env.HOME = tempHome;

    await markFailure("provider-test", new Error("bad token"));
    await markFailure("provider-test", new Error("bad token"));

    expect(await readAuthAlert("provider-test")).toEqual({
      active: false,
      consecutive_failures: 0,
      last_error: null,
      updated_at: null,
    });

    await markFailure("provider-test", new Error("bad token"));

    expect(await readAuthAlert("provider-test")).toMatchObject({
      active: true,
      consecutive_failures: 3,
      last_error: "bad token",
    });

    await markSuccess("provider-test");

    expect(await readAuthAlert("provider-test")).toEqual({
      active: false,
      consecutive_failures: 0,
      last_error: null,
      updated_at: null,
    });
  });
});
