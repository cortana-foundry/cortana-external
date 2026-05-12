import type { MarketDataComparison, MarketDataProviderMode, MarketDataResponse, MarketDataStatus } from "./types.js";

export function normalizeMarketSymbol(rawSymbol: string): string {
  return String(rawSymbol).trim().toUpperCase();
}

export function resolveQuery(url: string, key: string, defaultValue: string): string {
  try {
    const parsed = new URL(url);
    return parsed.searchParams.get(key) ?? defaultValue;
  } catch {
    return defaultValue;
  }
}

export function parseBatchSymbols(url: string): string[] {
  const raw = resolveQuery(url, "symbols", "");
  return [
    ...new Set(
      raw
        .split(",")
        .map((value) => normalizeMarketSymbol(value))
        .filter(Boolean),
    ),
  ];
}

export function marketDataErrorResponse<T>(
  message: string,
  status: MarketDataStatus,
  options: {
    reason: string;
    providerMode?: MarketDataProviderMode;
    fallbackEngaged?: boolean;
    providerModeReason?: string | null;
  },
): MarketDataResponse<T> {
  return {
    source: "service",
    status,
    degradedReason: message,
    stalenessSeconds: null,
    providerMode: options.providerMode ?? "unavailable",
    fallbackEngaged: options.fallbackEngaged ?? false,
    providerModeReason: options.providerModeReason ?? options.reason,
    data: { error: options.reason } as T,
  };
}

export function buildUnavailableCompare(source: string, message: string): MarketDataComparison {
  return {
    source,
    available: false,
    mismatchSummary: message,
    stalenessSeconds: null,
  };
}
