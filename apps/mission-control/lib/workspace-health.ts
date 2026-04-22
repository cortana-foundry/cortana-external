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

export async function getAllHealthItems(baseUrl: string): Promise<WorkspaceHealthItem[]> {
  return Promise.all([
    getOpenClawHealth(),
    getExternalHealth(baseUrl),
    getMarketDataHealth(baseUrl),
    getWhoopHealth(baseUrl),
    getTonalHealth(baseUrl),
    getAlpacaHealth(baseUrl),
  ]);
}
