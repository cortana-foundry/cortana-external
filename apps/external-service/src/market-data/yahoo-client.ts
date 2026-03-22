import type { HistoryInterval } from "./history-utils.js";
import type { MarketDataHistoryPoint, MarketDataQuote } from "./types.js";

const YAHOO_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36";

interface JsonRecord {
  [key: string]: unknown;
}

interface YahooClientOptions {
  runRequest: <T>(operation: string, fn: () => Promise<T>) => Promise<T>;
  fetchJson: <T>(url: string, init?: RequestInit) => Promise<T>;
}

export async function fetchYahooHistory(
  options: YahooClientOptions,
  symbol: string,
  period: string,
  interval: HistoryInterval = "1d",
): Promise<MarketDataHistoryPoint[]> {
  return options.runRequest("history", async () => {
    const range = normalizeYahooRange(period);
    const url = new URL(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}`);
    url.searchParams.set("range", range);
    url.searchParams.set("interval", interval);
    url.searchParams.set("includePrePost", "false");
    url.searchParams.set("events", "div,splits");

    const payload = await options.fetchJson<JsonRecord>(url.toString(), {
      headers: { "user-agent": YAHOO_USER_AGENT, accept: "application/json" },
    });
    const result = (((payload.chart as JsonRecord | undefined)?.result as JsonRecord[] | undefined) ?? [])[0] ?? {};
    const timestamps = ((result.timestamp as number[] | undefined) ?? []).map((value) => Number(value));
    const quote = ((((result.indicators as JsonRecord | undefined)?.quote as JsonRecord[] | undefined) ?? [])[0] ?? {}) as JsonRecord;
    const opens = toNumberArray(quote.open);
    const highs = toNumberArray(quote.high);
    const lows = toNumberArray(quote.low);
    const closes = toNumberArray(quote.close);
    const volumes = toNumberArray(quote.volume);
    const out: MarketDataHistoryPoint[] = [];
    for (let index = 0; index < timestamps.length; index += 1) {
      const open = opens[index];
      const high = highs[index];
      const low = lows[index];
      const close = closes[index];
      const volume = volumes[index];
      if ([open, high, low, close, volume].some((value) => value == null || Number.isNaN(value))) {
        continue;
      }
      out.push({
        timestamp: new Date(timestamps[index] * 1000).toISOString(),
        open: Number(open),
        high: Number(high),
        low: Number(low),
        close: Number(close),
        volume: Number(volume),
      });
    }
    if (!out.length) {
      throw new Error(`Yahoo returned no usable history for ${symbol}`);
    }
    return out;
  });
}

export async function fetchYahooQuote(options: YahooClientOptions, symbol: string): Promise<MarketDataQuote> {
  return options.runRequest("quote", async () => {
    const url = new URL("https://query1.finance.yahoo.com/v7/finance/quote");
    url.searchParams.set("symbols", symbol);
    const payload = await options.fetchJson<JsonRecord>(url.toString(), {
      headers: { "user-agent": YAHOO_USER_AGENT, accept: "application/json" },
    });
    const result = ((((payload.quoteResponse as JsonRecord | undefined)?.result as JsonRecord[] | undefined) ?? [])[0] ?? {}) as JsonRecord;
    if (!Object.keys(result).length) {
      throw new Error(`Yahoo returned no quote for ${symbol}`);
    }
    return {
      symbol,
      price: toNumber(result.regularMarketPrice) ?? undefined,
      change: toNumber(result.regularMarketChange) ?? undefined,
      changePercent: toNumber(result.regularMarketChangePercent) ?? undefined,
      timestamp: result.regularMarketTime ? new Date(Number(result.regularMarketTime) * 1000).toISOString() : new Date().toISOString(),
      currency: typeof result.currency === "string" ? result.currency : undefined,
      volume: toNumber(result.regularMarketVolume) ?? undefined,
      week52High: toNumber(result.fiftyTwoWeekHigh) ?? undefined,
      week52Low: toNumber(result.fiftyTwoWeekLow) ?? undefined,
    };
  });
}

export async function fetchYahooMetadata(options: YahooClientOptions, symbol: string): Promise<Record<string, unknown>> {
  const [quoteSummary, quote] = await Promise.all([
    fetchYahooQuoteSummary(options, symbol, ["summaryProfile", "defaultKeyStatistics", "financialData", "price"]),
    fetchYahooQuote(options, symbol).catch((): MarketDataQuote => ({ symbol })),
  ]);
  const summaryProfile = (quoteSummary.summaryProfile as JsonRecord | undefined) ?? {};
  const defaultKeyStats = (quoteSummary.defaultKeyStatistics as JsonRecord | undefined) ?? {};
  const price = (quoteSummary.price as JsonRecord | undefined) ?? {};
  return {
    name: firstString(price.shortName, price.longName, symbol),
    market_cap: unwrapYahooValue(firstValue(price.marketCap, defaultKeyStats.marketCap)),
    float_shares: unwrapYahooValue(defaultKeyStats.floatShares),
    beta: unwrapYahooValue(defaultKeyStats.beta),
    sector: firstString(summaryProfile.sector),
    industry: firstString(summaryProfile.industry),
    price: quote.price,
    change: quote.change,
    change_percent: quote.changePercent,
    currency: quote.currency,
  };
}

export async function fetchYahooFundamentals(
  options: YahooClientOptions,
  symbol: string,
  asOfDate?: string,
): Promise<Record<string, unknown>> {
  const summary = await fetchYahooQuoteSummary(options, symbol, [
    "summaryProfile",
    "defaultKeyStatistics",
    "financialData",
    "price",
    "calendarEvents",
    "earningsTrend",
  ]);
  const financialData = (summary.financialData as JsonRecord | undefined) ?? {};
  const defaultKeyStatistics = (summary.defaultKeyStatistics as JsonRecord | undefined) ?? {};
  const summaryProfile = (summary.summaryProfile as JsonRecord | undefined) ?? {};
  const calendarEvents = (summary.calendarEvents as JsonRecord | undefined) ?? {};
  const earnings = (calendarEvents.earnings as JsonRecord | undefined) ?? {};
  const earningsDates = ((earnings.earningsDate as JsonRecord[] | undefined) ?? [])
    .map((entry) => unwrapYahooValue(entry.fmt ?? entry.raw ?? entry.date))
    .filter((value): value is string => typeof value === "string");
  const eventWindow = earningsDates.map((date) => ({ date }));
  const earningsTrend = ((summary.earningsTrend as JsonRecord | undefined)?.trend as JsonRecord[] | undefined) ?? [];
  const annualGrowth = toNumber(unwrapYahooValue(earningsTrend[0]?.growth ?? financialData.earningsGrowth));
  return {
    symbol,
    as_of_date: asOfDate ?? new Date().toISOString().slice(0, 10),
    eps_growth: percentOrNone(unwrapYahooValue(financialData.earningsGrowth)),
    annual_eps_growth: percentOrNone(annualGrowth),
    revenue_growth: percentOrNone(unwrapYahooValue(financialData.revenueGrowth)),
    institutional_pct: toNumber(unwrapYahooValue(defaultKeyStatistics.heldPercentInstitutions)),
    float_shares: unwrapYahooValue(defaultKeyStatistics.floatShares),
    shares_outstanding: unwrapYahooValue(defaultKeyStatistics.sharesOutstanding),
    short_ratio: unwrapYahooValue(defaultKeyStatistics.shortRatio),
    short_pct_of_float: unwrapYahooValue(defaultKeyStatistics.shortPercentOfFloat),
    sector: firstString(summaryProfile.sector),
    industry: firstString(summaryProfile.industry),
    earnings_event_window: eventWindow,
    last_earnings_date: eventWindow.length ? String(eventWindow[eventWindow.length - 1]?.date ?? "") : null,
    next_earnings_date: eventWindow.length ? String(eventWindow[0]?.date ?? "") : null,
    earnings_history: [],
    quarterly_financials: [],
  }
}

export async function fetchYahooNews(options: YahooClientOptions, symbol: string): Promise<Record<string, unknown>> {
  return options.runRequest("news", async () => {
    const url = new URL("https://query1.finance.yahoo.com/v1/finance/search");
    url.searchParams.set("q", symbol);
    url.searchParams.set("quotesCount", "0");
    url.searchParams.set("newsCount", "8");
    const payload = await options.fetchJson<JsonRecord>(url.toString(), {
      headers: { "user-agent": YAHOO_USER_AGENT, accept: "application/json" },
    });
    const news = ((payload.news as JsonRecord[] | undefined) ?? []).map((item) => ({
      title: firstString(item.title),
      publisher: firstString(item.publisher),
      link: firstString(item.link),
      summary: firstString(item.summary),
    }));
    return { items: news };
  });
}

async function fetchYahooQuoteSummary(options: YahooClientOptions, symbol: string, modules: string[]): Promise<JsonRecord> {
  return options.runRequest("quoteSummary", async () => {
    const url = new URL(`https://query1.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}`);
    url.searchParams.set("modules", modules.join(","));
    const payload = await options.fetchJson<JsonRecord>(url.toString(), {
      headers: { "user-agent": YAHOO_USER_AGENT, accept: "application/json" },
    });
    const result = ((((payload.quoteSummary as JsonRecord | undefined)?.result as JsonRecord[] | undefined) ?? [])[0] ?? {}) as JsonRecord;
    if (!Object.keys(result).length) {
      throw new Error(`Yahoo quoteSummary returned no data for ${symbol}`);
    }
    return result;
  });
}

function toNumberArray(value: unknown): Array<number | null> {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((item) => toNumber(item));
}

function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function firstString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return undefined;
}

function firstValue(...values: unknown[]): unknown {
  for (const value of values) {
    if (value != null) {
      return value;
    }
  }
  return undefined;
}

function unwrapYahooValue(value: unknown): unknown {
  if (value && typeof value === "object" && "raw" in (value as JsonRecord)) {
    return (value as JsonRecord).raw;
  }
  return value;
}

function normalizeYahooRange(period: string): string {
  const normalized = period.trim().toLowerCase();
  const supported = new Set(["5d", "1mo", "3mo", "6mo", "1y", "2y", "5y", "10y", "ytd", "max"]);
  if (supported.has(normalized) || normalized.endsWith("d") || normalized.endsWith("mo") || normalized.endsWith("y")) {
    return normalized;
  }
  return "1y";
}

function percentOrNone(value: unknown): number | null {
  const numeric = toNumber(value);
  if (numeric == null) {
    return null;
  }
  if (Math.abs(numeric) <= 2) {
    return numeric * 100;
  }
  return numeric;
}
