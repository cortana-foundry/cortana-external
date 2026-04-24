#!/bin/bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

pass() { echo "PASS: $1"; }
fail() { echo "FAIL: $1"; exit 1; }

ALERT_RECEIPT_PATH="$TMP_DIR/receipts.jsonl"
STATE_FILE="$TMP_DIR/state.json"
source "$ROOT_DIR/watchdog.sh"

record_alert_delivery_receipt "telegram" "warning" "watchdog_digest" "sent" "ok" "hello"

[[ -s "$ALERT_RECEIPT_PATH" ]] || fail "receipt file was not written"
[[ "$(jq -r '.channel' "$ALERT_RECEIPT_PATH")" == "telegram" ]] || fail "channel missing"
[[ "$(jq -r '.dedupe_key' "$ALERT_RECEIPT_PATH")" == "watchdog_digest" ]] || fail "dedupe key missing"
[[ "$(jq -r '.message_hash | length' "$ALERT_RECEIPT_PATH")" == "64" ]] || fail "message hash missing"

pass "alert delivery receipt persisted"
