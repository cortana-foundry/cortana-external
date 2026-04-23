import type { MarketDataProviderMode, MarketDataStatus } from "./types.js";

export interface ProviderLaneMetadata {
  source: string;
  status: MarketDataStatus;
  degradedReason?: string | null;
  stalenessSeconds: number | null;
  providerMode: MarketDataProviderMode;
  fallbackEngaged: boolean;
  providerModeReason?: string | null;
}

export function providerLaneResult<T extends Record<string, unknown>>(
  metadata: ProviderLaneMetadata,
  payload: T,
): ProviderLaneMetadata & T {
  return { ...metadata, ...payload };
}
