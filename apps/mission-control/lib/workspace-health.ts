import { execSync } from "node:child_process";

export type WorkspaceHealthTone = "healthy" | "degraded" | "unhealthy" | "unknown";

export type WorkspaceHealthItem = {
  id: string;
  label: string;
  tone: WorkspaceHealthTone;
  summary: string;
  detail: string;
  checkedAt: string;
  raw: unknown;
};

async function fetchJson(
  url: string,
  timeoutMs = 4_000,
): Promise<{ ok: boolean; status: number; body: unknown; error?: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      cache: "no-store",
      signal: controller.signal,
    });

    const text = await response.text();
    const body = text.length > 0 ? tryParseJson(text) : null;

    return {
      ok: response.ok,
      status: response.status,
      body: body ?? text,
      error: response.ok ? undefined : `HTTP ${response.status}`,
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      body: null,
      error: error instanceof Error ? error.message : "Request failed",
    };
  } finally {
    clearTimeout(timeout);
  }
}

function tryParseJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function toneFromOpenClawOutput(output: string): WorkspaceHealthTone {
  const normalized = output.toLowerCase();
  if (normalized.includes("running") || normalized.includes("active") || normalized.includes("started")) {
    return "healthy";
  }
  if (normalized.includes("stopped") || normalized.includes("inactive")) {
    return "unhealthy";
  }
  return "degraded";
}

function toneFromExternalStatus(status: unknown): WorkspaceHealthTone {
  if (status === "healthy" || status === "ok") return "healthy";
  if (status === "degraded") return "degraded";
  if (status === "unhealthy" || status === "error") return "unhealthy";
  return "unknown";
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function readBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function readObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function readAuthAlert(value: unknown): Record<string, unknown> {
  return readObject(readObject(value).auth_alert);
}

function hasActiveAuthAlert(value: unknown): boolean {
  return readAuthAlert(value).active === true;
}

function providerTone(status: unknown, body: Record<string, unknown>): WorkspaceHealthTone {
  if (hasActiveAuthAlert(body)) {
    return "unhealthy";
  }
  return toneFromExternalStatus(status);
}

function providerDetail(body: Record<string, unknown>, fallback: string): string {
  return readString(body.details)
    ?? readString(readAuthAlert(body).last_error)
    ?? readString(body.error)
    ?? fallback;
}

function humanizeStatus(value: string | null | undefined): string {
  if (!value) return "Unknown";
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function toneFromSchwabOperatorState(state: string | null | undefined): WorkspaceHealthTone {
  if (!state || state === "unknown") return "degraded";
  if (state === "healthy") return "healthy";
  if (state === "human_action_required") return "unhealthy";
  return "degraded";
}

function listFailingProviders(body: Record<string, unknown>): string[] {
  const providers: Array<[string, string]> = [
    ["whoop", "Whoop"],
    ["tonal", "Tonal"],
    ["alpaca", "Alpaca"],
    ["appleHealth", "Apple Health"],
    ["marketData", "Market data"],
    ["polymarket", "Polymarket"],
  ];

  return providers.flatMap(([key, label]) => {
    const entry = readObject(body[key]);
    if (Object.keys(entry).length === 0) return [];
    if (hasActiveAuthAlert(entry)) return [`${label} (auth alert)`];

    const status = String(entry.status ?? "unknown");
    if (status === "healthy" || status === "ok" || status === "unconfigured") {
      return [];
    }
    return [`${label} (${status})`];
  });
}

function buildUnknownHealth(id: string, label: string, detail: string, raw: unknown): WorkspaceHealthItem {
  return {
    id,
    label,
    tone: "unknown",
    summary: "Unavailable",
    detail,
    checkedAt: new Date().toISOString(),
    raw,
  };
}

export async function getOpenClawHealth(): Promise<WorkspaceHealthItem> {
  try {
    const output = execSync("openclaw gateway status", {
      encoding: "utf8",
      timeout: 4_000,
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();

    return {
      id: "openclaw-gateway",
      label: "OpenClaw gateway",
      tone: toneFromOpenClawOutput(output),
      summary: output.split("\n")[0] || "Gateway responded",
      detail: "CLI heartbeat from `openclaw gateway status`.",
      checkedAt: new Date().toISOString(),
      raw: output,
    };
  } catch (error) {
    return buildUnknownHealth(
      "openclaw-gateway",
      "OpenClaw gateway",
      error instanceof Error ? error.message : "OpenClaw CLI unavailable",
      null,
    );
  }
}

export async function getExternalHealth(baseUrl: string): Promise<WorkspaceHealthItem> {
  const result = await fetchJson(`${baseUrl}/health`);
  const body = readObject(result.body);
  const status = String(body.status ?? (result.ok ? "ok" : "unknown"));

  if (!result.ok && result.status === 0) {
    return buildUnknownHealth("external-service", "External service", result.error ?? "Request failed", result.body);
  }

  return {
    id: "external-service",
    label: "External service",
    tone: toneFromExternalStatus(status),
    summary: status,
    detail: result.ok
      ? (() => {
          const failingProviders = listFailingProviders(body);
          return failingProviders.length > 0
            ? `Failing providers: ${failingProviders.join(", ")}.`
            : "Aggregate health across Whoop, Tonal, Alpaca, and market data.";
        })()
      : result.error ?? "Health endpoint returned an error.",
    checkedAt: new Date().toISOString(),
    raw: body,
  };
}

export async function getWhoopHealth(baseUrl: string): Promise<WorkspaceHealthItem> {
  const [healthResult, authResult] = await Promise.all([
    fetchJson(`${baseUrl}/whoop/health`),
    fetchJson(`${baseUrl}/auth/status`),
  ]);

  if (!healthResult.ok && healthResult.status === 0 && !authResult.ok && authResult.status === 0) {
    return buildUnknownHealth("whoop", "Whoop", healthResult.error ?? "Request failed", null);
  }

  const healthBody = readObject(healthResult.body);
  const authBody = readObject(authResult.body);
  const authenticated = Boolean(
    healthBody.authenticated ??
      authBody.has_token ??
      authBody.refresh_token_present,
  );
  const tone = authenticated
    ? providerTone(healthBody.status ?? "unknown", healthBody)
    : healthResult.ok || authResult.ok
      ? "degraded"
      : "unknown";
  const authAlertActive = hasActiveAuthAlert(healthBody) || hasActiveAuthAlert(authBody);

  return {
    id: "whoop",
    label: "Whoop",
    tone,
    summary: tone === "healthy"
      ? "Authenticated"
      : authAlertActive
        ? "Auth alert active"
        : authenticated
          ? "Authentication failed"
          : "Needs OAuth",
    detail: providerDetail(
      healthBody,
      readString(authBody.error) ?? "Recovery and sleep ingestion via the local Whoop integration.",
    ),
    checkedAt: new Date().toISOString(),
    raw: {
      health: healthBody,
      auth: authBody,
    },
  };
}

export async function getTonalHealth(baseUrl: string): Promise<WorkspaceHealthItem> {
  const result = await fetchJson(`${baseUrl}/tonal/health`);
  const body = readObject(result.body);
  const status = String(body.status ?? (result.ok ? "ok" : "unknown"));
  const tone = providerTone(status, body);
  const authAlertActive = hasActiveAuthAlert(body);

  return {
    id: "tonal",
    label: "Tonal",
    tone,
    summary: tone === "healthy" ? "Authenticated" : authAlertActive ? "Auth alert active" : status,
    detail: providerDetail(body, "Tonal profile and strength-score ingestion."),
    checkedAt: new Date().toISOString(),
    raw: body,
  };
}

export async function getMarketDataHealth(baseUrl: string): Promise<WorkspaceHealthItem> {
  const [readyResult, authResult, opsResult] = await Promise.all([
    fetchJson(`${baseUrl}/market-data/ready`),
    fetchJson(`${baseUrl}/auth/schwab/status`),
    fetchJson(`${baseUrl}/market-data/ops`),
  ]);

  if (!readyResult.ok && readyResult.status === 0 && !authResult.ok && authResult.status === 0) {
    return buildUnknownHealth("market-data", "Market data", readyResult.error ?? "Request failed", null);
  }

  const readyBody = readObject(readyResult.body);
  const authWrapper = readObject(authResult.body);
  const authData = readObject(authWrapper.data);
  const opsWrapper = readObject(opsResult.body);
  const opsData = readObject(opsWrapper.data);
  const ready = Boolean(readObject(readyBody.data).ready ?? false);
  const readyData = readObject(readyBody.data);
  const operatorState =
    typeof readyData.operatorState === "string"
      ? readyData.operatorState
      : authData.pendingStateIssuedAt
        ? "pending"
        : "unknown";
  const refreshTokenPresent = Boolean(authData.refreshTokenPresent);

  return {
    id: "market-data",
    label: "Market data",
    tone: ready ? "healthy" : refreshTokenPresent ? "degraded" : "unhealthy",
    summary: ready ? "Ready" : operatorState,
    detail: ready
      ? "Market data service is ready for quotes, history, and universe refresh."
      : String(readObject(readyBody.data).operatorAction ?? "Inspect Schwab auth and provider state."),
    checkedAt: new Date().toISOString(),
    raw: {
      ready: readyBody,
      schwabAuth: authWrapper,
      ops: opsData,
    },
  };
}

export async function getSchwabHealth(baseUrl: string): Promise<WorkspaceHealthItem> {
  const [authResult, readyResult, opsResult] = await Promise.all([
    fetchJson(`${baseUrl}/auth/schwab/status`),
    fetchJson(`${baseUrl}/market-data/ready`),
    fetchJson(`${baseUrl}/market-data/ops`),
  ]);

  if (!authResult.ok && authResult.status === 0 && !readyResult.ok && readyResult.status === 0) {
    return buildUnknownHealth("schwab-rest", "Schwab REST", authResult.error ?? "Request failed", null);
  }

  const authWrapper = readObject(authResult.body);
  const authData = readObject(authWrapper.data);
  const readyBody = readObject(readyResult.body);
  const readyData = readObject(readyBody.data);
  const opsWrapper = readObject(opsResult.body);
  const opsData = readObject(opsWrapper.data);
  const providerMetrics = readObject(opsData.providerMetrics);

  const clientConfigured = readBoolean(authData.clientConfigured) === true;
  const refreshTokenPresent = readBoolean(authData.refreshTokenPresent) === true;
  const pendingStateIssuedAt = readString(authData.pendingStateIssuedAt);
  const ready = readBoolean(readyData.ready) === true;
  const tokenStatus = readString(providerMetrics.schwabTokenStatus);
  const tokenReason = readString(providerMetrics.schwabTokenReason);
  const operatorState =
    readString(opsData.serviceOperatorState)
    ?? readString(readyData.operatorState)
    ?? (pendingStateIssuedAt ? "pending" : "unknown");
  const operatorAction =
    readString(opsData.serviceOperatorAction)
    ?? readString(readyData.operatorAction)
    ?? tokenReason;

  let tone: WorkspaceHealthTone;
  let summary: string;

  if (!clientConfigured) {
    tone = "degraded";
    summary = "Not configured";
  } else if (pendingStateIssuedAt) {
    tone = "degraded";
    summary = "Pending OAuth";
  } else if (tokenStatus === "human_action_required") {
    tone = "unhealthy";
    summary = "Re-auth required";
  } else if (ready) {
    tone = "healthy";
    summary = "Authenticated";
  } else if (refreshTokenPresent) {
    tone = toneFromSchwabOperatorState(operatorState);
    summary = humanizeStatus(operatorState);
  } else {
    tone = "unhealthy";
    summary = "Needs OAuth";
  }

  return {
    id: "schwab-rest",
    label: "Schwab REST",
    tone,
    summary,
    detail:
      tokenReason
      ?? operatorAction
      ?? "Primary Schwab REST auth and quote/history readiness.",
    checkedAt: new Date().toISOString(),
    raw: {
      auth: authWrapper,
      ready: readyBody,
      ops: opsData,
    },
  };
}

export async function getSchwabStreamerHealth(baseUrl: string): Promise<WorkspaceHealthItem> {
  const [authResult, opsResult] = await Promise.all([
    fetchJson(`${baseUrl}/auth/schwab/streamer/status`),
    fetchJson(`${baseUrl}/market-data/ops`),
  ]);

  if (!authResult.ok && authResult.status === 0 && !opsResult.ok && opsResult.status === 0) {
    return buildUnknownHealth("schwab-streamer", "Schwab Streamer", authResult.error ?? "Request failed", null);
  }

  const authWrapper = readObject(authResult.body);
  const authData = readObject(authWrapper.data);
  const opsWrapper = readObject(opsResult.body);
  const opsData = readObject(opsWrapper.data);
  const healthProviders = readObject(readObject(opsData.health).providers);
  const streamerMeta = readObject(healthProviders.schwabStreamerMeta);

  const clientConfigured = readBoolean(authData.clientConfigured) === true;
  const refreshTokenPresent = readBoolean(authData.refreshTokenPresent) === true;
  const pendingStateIssuedAt = readString(authData.pendingStateIssuedAt);
  const connected = readBoolean(streamerMeta.connected) === true;
  const operatorState = readString(streamerMeta.operatorState) ?? (pendingStateIssuedAt ? "pending" : "unknown");
  const operatorAction = readString(streamerMeta.operatorAction);

  let tone: WorkspaceHealthTone;
  let summary: string;

  if (!clientConfigured) {
    tone = "degraded";
    summary = "Not configured";
  } else if (pendingStateIssuedAt) {
    tone = "degraded";
    summary = "Pending OAuth";
  } else if (!refreshTokenPresent) {
    tone = "unhealthy";
    summary = "Needs OAuth";
  } else if (operatorState === "human_action_required") {
    tone = "unhealthy";
    summary = "Re-auth required";
  } else if (connected && operatorState === "healthy") {
    tone = "healthy";
    summary = "Connected";
  } else if (operatorState === "healthy") {
    tone = "healthy";
    summary = "Authenticated";
  } else {
    tone = toneFromSchwabOperatorState(operatorState);
    summary = humanizeStatus(operatorState);
  }

  return {
    id: "schwab-streamer",
    label: "Schwab Streamer",
    tone,
    summary,
    detail:
      operatorAction
      ?? "Shared Schwab streamer auth and live-session readiness.",
    checkedAt: new Date().toISOString(),
    raw: {
      auth: authWrapper,
      ops: opsData,
    },
  };
}

export async function getAlpacaHealth(baseUrl: string): Promise<WorkspaceHealthItem> {
  const result = await fetchJson(`${baseUrl}/alpaca/health`);
  const body = readObject(result.body);
  const status = String(body.status ?? (result.ok ? "healthy" : "unknown"));

  return {
    id: "alpaca",
    label: "Alpaca",
    tone: toneFromExternalStatus(status),
    summary:
      status === "healthy"
        ? `${String(body.environment ?? "connected")} · ${String(body.target_environment ?? "target unset")}`
        : status,
    detail:
      typeof body.error === "string"
        ? body.error
        : "Execution-side broker health and account reachability.",
    checkedAt: new Date().toISOString(),
    raw: body,
  };
}

export async function getPolymarketHealth(baseUrl: string): Promise<WorkspaceHealthItem> {
  const result = await fetchJson(`${baseUrl}/polymarket/health`);
  const body = readObject(result.body);
  const status = String(body.status ?? (result.ok ? "unknown" : "unknown"));
  const tone = status === "unconfigured" ? "degraded" : toneFromExternalStatus(status);

  return {
    id: "polymarket",
    label: "Polymarket",
    tone,
    summary:
      status === "healthy"
        ? "Authenticated"
        : status === "unconfigured"
          ? "Not configured"
          : humanizeStatus(status),
    detail:
      readString(body.error)
      ?? "Key-backed Polymarket account reachability and live-trading health.",
    checkedAt: new Date().toISOString(),
    raw: body,
  };
}

export async function getAllHealthItems(baseUrl: string): Promise<WorkspaceHealthItem[]> {
  return Promise.all([
    getOpenClawHealth(),
    getExternalHealth(baseUrl),
    getMarketDataHealth(baseUrl),
    getSchwabHealth(baseUrl),
    getSchwabStreamerHealth(baseUrl),
    getWhoopHealth(baseUrl),
    getTonalHealth(baseUrl),
    getAlpacaHealth(baseUrl),
    getPolymarketHealth(baseUrl),
  ]);
}
