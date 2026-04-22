#!/bin/bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

pass() { echo "PASS: $1"; }
fail() { echo "FAIL: $1"; exit 1; }

assert_file_contains() {
  local name="$1"
  local needle="$2"
  local file_path="$3"
  if grep -Fq "$needle" "$file_path"; then
    pass "$name"
  else
    fail "$name (missing '$needle' in $file_path)"
  fi
}

assert_file_empty() {
  local name="$1"
  local file_path="$2"
  if [[ ! -s "$file_path" ]]; then
    pass "$name"
  else
    fail "$name (expected empty $file_path)"
  fi
}

BIN_DIR="$TMP_DIR/bin"
mkdir -p "$BIN_DIR"

cat >"$BIN_DIR/psql" <<'EOF'
#!/bin/bash
exit 0
EOF
chmod +x "$BIN_DIR/psql"

cat >"$BIN_DIR/curl" <<'EOF'
#!/bin/bash
set -euo pipefail

out=""
url=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    -o)
      out="$2"
      shift 2
      ;;
    -w)
      shift 2
      ;;
    --max-time)
      shift 2
      ;;
    -s|-S|-sS)
      shift
      ;;
    *)
      url="$1"
      shift
      ;;
  esac
done

scenario="${WATCHDOG_PROVIDER_HEALTH_SCENARIO:-}"

case "$scenario" in
  whoop_auth_alert)
    if [[ "$url" == *"/whoop/health" ]]; then
      printf '%s\n' '{"status":"healthy","auth_alert":{"active":true,"consecutive_failures":3,"last_error":"refresh token endpoint returned status 400","updated_at":"2026-04-22T12:51:56.655Z"}}' >"$out"
      printf '200'
      exit 0
    fi
    ;;
  tonal_unhealthy)
    if [[ "$url" == *"/tonal/health" ]]; then
      printf '%s\n' '{"status":"unhealthy","details":"auth failed: 401 Unauthorized","auth_alert":{"active":true,"consecutive_failures":3,"last_error":"auth failed: 401 Unauthorized","updated_at":"2026-04-22T12:51:56.655Z"}}' >"$out"
      printf '503'
      exit 0
    fi
    ;;
  provider_unreachable)
    exit 7
    ;;
esac

printf '000'
EOF
chmod +x "$BIN_DIR/curl"

run_scenario() {
  local scenario="$1"
  local check_name="$2"
  local label="$3"
  local path="$4"
  local scenario_dir="$TMP_DIR/$scenario"
  mkdir -p "$scenario_dir"

  PATH="$BIN_DIR:$PATH" \
  STATE_FILE="$scenario_dir/state.json" \
  WATCHDOG_PROVIDER_HEALTH_SCENARIO="$scenario" \
  bash -c "source '$ROOT_DIR/watchdog.sh'; PATH='$BIN_DIR':\"\$PATH\"; ALERTS=''; LOGS=''; check_provider_auth_health '$check_name' '$label' 'http://localhost:3033$path'; printf '%s' \"\$ALERTS\" >'$scenario_dir/output.txt'"
}

run_scenario whoop_auth_alert whoop Whoop /whoop/health
assert_file_contains "whoop auth alert triggers critical alert" "Whoop auth/readiness is unhealthy" "$TMP_DIR/whoop_auth_alert/output.txt"

run_scenario tonal_unhealthy tonal Tonal /tonal/health
assert_file_contains "tonal unhealthy triggers critical alert" "Tonal auth/readiness is unhealthy" "$TMP_DIR/tonal_unhealthy/output.txt"

run_scenario provider_unreachable whoop Whoop /whoop/health
assert_file_empty "provider unreachable stays silent because market-data owns reachability" "$TMP_DIR/provider_unreachable/output.txt"

echo "All provider auth watchdog tests passed."
