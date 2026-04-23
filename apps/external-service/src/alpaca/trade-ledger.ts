import type { TradeRecord } from "./types.js";

export const CREATE_TRADES_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS cortana_trades (
  id SERIAL PRIMARY KEY,
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  symbol TEXT NOT NULL,
  side TEXT NOT NULL,
  qty NUMERIC,
  notional NUMERIC,
  entry_price NUMERIC,
  target_price NUMERIC,
  stop_loss NUMERIC,
  thesis TEXT,
  signal_source TEXT,
  status TEXT DEFAULT 'open',
  exit_price NUMERIC,
  exit_timestamp TIMESTAMPTZ,
  pnl NUMERIC,
  pnl_pct NUMERIC,
  outcome TEXT,
  metadata JSONB DEFAULT '{}'
);`;

export interface TradeLedgerRow {
  id: number;
  timestamp: Date;
  symbol: string;
  side: string;
  qty: number | null;
  notional: number | null;
  entry_price: number | null;
  target_price: number | null;
  stop_loss: number | null;
  thesis: string | null;
  signal_source: string | null;
  status: string | null;
  exit_price: number | null;
  exit_timestamp: Date | null;
  pnl: number | null;
  pnl_pct: number | null;
  outcome: string | null;
  metadata: unknown;
}

export function mapTradeLedgerRow(row: TradeLedgerRow): TradeRecord {
  return {
    id: row.id,
    timestamp: row.timestamp?.toISOString(),
    symbol: row.symbol,
    side: row.side,
    qty: row.qty,
    notional: row.notional,
    entry_price: row.entry_price,
    target_price: row.target_price,
    stop_loss: row.stop_loss,
    thesis: row.thesis ?? "",
    signal_source: row.signal_source ?? "",
    status: row.status ?? "",
    exit_price: row.exit_price,
    exit_timestamp: row.exit_timestamp?.toISOString() ?? null,
    pnl: row.pnl,
    pnl_pct: row.pnl_pct,
    outcome: row.outcome ?? "",
    metadata: row.metadata,
  };
}

export function calculateExitPerformance(entry: number | null, qty: number | null, exitPrice: number): {
  pnl?: number;
  pnlPct?: number;
} {
  if (entry == null) {
    return {};
  }
  let pnl = exitPrice - entry;
  if (qty != null) {
    pnl *= qty;
  }
  const pnlPct = entry !== 0 ? ((exitPrice / entry) - 1) * 100 : undefined;
  return {
    pnl,
    pnlPct: pnlPct != null && Number.isFinite(pnlPct) ? pnlPct : undefined,
  };
}
