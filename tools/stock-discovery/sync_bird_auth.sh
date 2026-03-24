#!/usr/bin/env bash
set -euo pipefail

QUIET=0
if [[ "${1:-}" == "--quiet" ]]; then
  QUIET=1
fi

BIRD_AUTH_ENV_PATH="${BIRD_AUTH_ENV_PATH:-$HOME/.config/cortana/x-twitter-bird.env}"
BIRD_CHROME_PROFILE_DIR="${BIRD_CHROME_PROFILE_DIR:-$HOME/.openclaw/browser/openclaw/user-data/Default}"
BIRD_COOKIE_SOURCE="${BIRD_COOKIE_SOURCE:-chrome}"
OPENCLAW_BROWSER_PROFILE="${OPENCLAW_BROWSER_PROFILE:-openclaw}"
OPENCLAW_X_URL="${OPENCLAW_X_URL:-https://x.com/home}"
OPENCLAW_WAIT_TIMEOUT_MS="${OPENCLAW_WAIT_TIMEOUT_MS:-20000}"
OPENCLAW_COOKIE_RETRIES="${OPENCLAW_COOKIE_RETRIES:-5}"
OPENCLAW_COOKIE_RETRY_SLEEP_SECS="${OPENCLAW_COOKIE_RETRY_SLEEP_SECS:-1}"
SYNC_LOCK_DIR="${SYNC_LOCK_DIR:-$HOME/.config/cortana/x-twitter-bird.lock}"
SYNC_LOCK_TTL_SECS="${SYNC_LOCK_TTL_SECS:-180}"
SYNC_LOCK_PID_FILE="${SYNC_LOCK_DIR}/pid"

cleanup() {
  rm -f "${SYNC_LOCK_PID_FILE}" 2>/dev/null || true
  rmdir "${SYNC_LOCK_DIR}" 2>/dev/null || true
}

log() {
  if [[ "${QUIET}" != "1" ]]; then
    printf '%s\n' "$*"
  fi
}

is_lock_stale() {
  if [[ ! -f "${SYNC_LOCK_PID_FILE}" ]]; then
    return 0
  fi
  local pid=""
  pid="$(cat "${SYNC_LOCK_PID_FILE}" 2>/dev/null || true)"
  if [[ -n "${pid}" ]] && kill -0 "${pid}" 2>/dev/null; then
    return 1
  fi
  local now
  local mtime
  now="$(date +%s)"
  mtime="$(stat -f %m "${SYNC_LOCK_PID_FILE}" 2>/dev/null || echo 0)"
  if [[ "$((now - mtime))" -ge "${SYNC_LOCK_TTL_SECS}" ]]; then
    return 0
  fi
  return 1
}

if ! mkdir "${SYNC_LOCK_DIR}" 2>/dev/null; then
  if is_lock_stale; then
    rm -rf "${SYNC_LOCK_DIR}" 2>/dev/null || true
    mkdir "${SYNC_LOCK_DIR}"
  else
    log "Another X auth sync is already in progress; skipping duplicate run."
    exit 0
  fi
fi
printf '%s\n' "$$" >"${SYNC_LOCK_PID_FILE}"
trap cleanup EXIT

write_env_file() {
  local auth_token="$1"
  local ct0="$2"
  local dir
  dir="$(dirname "${BIRD_AUTH_ENV_PATH}")"
  mkdir -p "${dir}"
  umask 077
  cat >"${BIRD_AUTH_ENV_PATH}" <<EOF
export AUTH_TOKEN='${auth_token}'
export CT0='${ct0}'
EOF
  chmod 600 "${BIRD_AUTH_ENV_PATH}"
}

parse_openclaw_cookie_dump() {
  python3 - "$@" <<'PY'
import json
import sys

raw = sys.argv[1] if len(sys.argv) > 1 else ""
start = raw.find("[")
if start < 0:
    raise SystemExit(1)
payload = json.loads(raw[start:])
auth = ""
ct0 = ""
for item in payload:
    if not isinstance(item, dict):
        continue
    if item.get("domain") not in {".x.com", ".twitter.com", "x.com", "twitter.com"}:
        continue
    name = item.get("name")
    value = item.get("value")
    if name == "auth_token" and value:
        auth = str(value)
    elif name == "ct0" and value:
        ct0 = str(value)
if auth and ct0:
    print(auth)
    print(ct0)
PY
}

run_bird_check() {
  local auth_token="$1"
  local ct0="$2"
  if ! command -v bird >/dev/null 2>&1; then
    return 1
  fi
  bird check --auth-token "${auth_token}" --ct0 "${ct0}" >/dev/null 2>&1
}

load_existing_env() {
  if [[ -f "${BIRD_AUTH_ENV_PATH}" ]]; then
    # shellcheck disable=SC1090
    source "${BIRD_AUTH_ENV_PATH}"
  fi
}

try_openclaw_sync() {
  local retries="${OPENCLAW_COOKIE_RETRIES}"
  local raw=""
  local parsed=""
  local auth_token_value=""
  local ct0_value=""

  openclaw browser --browser-profile "${OPENCLAW_BROWSER_PROFILE}" start >/dev/null 2>&1 || true
  openclaw browser --browser-profile "${OPENCLAW_BROWSER_PROFILE}" open "${OPENCLAW_X_URL}" >/dev/null 2>&1 || true
  openclaw browser --browser-profile "${OPENCLAW_BROWSER_PROFILE}" wait --url '**x.com/**' --timeout-ms "${OPENCLAW_WAIT_TIMEOUT_MS}" >/dev/null 2>&1 || true

  while (( retries > 0 )); do
    raw="$(openclaw browser --browser-profile "${OPENCLAW_BROWSER_PROFILE}" cookies 2>/dev/null || true)"
    if [[ -n "${raw}" ]]; then
      parsed="$(parse_openclaw_cookie_dump "${raw}" || true)"
      if [[ -n "${parsed}" ]]; then
        auth_token_value="$(printf '%s\n' "${parsed}" | sed -n '1p')"
        ct0_value="$(printf '%s\n' "${parsed}" | sed -n '2p')"
        if [[ -n "${auth_token_value}" && -n "${ct0_value}" ]] && run_bird_check "${auth_token_value}" "${ct0_value}"; then
          write_env_file "${auth_token_value}" "${ct0_value}"
          log "Saved X auth from OpenClaw browser to ${BIRD_AUTH_ENV_PATH}"
          return 0
        fi
      fi
    fi
    retries=$((retries - 1))
    sleep "${OPENCLAW_COOKIE_RETRY_SLEEP_SECS}"
  done

  return 1
}

if [[ -n "${AUTH_TOKEN:-}" && -n "${CT0:-}" ]]; then
  if run_bird_check "${AUTH_TOKEN}" "${CT0}"; then
    write_env_file "${AUTH_TOKEN}" "${CT0}"
    log "Saved AUTH_TOKEN/CT0 to ${BIRD_AUTH_ENV_PATH}"
    exit 0
  fi
fi

load_existing_env
if [[ -n "${AUTH_TOKEN:-}" && -n "${CT0:-}" ]]; then
  if run_bird_check "${AUTH_TOKEN}" "${CT0}"; then
    log "bird auth is already present at ${BIRD_AUTH_ENV_PATH}"
    exit 0
  fi
fi

if command -v openclaw >/dev/null 2>&1; then
  if try_openclaw_sync; then
    exit 0
  fi
fi

CHECK_OUTPUT="$(bird check --cookie-source "${BIRD_COOKIE_SOURCE}" --chrome-profile-dir "${BIRD_CHROME_PROFILE_DIR}" 2>&1 || true)"

log "Unable to persist bird auth automatically from Chrome on this host."
log "${CHECK_OUTPUT}"
log "Chrome has X cookies, but CLI browser-cookie extraction is failing here."
log "If you export AUTH_TOKEN and CT0 in your current shell once, rerun this command and it will save them privately to ${BIRD_AUTH_ENV_PATH}."
exit 1
