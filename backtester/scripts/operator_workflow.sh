#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKTESTER_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

UV_BIN="${UV_BIN:-uv}"
DAYTIME_FLOW_SCRIPT="${DAYTIME_FLOW_SCRIPT:-${SCRIPT_DIR}/daytime_flow.sh}"
NIGHTTIME_FLOW_SCRIPT="${NIGHTTIME_FLOW_SCRIPT:-${SCRIPT_DIR}/nighttime_flow.sh}"
LIVE_WATCH_SCRIPT="${LIVE_WATCH_SCRIPT:-${SCRIPT_DIR}/live_watch.sh}"
WATCHLIST_WATCH_SCRIPT="${WATCHLIST_WATCH_SCRIPT:-${SCRIPT_DIR}/watchlist_watch.sh}"

MODE="${1:-help}"

section() {
  printf '\n== %s ==\n' "$1"
}

usage() {
  cat <<'EOF'
Usage:
  ./scripts/operator_workflow.sh <mode>

Modes:
  premarket  Compact premarket read: market brief + pre-open canary + runtime health
  open       Full daytime operator run
  midday     Quick midday check: market brief + Dip Buyer + watchlist pulse
  close      After-close review: market brief + lifecycle + prediction accuracy
  night      Full nightly operator run
  health     Runtime health / canary / ops-highway check
  help       Show this message
EOF
}

run_python() {
  (
    cd "${BACKTESTER_DIR}"
    "${UV_BIN}" run python "$@"
  )
}

run_script() {
  (
    cd "${BACKTESTER_DIR}"
    "$@"
  )
}

print_intro() {
  local mode="$1"
  case "${mode}" in
    premarket)
      cat <<'EOF'
Workflow: PREMARKET
Goal:
- know whether the day starts as buy, watch, or stand aside

What to read first:
- market brief headline
- warnings
- pre-open canary result

What to look out for:
- provider_cooldown
- cached regime
- tape unavailable
EOF
      ;;
    open)
      cat <<'EOF'
Workflow: OPEN
Goal:
- run the full daytime operator flow after the market opens

What to read first:
- market-data ops
- market regime
- alert posture

What to look out for:
- stand-aside posture
- degraded market inputs
- BUY 0 even if names look interesting
EOF
      ;;
    midday)
      cat <<'EOF'
Workflow: MIDDAY
Goal:
- check whether the tape changed enough to matter

What to read first:
- market brief
- Dip Buyer posture
- watchlist pulse

What to look out for:
- selective-buy breadth
- cooldown warnings
- new watchlist leaders
EOF
      ;;
    close)
      cat <<'EOF'
Workflow: CLOSE
Goal:
- review what the day taught the system

What to read first:
- market brief
- lifecycle review
- prediction accuracy

What to look out for:
- degraded runtime state
- empty lifecycle due to caution
- weak recent decision quality
EOF
      ;;
    night)
      cat <<'EOF'
Workflow: NIGHT
Goal:
- run the full overnight refresh and learning loop

What to read first:
- nightly progress and timing
- prediction accuracy
- trade lifecycle review
EOF
      ;;
    health)
      cat <<'EOF'
Workflow: HEALTH
Goal:
- decide whether a bad result is market truth or machine trouble

What to read first:
- runtime incident markers
- pre-open canary result
- ops-highway warnings
EOF
      ;;
  esac
}

run_premarket() {
  print_intro premarket
  section "Market Brief"
  run_python market_brief_snapshot.py --operator
  section "Pre-Open Canary"
  run_python pre_open_canary.py
  section "Runtime Health"
  run_python runtime_health_snapshot.py --pretty
}

run_open() {
  print_intro open
  section "Daytime Flow"
  run_script "${DAYTIME_FLOW_SCRIPT}"
}

run_midday() {
  print_intro midday
  section "Market Brief"
  run_python market_brief_snapshot.py --operator
  section "Dip Buyer"
  run_python dipbuyer_alert.py --limit "${DIPBUYER_LIMIT:-8}" --min-score "${DIPBUYER_MIN_SCORE:-6}" --universe-size "${DIPBUYER_UNIVERSE_SIZE:-120}"
  section "Watchlist Pulse"
  run_script "${WATCHLIST_WATCH_SCRIPT}"
}

run_close() {
  print_intro close
  section "Market Brief"
  run_python market_brief_snapshot.py --operator
  section "Trade Lifecycle"
  run_python trade_lifecycle_report.py
  section "Prediction Accuracy"
  run_python prediction_accuracy_report.py
}

run_night() {
  print_intro night
  section "Nighttime Flow"
  run_script "${NIGHTTIME_FLOW_SCRIPT}"
}

run_health() {
  print_intro health
  section "Runtime Health"
  run_python runtime_health_snapshot.py --pretty
  section "Pre-Open Canary"
  run_python pre_open_canary.py
  section "Ops Highway"
  run_python ops_highway_snapshot.py --pretty
}

case "${MODE}" in
  premarket)
    run_premarket
    ;;
  open)
    run_open
    ;;
  midday)
    run_midday
    ;;
  close)
    run_close
    ;;
  night)
    run_night
    ;;
  health)
    run_health
    ;;
  help|-h|--help)
    usage
    ;;
  *)
    echo "Unknown mode: ${MODE}" >&2
    echo >&2
    usage >&2
    exit 1
    ;;
esac
