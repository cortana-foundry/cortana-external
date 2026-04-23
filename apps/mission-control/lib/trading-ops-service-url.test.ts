import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { resolveTradingOpsExternalServiceBaseUrl } from "@/lib/trading-ops-service-url";

describe("resolveTradingOpsExternalServiceBaseUrl", () => {
  const originalUrl = process.env.MISSION_CONTROL_EXTERNAL_SERVICE_URL;

  afterEach(() => {
    if (originalUrl == null) {
      delete process.env.MISSION_CONTROL_EXTERNAL_SERVICE_URL;
    } else {
      process.env.MISSION_CONTROL_EXTERNAL_SERVICE_URL = originalUrl;
    }
  });

  it("prefers explicit environment URLs", () => {
    process.env.MISSION_CONTROL_EXTERNAL_SERVICE_URL = " http://127.0.0.1:4040/ ";
    expect(resolveTradingOpsExternalServiceBaseUrl()).toBe("http://127.0.0.1:4040");
  });

  it("reads PORT from the repo env file", () => {
    delete process.env.MISSION_CONTROL_EXTERNAL_SERVICE_URL;
    const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), "trading-ops-url-"));
    fs.writeFileSync(path.join(repoRoot, ".env"), "PORT='5055'\n");

    expect(resolveTradingOpsExternalServiceBaseUrl({ repoRoot })).toBe("http://127.0.0.1:5055");

    fs.rmSync(repoRoot, { recursive: true, force: true });
  });
});
