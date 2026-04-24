export const TRADING_FRESHNESS_POLICIES = {
  marketData: { maxAgeSeconds: 15 * 60, label: "Market data" },
  runtimeHealth: { maxAgeSeconds: 60 * 60, label: "Runtime health" },
  lifecycle: { maxAgeSeconds: 4 * 60 * 60, label: "Lifecycle" },
  controlLoop: { maxAgeSeconds: 4 * 60 * 60, label: "V4 control loop" },
  predictionScorecard: { maxAgeSeconds: 72 * 60 * 60, label: "Prediction scorecard" },
  tradingSummary: { maxAgeSeconds: 24 * 60 * 60, label: "Trading summary" },
} as const;

export type TradingFreshnessPolicyKey = keyof typeof TRADING_FRESHNESS_POLICIES;

export function tradingFreshnessSeconds(key: TradingFreshnessPolicyKey): number {
  return TRADING_FRESHNESS_POLICIES[key].maxAgeSeconds;
}
