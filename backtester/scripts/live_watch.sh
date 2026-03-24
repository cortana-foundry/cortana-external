#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKTESTER_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

MARKET_DATA_SERVICE_URL="${MARKET_DATA_SERVICE_URL:-http://localhost:3033}"
WATCH_SYMBOLS="${WATCH_SYMBOLS:-SPY,QQQ}"
FOCUS_SYMBOL="${FOCUS_SYMBOL:-SPY}"
SHOW_SNAPSHOT="${SHOW_SNAPSHOT:-1}"
REQUIRE_MARKET_DATA_SERVICE="${REQUIRE_MARKET_DATA_SERVICE:-1}"
REQUIRE_SCHWAB_CONFIGURED="${REQUIRE_SCHWAB_CONFIGURED:-1}"

source "${SCRIPT_DIR}/market_data_preflight.sh"

if [[ "${REQUIRE_MARKET_DATA_SERVICE}" == "1" ]]; then
  echo "== Market data preflight =="
  ensure_market_data_runtime_ready "${MARKET_DATA_SERVICE_URL}" "${REQUIRE_SCHWAB_CONFIGURED}"
  echo
fi

quote_path="$(mktemp)"
snapshot_path="$(mktemp)"
trap 'rm -f "${quote_path}" "${snapshot_path}"' EXIT

echo "== Live watch =="
echo "Watch symbols: ${WATCH_SYMBOLS}"
echo "Focus symbol: ${FOCUS_SYMBOL}"
echo

curl -fsS "${MARKET_DATA_SERVICE_URL}/market-data/quote/batch?symbols=${WATCH_SYMBOLS}" >"${quote_path}"
if [[ "${SHOW_SNAPSHOT}" == "1" ]]; then
  curl -fsS "${MARKET_DATA_SERVICE_URL}/market-data/snapshot/${FOCUS_SYMBOL}" >"${snapshot_path}"
fi

python3 - "${quote_path}" "${snapshot_path}" "${FOCUS_SYMBOL}" "${SHOW_SNAPSHOT}" <<'PY'
import json
import sys

quote_path, snapshot_path, focus_symbol, show_snapshot = sys.argv[1:5]

with open(quote_path, "r", encoding="utf-8") as handle:
    quotes_payload = json.load(handle)

items = (((quotes_payload.get("data") or {}).get("items")) or [])

print("Quotes")
print("")
for item in items:
    if not isinstance(item, dict):
        continue
    symbol = item.get("symbol", "?")
    source = item.get("source", "unknown")
    status = item.get("status", "unknown")
    data = item.get("data") or {}
    price = data.get("price")
    change_pct = data.get("changePercent")
    bid = data.get("bidPrice")
    ask = data.get("askPrice")

    parts = [f"{symbol}"]
    if price is not None:
        try:
            parts.append(f"${float(price):,.2f}")
        except Exception:
            parts.append(str(price))
    if change_pct is not None:
        try:
            parts.append(f"{float(change_pct):+.2f}%")
        except Exception:
            parts.append(str(change_pct))
    if bid is not None and ask is not None:
        try:
            parts.append(f"bid/ask ${float(bid):,.2f}/${float(ask):,.2f}")
        except Exception:
            parts.append(f"bid/ask {bid}/{ask}")
    parts.append(f"source {source}")
    parts.append(f"status {status}")
    print("- " + " | ".join(parts))

if show_snapshot == "1":
    print("")
    print(f"Snapshot: {focus_symbol}")
    print("")
    with open(snapshot_path, "r", encoding="utf-8") as handle:
        snapshot_payload = json.load(handle)
    snapshot = (snapshot_payload.get("data") or {})
    quote = snapshot.get("quote") or {}
    chart = snapshot.get("chartEquity") or {}
    metadata = snapshot.get("metadata") or {}

    print(f"- Source: {snapshot_payload.get('source', 'unknown')} | status {snapshot_payload.get('status', 'unknown')}")
    if quote.get("price") is not None:
        try:
            print(f"- Last price: ${float(quote['price']):,.2f}")
        except Exception:
            print(f"- Last price: {quote['price']}")
    if quote.get("changePercent") is not None:
        try:
            print(f"- Change: {float(quote['changePercent']):+.2f}%")
        except Exception:
            print(f"- Change: {quote['changePercent']}")
    if chart:
        bits = []
        for key in ("open", "high", "low", "close", "volume"):
            value = chart.get(key)
            if value is not None:
                bits.append(f"{key} {value}")
        if bits:
            print("- Intraday candle: " + " | ".join(bits))
    if metadata.get("assetClass") or metadata.get("exchangeName"):
        details = []
        if metadata.get("assetClass"):
            details.append(str(metadata["assetClass"]))
        if metadata.get("exchangeName"):
            details.append(str(metadata["exchangeName"]))
        print("- Metadata: " + " | ".join(details))
PY
