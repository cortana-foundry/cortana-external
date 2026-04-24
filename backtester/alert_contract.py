"""Stable Telegram alert contracts and receipt policy."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from artifact_schema import assert_valid_trading_artifact

SCHEMA_VERSION = 1

ALERT_TYPES: dict[str, dict[str, str]] = {
    "advisor_snapshot": {"severity": "high", "dedupe": "trading_advisor:{run_id}"},
    "buy_candidate": {"severity": "critical", "dedupe": "buy_candidate:{symbol}:{strategy}"},
    "sell_candidate": {"severity": "critical", "dedupe": "sell_candidate:{symbol}:{strategy}"},
    "watchdog": {"severity": "warning", "dedupe": "watchdog:{check}"},
    "degraded_runtime": {"severity": "warning", "dedupe": "degraded_runtime:{reason}"},
}


def build_alert_contract(alert_type: str, **fields: Any) -> dict[str, Any]:
    spec = ALERT_TYPES.get(alert_type)
    if spec is None:
        raise ValueError(f"unknown alert_type: {alert_type}")
    payload = {
        "artifact_family": "telegram_alert_contract",
        "schema_version": SCHEMA_VERSION,
        "generated_at": fields.pop("generated_at", None) or datetime.now(UTC).isoformat(),
        "provider": "telegram",
        "alert_type": alert_type,
        "severity": spec["severity"],
        "dedupe_key": spec["dedupe"].format(**{key: str(value) for key, value in fields.items()}),
        "receipt_required": True,
        "receipt_policy": {
            "persist": True,
            "fields": ["sent_at", "channel", "severity", "status", "dedupe_key", "message_hash"],
        },
        "context": dict(fields),
    }
    assert_valid_trading_artifact(payload, expected_family="telegram_alert_contract")
    return payload
