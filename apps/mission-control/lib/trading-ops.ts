import type {
  AlertDeliveryOverview,
  ArtifactState,
  BenchmarkOverview,
  CanaryOverview,
  ControlTowerOverview,
  FinancialServiceHealthRow,
  FinancialServicesHealthOverview,
  LifecycleOverview,
  LoadState,
  MarketOverview,
  OperatorVerdictOverview,
  OpsHighwayOverview,
  PredictionOverview,
  RuntimeOverview,
  ScheduleRegistryOverview,
  TradingOpsDashboardData,
  TradingRunOverview,
  WorkflowOverview,
} from "@/lib/trading-ops-contract";
import { formatOperatorTimestamp, formatRelativeAge } from "@/lib/format-utils";
import { getCortanaSourceRepo, getRepoRoot } from "@/lib/runtime-paths";
import { findWorkspaceRoot } from "@/lib/service-workspace";
import { resolveTradingOpsExternalServiceBaseUrl } from "@/lib/trading-ops-service-url";

const DEFAULT_REQUEST_TIMEOUT_MS = 4_000;

export type {
  AlertDeliveryOverview,
  ArtifactState,
  BenchmarkOverview,
  CanaryOverview,
  ControlTowerOverview,
  FinancialServiceHealthRow,
  FinancialServicesHealthOverview,
  LifecycleOverview,
  LoadState,
  MarketOverview,
  OperatorVerdictOverview,
  OpsHighwayOverview,
  PredictionOverview,
  RuntimeOverview,
  ScheduleRegistryOverview,
  TradingOpsDashboardData,
  TradingRunOverview,
  WorkflowOverview,
} from "@/lib/trading-ops-contract";

type LoaderOptions = {
  cortanaRepoPath?: string;
  externalServiceBaseUrl?: string;
  fetchImpl?: typeof fetch;
};

type FetchJsonResult = {
  ok: boolean;
  status: number;
  body: unknown;
  error: string | null;
};

export async function loadTradingOpsDashboardData(
  options: LoaderOptions = {},
): Promise<TradingOpsDashboardData> {
  const externalServiceBaseUrl = options.externalServiceBaseUrl ?? resolveTradingOpsExternalServiceBaseUrl({ findWorkspaceRoot });
  const fetchImpl = options.fetchImpl ?? fetch;

  return {
    generatedAt: new Date().toISOString(),
    repoPath: getRepoRoot(),
    cortanaRepoPath: options.cortanaRepoPath ?? getCortanaSourceRepo(),
    market: legacyRetiredArtifact<MarketOverview>("Legacy market posture retired", "Market posture from the old backtester is retired. Use Market Lab for symbol-level reviews."),
    runtime: legacyRetiredArtifact<RuntimeOverview>("Legacy runtime retired", "Old backtester runtime snapshots are retired. Live streamer health remains available below."),
    canary: legacyRetiredArtifact<CanaryOverview>("Legacy pre-open gate retired", "Old backtester pre-open readiness artifacts are retired."),
    operatorVerdict: legacyRetiredArtifact<OperatorVerdictOverview>("Legacy verdict retired", "Old backtester operator verdict artifacts are retired."),
    prediction: legacyRetiredArtifact<PredictionOverview>("Legacy prediction loop retired", "Old backtester prediction accuracy artifacts are retired. Market Lab settlement will replace this path."),
    benchmark: legacyRetiredArtifact<BenchmarkOverview>("Legacy benchmark retired", "Old backtester benchmark artifacts are retired."),
    lifecycle: legacyRetiredArtifact<LifecycleOverview>("Legacy lifecycle retired", "Old backtester lifecycle artifacts are retired."),
    controlTower: legacyRetiredArtifact<ControlTowerOverview>("Legacy control tower retired", "Old backtester control-loop artifacts are retired."),
    workflow: legacyRetiredArtifact<WorkflowOverview>("Legacy workflow retired", "Old backtester workflow artifacts are retired."),
    opsHighway: legacyRetiredArtifact<OpsHighwayOverview>("Legacy ops highway retired", "Old backtester ops highway artifacts are retired."),
    financialServices: await loadFinancialServicesOverview(externalServiceBaseUrl, fetchImpl),
    alertDelivery: legacyRetiredArtifact<AlertDeliveryOverview>("Legacy alert receipts retired", "Old backtester alert delivery artifacts are retired."),
    scheduleRegistry: legacyRetiredArtifact<ScheduleRegistryOverview>("Legacy schedule registry retired", "Old backtester schedule artifacts are retired."),
    tradingRun: legacyRetiredArtifact<TradingRunOverview>("Legacy trading run retired", "Old backtester trading-run artifacts are retired. Use Market Lab for new trust reviews."),
  };
}

export function summarizeStateVariant(state: LoadState): "success" | "warning" | "destructive" | "outline" {
  if (state === "ok") return "success";
  if (state === "degraded") return "warning";
  if (state === "error") return "destructive";
  return "outline";
}

export {
  formatRelativeAge,
  formatPercentDecimal as formatPercent,
  formatCurrency as formatMoney,
  formatOperatorTimestamp,
} from "@/lib/format-utils";

function legacyRetiredArtifact<T>(label: string, message: string): ArtifactState<T> {
  return {
    state: "missing",
    label,
    message,
    data: null,
    source: "legacy backtester retired",
    warnings: [],
    badgeText: "retired",
  };
}

async function loadFinancialServicesOverview(
  baseUrl: string,
  fetchImpl: typeof fetch,
): Promise<ArtifactState<FinancialServicesHealthOverview>> {
  const checkedAt = new Date().toISOString();
  const [opsResult, polymarketHealthResult, polymarketLiveResult] = await Promise.all([
    fetchJson(`${baseUrl}/market-data/ops`, fetchImpl),
    fetchJson(`${baseUrl}/polymarket/health`, fetchImpl),
    fetchJson(`${baseUrl}/polymarket/live`, fetchImpl),
  ]);

  const opsBody = asRecord(opsResult.body);
  const opsData = asRecord(opsBody?.data);
  const opsHealth = asRecord(opsData?.health);
  const providers = asRecord(opsHealth?.providers);
  const providerMetrics = asRecord(opsData?.providerMetrics);
  const streamerMeta = asRecord(providers?.schwabStreamerMeta);
  const polymarketHealth = asRecord(polymarketHealthResult.body);
  const polymarketLive = asRecord(polymarketLiveResult.body);
  const polymarketStreamer = asRecord(polymarketLive?.streamer);

  const rows = [
    configuredRow("CoinMarketCap", "/market-data/ops", stringValue(providers?.coinmarketcap), ["configured"], "configured"),
    schwabRestRow(providerMetrics, providers, opsResult),
    schwabStreamerRow(streamerMeta, providers, opsResult),
    polymarketRestRow(polymarketHealthResult, polymarketHealth),
    polymarketStreamerRow(polymarketLiveResult, polymarketLive, polymarketStreamer),
  ];

  const healthyCount = rows.filter((row) => row.state === "ok").length;
  const degradedCount = rows.filter((row) => row.state === "degraded").length;
  const errorCount = rows.filter((row) => row.state === "error").length;

  return {
    state: errorCount > 0 ? "error" : degradedCount > 0 ? "degraded" : "ok",
    label: "Financial services health",
    message:
      errorCount > 0
        ? `${errorCount} services need attention.`
        : degradedCount > 0
          ? `${healthyCount} services healthy, ${degradedCount} degraded.`
          : `${healthyCount} services healthy.`,
    source: `${baseUrl}/market-data/ops · ${baseUrl}/polymarket/health · ${baseUrl}/polymarket/live`,
    updatedAt: checkedAt,
    warnings: compactStrings([
      opsResult.error,
      polymarketHealthResult.error,
      polymarketLiveResult.error,
      ...rows.flatMap((row) => (row.state === "ok" ? [] : [`${row.label}:${row.state}`])),
    ]),
    badgeText: `${healthyCount}/${rows.length}`,
    data: {
      rows,
      healthyCount,
      degradedCount,
      errorCount,
      checkedAt,
    },
  };
}

function configuredRow(
  label: string,
  source: string,
  rawStatus: string | null,
  okValues: string[],
  healthyLabel: string,
): FinancialServiceHealthRow {
  const status = rawStatus?.toLowerCase() ?? null;
  if (!status) {
    return serviceRow(label, source, "error", "unavailable", "The service did not return a health status.");
  }
  if (okValues.includes(status)) {
    return serviceRow(label, source, "ok", healthyLabel, `${label} is ${healthyLabel}.`, healthyLabel);
  }
  return serviceRow(label, source, status === "disabled" ? "degraded" : "error", status, `${label} reported ${status}.`);
}

function schwabRestRow(
  providerMetrics: Record<string, unknown> | null,
  providers: Record<string, unknown> | null,
  opsResult: FetchJsonResult,
): FinancialServiceHealthRow {
  const configured = stringValue(providers?.schwab);
  const cooldownUntil = stringValue(providerMetrics?.schwabCooldownUntil);
  const tokenStatus = stringValue(providerMetrics?.schwabTokenStatus) ?? stringValue(providers?.schwabTokenStatus);
  const lastSuccess = stringValue(providerMetrics?.lastSuccessfulSchwabRestAt);
  if (configured !== "configured") {
    return serviceRow("Schwab REST", "/market-data/ops", "error", "unconfigured", opsResult.error ?? "Schwab REST is not configured.");
  }
  if (cooldownUntil) {
    return serviceRow("Schwab REST", "/market-data/ops", "degraded", "cooldown active", `Cooldown is active until ${formatOperatorTimestamp(cooldownUntil)}.`, "cooldown");
  }
  return serviceRow(
    "Schwab REST",
    "/market-data/ops",
    tokenStatus === "ready" ? "ok" : "degraded",
    tokenStatus === "ready" ? "healthy" : tokenStatus ?? "unknown",
    lastSuccess ? `Last successful REST quote at ${formatOperatorTimestamp(lastSuccess)}.` : "Schwab REST health was not reported.",
    tokenStatus === "ready" ? "rest" : undefined,
    lastSuccess,
  );
}

function schwabStreamerRow(
  streamerMeta: Record<string, unknown> | null,
  providers: Record<string, unknown> | null,
  opsResult: FetchJsonResult,
): FinancialServiceHealthRow {
  const configured = stringValue(providers?.schwabStreamer);
  const connected = booleanValue(streamerMeta?.connected);
  const stale = booleanValue(streamerMeta?.stale) ?? false;
  const operatorState = stringValue(streamerMeta?.operatorState) ?? "unknown";
  const activeSubscriptions = asRecord(streamerMeta?.activeSubscriptions);
  const updatedAt = stringValue(streamerMeta?.lastMessageAt) ?? stringValue(streamerMeta?.lastHeartbeatAt) ?? stringValue(streamerMeta?.lastLoginAt);
  if (configured !== "enabled") {
    return serviceRow("Schwab streamer", "/market-data/ops", "error", "unconfigured", opsResult.error ?? "Schwab streamer is not enabled.");
  }
  return serviceRow(
    "Schwab streamer",
    "/market-data/ops",
    connected && !stale && operatorState === "healthy" ? "ok" : "degraded",
    connected ? (stale ? "stale" : "connected") : "disconnected",
    connected
      ? `${numberValue(activeSubscriptions?.LEVELONE_EQUITIES) ?? 0} equity subs · ${numberValue(activeSubscriptions?.ACCT_ACTIVITY) ?? 0} acct activity.`
      : "Schwab streamer is disconnected.",
    connected && !stale && operatorState === "healthy" ? "stream" : stale ? "stale" : undefined,
    updatedAt,
  );
}

function polymarketRestRow(
  result: FetchJsonResult,
  body: Record<string, unknown> | null,
): FinancialServiceHealthRow {
  const status = stringValue(body?.status) ?? (result.ok ? "healthy" : "unhealthy");
  const state: LoadState = status === "healthy" || status === "ok" ? "ok" : status === "degraded" ? "degraded" : "error";
  return serviceRow("Polymarket REST", "/polymarket/health", state, status, state === "ok" ? `API ${stringValue(body?.apiBaseUrl) ?? "Polymarket API"} is reachable.` : result.error ?? "Polymarket REST health was not reported.", "rest", stringValue(body?.generatedAt));
}

function polymarketStreamerRow(
  result: FetchJsonResult,
  body: Record<string, unknown> | null,
  streamer: Record<string, unknown> | null,
): FinancialServiceHealthRow {
  const connected = booleanValue(streamer?.marketsConnected);
  const privateConnected = booleanValue(streamer?.privateConnected);
  const operatorState = stringValue(streamer?.operatorState) ?? "unknown";
  const state: LoadState = connected && privateConnected ? operatorState === "healthy" ? "ok" : "degraded" : connected || privateConnected ? "degraded" : "error";
  const lastMarketMessageAt = stringValue(streamer?.lastMarketMessageAt);
  return serviceRow(
    "Polymarket streamer",
    "/polymarket/live",
    state,
    connected && privateConnected ? "connected" : connected || privateConnected ? "partial" : "disconnected",
    connected || privateConnected
      ? `${numberValue(streamer?.trackedMarketCount) ?? 0} tracked markets · ${lastMarketMessageAt ? `last market msg ${formatOperatorTimestamp(lastMarketMessageAt)}` : "no market timestamp"}.`
      : result.error ?? "Polymarket streamer health was not reported.",
    operatorState === "healthy" ? "stream" : undefined,
    stringValue(body?.generatedAt) ?? lastMarketMessageAt,
  );
}

function serviceRow(
  label: string,
  source: string,
  state: LoadState,
  summary: string,
  detail: string,
  badgeText?: string,
  updatedAt?: string | null,
): FinancialServiceHealthRow {
  return {
    label,
    state,
    summary,
    detail,
    source,
    updatedAt: updatedAt ?? new Date().toISOString(),
    badgeText: badgeText ?? null,
  };
}

async function fetchJson(url: string, fetchImpl: typeof fetch): Promise<FetchJsonResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_REQUEST_TIMEOUT_MS);
  try {
    const response = await fetchImpl(url, {
      cache: "no-store",
      signal: controller.signal,
    });
    const text = await response.text();
    const body = text ? safeJsonParse(text) : null;
    return {
      ok: response.ok,
      status: response.status,
      body,
      error: response.ok ? null : `HTTP ${response.status}`,
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

function safeJsonParse(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function numberValue(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function booleanValue(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function compactStrings(values: Array<string | null | undefined | false>): string[] {
  return values.filter((value): value is string => typeof value === "string" && value.trim().length > 0);
}
