const SUPPORTED_ARTIFACT_SCHEMAS: Record<string, ReadonlySet<number>> = {
  buy_readiness: new Set([1]),
  control_loop_schedule_check: new Set([1]),
  dipbuyer_profile_report: new Set([1]),
  execution_readiness_check: new Set([1]),
  market_data_freshness_lane: new Set([1]),
  strategy_scan_performance: new Set([1]),
  telegram_alert_contract: new Set([1]),
  trade_lifecycle_report: new Set([1]),
  trade_lifecycle_cycle: new Set([1]),
  trading_actual_state: new Set([1]),
  trading_desired_state: new Set([1]),
  trading_drift_summary: new Set([1]),
  trading_intervention_events: new Set([1]),
  trading_release_unit: new Set([1]),
  trading_reconciliation_actions: new Set([1]),
  trading_run_summary: new Set([1]),
  trading_schedule_registry: new Set([1]),
};

export type TradingArtifactSchemaValidation = {
  ok: boolean;
  message?: string;
};

export function validateTradingArtifactSchema(value: unknown): TradingArtifactSchemaValidation {
  if (!isRecord(value)) return { ok: true };
  const family = typeof value.artifact_family === "string" ? value.artifact_family.trim() : null;
  if (!family) return { ok: true };
  const supported = SUPPORTED_ARTIFACT_SCHEMAS[family];
  if (!supported) return { ok: true };
  const version = Number(value.schema_version);
  if (!Number.isInteger(version)) {
    return { ok: false, message: `${family} artifact is missing schema_version.` };
  }
  if (!supported.has(version)) {
    return { ok: false, message: `${family} schema_version ${version} is not supported.` };
  }
  return { ok: true };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
