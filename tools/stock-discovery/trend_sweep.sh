#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WATCHLIST_FILE="${WATCHLIST_FILE:-/Users/hd/Developer/cortana-external/backtester/data/dynamic_watchlist.json}"
BIRD_AUTH_ENV_PATH="${BIRD_AUTH_ENV_PATH:-$HOME/.config/cortana/x-twitter-bird.env}"
BIRD_SYNC_AUTH_CMD="${BIRD_SYNC_AUTH_CMD:-${SCRIPT_DIR}/sync_bird_auth.sh}"
BIRD_CHROME_PROFILE_DIR="${BIRD_CHROME_PROFILE_DIR:-$HOME/.openclaw/browser/openclaw/user-data/Default}"
BIRD_COOKIE_SOURCE="${BIRD_COOKIE_SOURCE:-chrome}"
TMP_DIR="$(mktemp -d)"
RAW_FILE="$TMP_DIR/raw_results.txt"
TICKERS_FILE="$TMP_DIR/tickers.txt"
COUNTS_FILE="$TMP_DIR/counts.txt"
BIRD_CHECK_LOG="$TMP_DIR/bird-check.log"
TODAY="$(date +%F)"
NOW_ISO="$(python3 - <<'PY'
from datetime import datetime
print(datetime.now().astimezone().isoformat(timespec='seconds'))
PY
)"

cleanup() {
  rm -rf "$TMP_DIR"
}

trap cleanup EXIT

mkdir -p "$(dirname "$WATCHLIST_FILE")"

QUERIES=(
  'AI stocks|-n 15'
  'trending stocks|-n 15'
  'best stock to buy|-n 10'
  '$NVDA OR $TSLA OR $AMD OR $PLTR OR $SMCI OR $ARM|-n 10'
  'stock breakout|-n 10'
)

# Common false-positive cashtags and noise tokens.
NOISE_REGEX='^(A|ALL|AM|ARE|AS|AT|BE|BEST|BUY|CEO|CFO|CIO|CTO|DD|DO|ET|FOR|GO|GOOD|HAS|HIGH|HOT|HOW|I|IN|IS|IT|ITS|JUST|LOW|LONG|ME|MOON|MY|NEW|NO|NOW|OF|ON|OR|OUR|OUT|PE|PM|PT|QQQ|RSI|SO|SPX|TO|TOP|USA|USD|US|VS|WE|YOU)$'

if [[ -f "${BIRD_AUTH_ENV_PATH}" ]]; then
  # shellcheck disable=SC1090
  source "${BIRD_AUTH_ENV_PATH}"
fi

if [[ -z "${AUTH_TOKEN:-}" || -z "${CT0:-}" ]]; then
  if [[ -x "${BIRD_SYNC_AUTH_CMD}" ]]; then
    "${BIRD_SYNC_AUTH_CMD}" --quiet >/dev/null 2>&1 || true
    if [[ -f "${BIRD_AUTH_ENV_PATH}" ]]; then
      # shellcheck disable=SC1090
      source "${BIRD_AUTH_ENV_PATH}"
    fi
  fi
fi

BIRD_ARGS=()
if [[ -z "${AUTH_TOKEN:-}" || -z "${CT0:-}" ]]; then
  BIRD_ARGS+=(--cookie-source "${BIRD_COOKIE_SOURCE}")
  if [[ -n "${BIRD_CHROME_PROFILE_DIR}" ]]; then
    BIRD_ARGS+=(--chrome-profile-dir "${BIRD_CHROME_PROFILE_DIR}")
  fi
fi

if ! command -v bird >/dev/null 2>&1; then
  echo "X/Twitter refresh unavailable: bird CLI is not installed. Using the previous dynamic watchlist."
  exit 0
fi

run_bird_check() {
  if (( ${#BIRD_ARGS[@]} )); then
    bird "${BIRD_ARGS[@]}" check
  else
    bird check
  fi
}

if ! run_bird_check >"${BIRD_CHECK_LOG}" 2>&1; then
  if [[ -x "${BIRD_SYNC_AUTH_CMD}" ]]; then
    "${BIRD_SYNC_AUTH_CMD}" --quiet >/dev/null 2>&1 || true
    if [[ -f "${BIRD_AUTH_ENV_PATH}" ]]; then
      unset AUTH_TOKEN CT0 || true
      # shellcheck disable=SC1090
      source "${BIRD_AUTH_ENV_PATH}"
      BIRD_ARGS=()
    fi
  fi
  if ! run_bird_check >"${BIRD_CHECK_LOG}" 2>&1; then
    echo "X/Twitter auth unavailable; using the previous dynamic watchlist. Run cxauth to repair and rerun cday/cnight if you want fresh X input."
    sed -n '1,6p' "${BIRD_CHECK_LOG}" | sed 's/^/  /'
    echo "Tip: if browser cookie extraction is unreliable on this host, export AUTH_TOKEN/CT0 once and run ./tools/stock-discovery/sync_bird_auth.sh to persist them privately."
    exit 0
  fi
fi

run_query() {
  local query="$1"
  local limit_flag="$2"

  if (( ${#BIRD_ARGS[@]} )); then
    if bird "${BIRD_ARGS[@]}" search "$query" $limit_flag >>"$RAW_FILE" 2>/dev/null; then
      return 0
    fi
  elif bird search "$query" $limit_flag >>"$RAW_FILE" 2>/dev/null; then
    return 0
  fi

  return 1
}

: >"$RAW_FILE"
for item in "${QUERIES[@]}"; do
  IFS='|' read -r q limit_flag <<<"$item"
  run_query "$q" "$limit_flag" || true
done

if [[ ! -s "$RAW_FILE" ]]; then
  echo "X/Twitter refresh returned no usable trend data; keeping the previous dynamic watchlist."
  exit 0
fi

# Extract cashtags: $ followed by 1-5 letters. Convert to uppercase ticker symbols.
grep -Eo '\$[A-Za-z]{1,5}' "$RAW_FILE" 2>/dev/null \
  | tr -d '$' \
  | tr '[:lower:]' '[:upper:]' \
  | grep -Ev "$NOISE_REGEX" \
  >"$TICKERS_FILE" || true

if [[ -s "$TICKERS_FILE" ]]; then
  sort "$TICKERS_FILE" | uniq -c | awk '{print $2" "$1}' >"$COUNTS_FILE"
else
  : >"$COUNTS_FILE"
fi

python3 - "$WATCHLIST_FILE" "$COUNTS_FILE" "$TODAY" "$NOW_ISO" <<'PY'
import json
import sys
from pathlib import Path
from datetime import datetime, date, timedelta

watchlist_path = Path(sys.argv[1])
counts_path = Path(sys.argv[2])
today_str = sys.argv[3]
now_iso = sys.argv[4]
today = date.fromisoformat(today_str)

existing = {
    "updated_at": now_iso,
    "source": "x_twitter_sweep",
    "tickers": []
}

if watchlist_path.exists():
    try:
        existing = json.loads(watchlist_path.read_text())
        if not isinstance(existing, dict):
            existing = {"updated_at": now_iso, "source": "x_twitter_sweep", "tickers": []}
    except Exception:
        existing = {"updated_at": now_iso, "source": "x_twitter_sweep", "tickers": []}

# Load previous entries keyed by symbol.
by_symbol = {}
for item in existing.get("tickers", []):
    symbol = str(item.get("symbol", "")).upper().strip()
    if not symbol:
        continue
    mentions = int(item.get("mentions", 0) or 0)
    first_seen = str(item.get("first_seen", today_str))
    last_seen = str(item.get("last_seen", today_str))
    by_symbol[symbol] = {
        "symbol": symbol,
        "mentions": max(0, mentions),
        "first_seen": first_seen,
        "last_seen": last_seen,
    }

# Merge fresh counts.
if counts_path.exists():
    for line in counts_path.read_text().splitlines():
        line = line.strip()
        if not line:
            continue
        parts = line.split()
        if len(parts) != 2:
            continue
        symbol, count_raw = parts
        try:
            count = int(count_raw)
        except ValueError:
            continue
        symbol = symbol.upper().strip()
        if not symbol:
            continue

        if symbol in by_symbol:
            by_symbol[symbol]["mentions"] += count
            by_symbol[symbol]["last_seen"] = today_str
        else:
            by_symbol[symbol] = {
                "symbol": symbol,
                "mentions": count,
                "first_seen": today_str,
                "last_seen": today_str,
            }

# Prune stale entries not seen in 7+ days.
cutoff = today - timedelta(days=7)
pruned = []
for item in by_symbol.values():
    try:
        last_seen_date = date.fromisoformat(item["last_seen"])
    except Exception:
        last_seen_date = today
    if last_seen_date >= cutoff:
        pruned.append(item)

pruned.sort(key=lambda x: (-int(x.get("mentions", 0)), x.get("symbol", "")))

result = {
    "updated_at": now_iso,
    "source": "x_twitter_sweep",
    "tickers": pruned,
}

watchlist_path.write_text(json.dumps(result, indent=2) + "\n")
print(f"Wrote {watchlist_path} with {len(pruned)} tickers")
PY
