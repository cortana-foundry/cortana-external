"""Canonical market-data freshness lane artifact."""

from __future__ import annotations

import json
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, Mapping

from artifact_schema import assert_valid_trading_artifact
from readiness.freshness_policy import freshness_policy


def build_market_data_freshness_lane(
    market: object,
    *,
    generated_at: str | datetime | None = None,
    runtime_health: Mapping[str, Any] | None = None,
) -> dict[str, Any]:
    now = _parse_time(generated_at) or datetime.now(UTC)
    max_age_seconds = freshness_policy("market_data").max_age_seconds
    status = str(getattr(market, "status", "ok") or "ok").strip().lower()
    provider_mode = str(getattr(market, "provider_mode", "unknown") or "unknown").strip().lower()
    data_source = str(getattr(market, "data_source", "unknown") or "unknown").strip().lower()
    fallback = bool(getattr(market, "fallback_engaged", False))
    snapshot_age_seconds = _float(getattr(market, "snapshot_age_seconds", 0.0))
    runtime_status = str((runtime_health or {}).get("status") or "").strip().lower()
    incidents = [item for item in (runtime_health or {}).get("incident_markers") or [] if isinstance(item, Mapping)]

    reason = "fresh"
    lane_status = "ok"
    if status != "ok":
        lane_status = "degraded"
        reason = "market_status_degraded"
    if provider_mode in {"cache_fallback", "unavailable"} or data_source in {"cache", "unavailable"} or fallback:
        lane_status = "degraded"
        reason = "cache_only"
    if snapshot_age_seconds > max_age_seconds:
        lane_status = "degraded"
        reason = "stale"
    if runtime_status and runtime_status != "ok":
        lane_status = "degraded"
        reason = "runtime_health_degraded"
    if any(str(item.get("incident_type") or "").lower() == "auth_expired" for item in incidents):
        lane_status = "degraded"
        reason = "auth_expired"
    elif any("streamer" in str(item.get("incident_type") or "").lower() for item in incidents):
        lane_status = "degraded"
        reason = "streamer_down"

    return {
        "artifact_family": "market_data_freshness_lane",
        "schema_version": 1,
        "generated_at": now.isoformat(),
        "status": lane_status,
        "reason": reason,
        "max_age_seconds": max_age_seconds,
        "snapshot_age_seconds": snapshot_age_seconds,
        "provider_mode": provider_mode,
        "data_source": data_source,
        "fallback_engaged": fallback,
        "runtime_status": runtime_status or None,
        "incident_count": len(incidents),
    }


def save_market_data_freshness_lane(
    market: object,
    *,
    generated_at: str | datetime | None = None,
    root: Path | None = None,
    runtime_health: Mapping[str, Any] | None = None,
) -> Path:
    base = (root or Path(__file__).resolve().parent).expanduser()
    target = base / ".cache" / "trade_lifecycle" / "market_data_freshness_latest.json"
    payload = build_market_data_freshness_lane(market, generated_at=generated_at, runtime_health=runtime_health)
    assert_valid_trading_artifact(payload, expected_family="market_data_freshness_lane")
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    return target


def _parse_time(value: object) -> datetime | None:
    if isinstance(value, datetime):
        return value.astimezone(UTC) if value.tzinfo else value.replace(tzinfo=UTC)
    if not isinstance(value, str) or not value.strip():
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
    return parsed.astimezone(UTC) if parsed.tzinfo else parsed.replace(tzinfo=UTC)


def _float(value: object) -> float:
    try:
        return float(value or 0.0)
    except (TypeError, ValueError):
        return 0.0
