import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

describe("notify approval routing", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
    delete process.env.TELEGRAM_BOT_TOKEN;
    delete process.env.TELEGRAM_CHAT_ID;
  });

  it("uses routing state and openclaw config defaults when env vars are absent", async () => {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "mission-control-notify-"));
    const openclawDir = path.join(tmpRoot, ".openclaw");
    const stateDir = path.join(openclawDir, "state");
    fs.mkdirSync(stateDir, { recursive: true });
    fs.writeFileSync(
      path.join(openclawDir, "openclaw.json"),
      JSON.stringify({
        channels: {
          telegram: {
            allowFrom: [8171372724],
            accounts: {
              default: {
                botToken: "config-token",
              },
            },
          },
        },
      }),
      "utf8",
    );
    fs.writeFileSync(
      path.join(stateDir, "system-routing.json"),
      JSON.stringify({
        telegram: {
          approvals: {
            accountId: "default",
            chatId: "8171372724",
          },
        },
      }),
      "utf8",
    );

    vi.spyOn(os, "homedir").mockReturnValue(tmpRoot);

    const fetchSpy = vi.fn(async () => ({
      ok: true,
      text: async () => "",
    }));
    vi.stubGlobal("fetch", fetchSpy as any);

    const { sendApprovalTelegramNotification } = await import("./notify");
    await sendApprovalTelegramNotification({
      approvalId: "apr-1",
      riskLevel: "p1",
      actionType: "high_risk_action",
      agentId: "cortana",
      rationale: "Need decision",
    });

    expect(fetchSpy).toHaveBeenCalledWith(
      "https://api.telegram.org/botconfig-token/sendMessage",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining("\"chat_id\":\"8171372724\""),
      }),
    );
  });
});
