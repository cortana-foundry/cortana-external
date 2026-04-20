#!/bin/bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

TMP_ROOT="$(mktemp -d)"
trap 'rm -rf "$TMP_ROOT"' EXIT

mkdir -p "$TMP_ROOT/repo/tools/heartbeat"
touch "$TMP_ROOT/repo/tools/heartbeat/check-heartbeat-health.ts"
export CORTANA_SOURCE_REPO="$TMP_ROOT/repo"
export STATE_FILE="$TMP_ROOT/watchdog-state.json"
export HEARTBEAT_STATE_FILE="$TMP_ROOT/repo/memory/heartbeat-state.json"
mkdir -p "$(dirname "$HEARTBEAT_STATE_FILE")"
printf '%s\n' '{"version":2,"lastHeartbeat":0,"lastChecks":{},"lastRemediationAt":0,"subagentWatchdog":{"lastRun":0,"lastLogged":{}}}' > "$HEARTBEAT_STATE_FILE"

source "$ROOT_DIR/watchdog.sh"

ALERT_TEXT=""
RECOVERY_TEXT=""
LOG_TEXT=""

alert() {
  ALERT_TEXT="$1"
}

recovery_alert() {
  RECOVERY_TEXT="$2"
}

log() {
  LOG_TEXT="$2"
}

pgrep() {
  return 1
}

npx() {
  cat <<'JSON'
{"ok":true,"status":"healthy","lastHeartbeatAgeMs":600000,"summary":"canonical heartbeat state is fresh and valid"}
JSON
}

get_current_timestamp() {
  echo "1000"
}

record_heartbeat_observation() {
  :
}

get_heartbeat_monitor_value() {
  echo ""
}

track_heartbeat_restart() {
  :
}

get_heartbeat_restarts_6h() {
  echo "0"
}

check_heartbeat_health

if [[ -n "$ALERT_TEXT" ]]; then
  echo "FAIL: expected no critical alert, got '$ALERT_TEXT'"
  exit 1
fi

if [[ "$RECOVERY_TEXT" != "Heartbeat health recovered (stable)" ]]; then
  echo "FAIL: expected recovery message, got '$RECOVERY_TEXT'"
  exit 1
fi

if [[ "$LOG_TEXT" != *"Heartbeat healthy via state"* ]]; then
  echo "FAIL: expected state backend log, got '$LOG_TEXT'"
  exit 1
fi

echo "PASS: healthy heartbeat state suppresses no-process false positive"
