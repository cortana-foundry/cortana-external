#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKTESTER_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

MARKET_DATA_SERVICE_URL="${MARKET_DATA_SERVICE_URL:-http://localhost:3033}"
WATCHLIST_LIMIT="${WATCHLIST_LIMIT:-12}"
POLYMARKET_WATCHLIST_PATH="${POLYMARKET_WATCHLIST_PATH:-${BACKTESTER_DIR}/data/polymarket_watchlist.json}"
DYNAMIC_WATCHLIST_PATH="${DYNAMIC_WATCHLIST_PATH:-${BACKTESTER_DIR}/data/dynamic_watchlist.json}"
WATCHLIST_SNAPSHOT_PATH="${WATCHLIST_SNAPSHOT_PATH:-${BACKTESTER_DIR}/.cache/watchlist-watch-snapshot.json}"
POLYMARKET_MAX_AGE_HOURS="${POLYMARKET_MAX_AGE_HOURS:-12}"
REQUIRE_MARKET_DATA_SERVICE="${REQUIRE_MARKET_DATA_SERVICE:-1}"
REQUIRE_SCHWAB_CONFIGURED="${REQUIRE_SCHWAB_CONFIGURED:-1}"

source "${SCRIPT_DIR}/market_data_preflight.sh"

if [[ "${REQUIRE_MARKET_DATA_SERVICE}" == "1" ]]; then
  echo "== Market data preflight =="
  ensure_market_data_runtime_ready "${MARKET_DATA_SERVICE_URL}" "${REQUIRE_SCHWAB_CONFIGURED}"
  echo
fi

entries_path="$(mktemp)"
quotes_path="$(mktemp)"
trap 'rm -f "${entries_path}" "${quotes_path}"' EXIT

python3 - "${POLYMARKET_WATCHLIST_PATH}" "${DYNAMIC_WATCHLIST_PATH}" "${WATCHLIST_LIMIT}" "${POLYMARKET_MAX_AGE_HOURS}" >"${entries_path}" <<'PY'
import json
import sys
from datetime import datetime, timezone

polymarket_path, dynamic_path, limit_raw, max_age_raw = sys.argv[1:5]
limit = max(int(limit_raw or 12), 1)
max_age_hours = float(max_age_raw or 12.0)


def load_json(path: str):
    try:
        with open(path, "r", encoding="utf-8") as handle:
            return json.load(handle)
    except Exception:
        return None


def parse_dt(raw: str | None):
    if not raw:
        return None
    try:
        return datetime.fromisoformat(str(raw).replace("Z", "+00:00"))
    except Exception:
        return None


combined = {}
meta = {
    "polymarketUpdatedAt": None,
    "dynamicUpdatedAt": None,
    "polymarketIncluded": False,
    "dynamicIncluded": False,
}

polymarket = load_json(polymarket_path)
if isinstance(polymarket, dict):
    updated_at = parse_dt(polymarket.get("updated_at"))
    meta["polymarketUpdatedAt"] = polymarket.get("updated_at")
    if updated_at is not None:
        age_hours = (datetime.now(timezone.utc) - updated_at.astimezone(timezone.utc)).total_seconds() / 3600.0
        if age_hours <= max_age_hours:
            for item in polymarket.get("tickers", []) or []:
                if not isinstance(item, dict):
                    continue
                symbol = str(item.get("symbol", "")).strip().upper()
                asset_class = str(item.get("asset_class", "")).strip().lower()
                if not symbol or asset_class not in {"stock", "etf", "crypto_proxy"}:
                    continue
                row = combined.setdefault(symbol, {"symbol": symbol, "sources": [], "themes": [], "score": None, "mentions": None})
                row["sources"].append("polymarket")
                for theme in item.get("themes", []) or []:
                    theme_value = str(theme).strip().lower()
                    if theme_value and theme_value not in row["themes"]:
                        row["themes"].append(theme_value)
                if item.get("score") is not None:
                    try:
                        row["score"] = float(item["score"])
                    except Exception:
                        pass
            meta["polymarketIncluded"] = True

dynamic = load_json(dynamic_path)
if isinstance(dynamic, dict):
    meta["dynamicUpdatedAt"] = dynamic.get("updated_at")
    for item in dynamic.get("tickers", []) or []:
        if not isinstance(item, dict):
            continue
        symbol = str(item.get("symbol", "")).strip().upper()
        if not symbol:
            continue
        row = combined.setdefault(symbol, {"symbol": symbol, "sources": [], "themes": [], "score": None, "mentions": None})
        row["sources"].append("dynamic")
        if item.get("mentions") is not None:
            try:
                row["mentions"] = int(item["mentions"])
            except Exception:
                pass
    if dynamic.get("tickers"):
        meta["dynamicIncluded"] = True

entries = list(combined.values())
entries.sort(
    key=lambda item: (
        -(1 if "polymarket" in item["sources"] else 0),
        -(item["score"] if isinstance(item.get("score"), (int, float)) else -1.0),
        -(item["mentions"] if isinstance(item.get("mentions"), int) else -1),
        item["symbol"],
    )
)

print(json.dumps({"meta": meta, "entries": entries[:limit]}))
PY

symbols="$(python3 - "${entries_path}" <<'PY'
import json
import sys
payload = json.load(open(sys.argv[1], "r", encoding="utf-8"))
entries = payload.get("entries") or []
print(",".join(item["symbol"] for item in entries if isinstance(item, dict) and item.get("symbol")))
PY
)"

if [[ -z "${symbols}" ]]; then
  echo "Watchlist watch"
  echo
  echo "- No watchlist symbols are currently available."
  exit 0
fi

curl -fsS "${MARKET_DATA_SERVICE_URL}/market-data/quote/batch?symbols=${symbols}" >"${quotes_path}"

python3 - "${entries_path}" "${quotes_path}" "${WATCHLIST_SNAPSHOT_PATH}" <<'PY'
import json
import os
import sys
from datetime import datetime, timezone

entries_path, quotes_path, snapshot_path = sys.argv[1:4]
entries_payload = json.load(open(entries_path, "r", encoding="utf-8"))
quotes_payload = json.load(open(quotes_path, "r", encoding="utf-8"))

meta = entries_payload.get("meta") or {}
entries = entries_payload.get("entries") or []
quote_items = (quotes_payload.get("data") or {}).get("items") or []
quotes = {
    str(item.get("symbol", "")).upper(): item
    for item in quote_items
    if isinstance(item, dict) and str(item.get("symbol", "")).strip()
}

previous = {}
if os.path.exists(snapshot_path):
    try:
        previous = json.load(open(snapshot_path, "r", encoding="utf-8"))
    except Exception:
        previous = {}

previous_symbols = set(previous.get("symbols") or [])
current_symbols = {str(item.get("symbol", "")).upper() for item in entries}
added = sorted(current_symbols - previous_symbols)
removed = sorted(previous_symbols - current_symbols)

previous_quotes = previous.get("quotes") or {}

print("Watchlist watch")
print("")
print("Takeaway")
print(
    "- Current watchlist: "
    f"{len(current_symbols)} symbols"
    f" | added {len(added)}"
    f" | removed {len(removed)}"
)
if meta.get("polymarketIncluded"):
    print(f"- Polymarket watchlist: active | updated {meta.get('polymarketUpdatedAt')}")
else:
    print(f"- Polymarket watchlist: skipped/stale | updated {meta.get('polymarketUpdatedAt') or 'missing'}")
if meta.get("dynamicIncluded"):
    print(f"- Dynamic watchlist: active | updated {meta.get('dynamicUpdatedAt')}")
else:
    print(f"- Dynamic watchlist: missing/empty | updated {meta.get('dynamicUpdatedAt') or 'missing'}")
if added:
    print("- New since last check: " + ", ".join(added[:10]) + (f" (+{len(added)-10} more)" if len(added) > 10 else ""))
if removed:
    print("- Dropped since last check: " + ", ".join(removed[:10]) + (f" (+{len(removed)-10} more)" if len(removed) > 10 else ""))

print("")
print("Quotes")

for entry in entries:
    symbol = str(entry.get("symbol", "")).upper()
    quote_item = quotes.get(symbol, {})
    quote = quote_item.get("data") or {}
    source = quote_item.get("source", "unknown")
    status = quote_item.get("status", "unknown")
    price = quote.get("price")
    change_pct = quote.get("changePercent")
    source_bits = []
    if "polymarket" in (entry.get("sources") or []):
        source_bits.append("PM")
    if "dynamic" in (entry.get("sources") or []):
        source_bits.append("X")
    tags = "/".join(source_bits) if source_bits else "?"
    parts = [f"{symbol} [{tags}]"]
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
    previous_price = previous_quotes.get(symbol)
    if previous_price is not None and price is not None:
        try:
            delta = float(price) - float(previous_price)
            parts.append(f"vs last {delta:+.2f}")
        except Exception:
            pass
    if entry.get("themes"):
        parts.append("themes " + ",".join(entry["themes"][:3]))
    if entry.get("mentions") is not None:
        parts.append(f"mentions {entry['mentions']}")
    if entry.get("score") is not None:
        parts.append(f"pm-score {float(entry['score']):.2f}")
    parts.append(f"source {source}")
    parts.append(f"status {status}")
    print("- " + " | ".join(parts))

os.makedirs(os.path.dirname(snapshot_path), exist_ok=True)
snapshot = {
    "updatedAt": datetime.now(timezone.utc).isoformat(),
    "symbols": sorted(current_symbols),
    "quotes": {
        str(symbol).upper(): ((quotes.get(str(symbol).upper(), {}).get("data") or {}).get("price"))
        for symbol in current_symbols
    },
}
with open(snapshot_path, "w", encoding="utf-8") as handle:
    json.dump(snapshot, handle, indent=2)
PY
