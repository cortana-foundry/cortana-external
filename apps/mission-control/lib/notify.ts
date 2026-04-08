import fs from "node:fs";
import os from "node:os";
import path from "node:path";

type RiskLevel = "p0" | "p1" | "p2" | "p3";

type ApprovalTelegramNotificationInput = {
  approvalId: string;
  riskLevel: RiskLevel;
  actionType: string;
  agentId: string;
  rationale?: string | null;
};

const OPENCLAW_CONFIG_PATH = path.join(os.homedir(), ".openclaw", "openclaw.json");
const SYSTEM_ROUTING_PATH = path.join(os.homedir(), ".openclaw", "state", "system-routing.json");

type ApprovalTelegramRouting = {
  botToken: string | null;
  chatId: string | null;
};

const escapeHtml = (value: string): string =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

const getMissionControlBaseUrl = (): string =>
  process.env.MISSION_CONTROL_URL?.trim() || process.env.NEXT_PUBLIC_APP_URL?.trim() || "http://localhost:3000";

const readJson = (filePath: string): any | null => {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
};

const readApprovalTelegramRouting = (): ApprovalTelegramRouting => {
  const envToken = process.env.TELEGRAM_BOT_TOKEN?.trim() || null;
  const envChatId = process.env.TELEGRAM_CHAT_ID?.trim() || null;
  if (envToken && envChatId) {
    return { botToken: envToken, chatId: envChatId };
  }

  const cfg = readJson(OPENCLAW_CONFIG_PATH);
  const routing = readJson(SYSTEM_ROUTING_PATH);
  const accountId = String(routing?.telegram?.approvals?.accountId || "default");
  const botToken = envToken
    ?? cfg?.channels?.telegram?.accounts?.[accountId]?.botToken
    ?? cfg?.channels?.telegram?.accounts?.default?.botToken
    ?? null;
  const chatId = envChatId
    ?? (routing?.telegram?.approvals?.chatId !== undefined && routing?.telegram?.approvals?.chatId !== null
      ? String(routing.telegram.approvals.chatId)
      : null)
    ?? (Array.isArray(cfg?.channels?.telegram?.allowFrom) && cfg.channels.telegram.allowFrom[0] !== undefined
      ? String(cfg.channels.telegram.allowFrom[0])
      : null);
  return { botToken: botToken ? String(botToken) : null, chatId };
};

const getApprovalMessageText = (input: ApprovalTelegramNotificationInput): string => {
  const risk = input.riskLevel.toUpperCase();
  const rationale = input.rationale?.trim() ? input.rationale.trim() : "No rationale provided.";
  const approvalsUrl = `${getMissionControlBaseUrl().replace(/\/$/, "")}/approvals?id=${encodeURIComponent(input.approvalId)}`;

  return [
    `🔐 <b>Approval Required</b> [${escapeHtml(risk)}]`,
    "",
    `<b>Action:</b> ${escapeHtml(input.actionType)}`,
    `<b>Agent:</b> ${escapeHtml(input.agentId)}`,
    `<b>Rationale:</b> ${escapeHtml(rationale)}`,
    "",
    `<a href=\"${escapeHtml(approvalsUrl)}\">View in Mission Control</a>`,
  ].join("\n");
};

export async function sendApprovalTelegramNotification(input: ApprovalTelegramNotificationInput): Promise<void> {
  const routing = readApprovalTelegramRouting();
  if (!routing.botToken || !routing.chatId) {
    console.warn("[notify] Approval Telegram routing is not configured; skipping Telegram notification");
    return;
  }

  const endpoint = `https://api.telegram.org/bot${routing.botToken}/sendMessage`;

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      chat_id: routing.chatId,
      text: getApprovalMessageText(input),
      parse_mode: "HTML",
      disable_web_page_preview: true,
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`[notify] Telegram API failed (${response.status}): ${body}`);
  }
}
