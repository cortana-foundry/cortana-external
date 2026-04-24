"""Lightweight schema-version checks for trading artifacts."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Mapping

SUPPORTED_ARTIFACT_SCHEMAS: dict[str, set[int]] = {
    "buy_readiness": {1},
    "control_loop_schedule_check": {1},
    "dipbuyer_profile_report": {1},
    "execution_readiness_check": {1},
    "market_data_freshness_lane": {1},
    "strategy_scan_performance": {1},
    "telegram_alert_contract": {1},
    "trade_lifecycle_report": {1},
    "trade_lifecycle_cycle": {1},
    "trading_actual_state": {1},
    "trading_desired_state": {1},
    "trading_drift_summary": {1},
    "trading_intervention_events": {1},
    "trading_release_unit": {1},
    "trading_reconciliation_actions": {1},
    "trading_run_summary": {1},
    "trading_schedule_registry": {1},
}


@dataclass(frozen=True)
class ArtifactSchemaValidation:
    ok: bool
    family: str | None = None
    schema_version: int | None = None
    reason: str | None = None


def validate_trading_artifact(
    payload: Mapping[str, Any],
    *,
    expected_family: str | None = None,
) -> ArtifactSchemaValidation:
    family_value = payload.get("artifact_family")
    family = str(family_value).strip() if isinstance(family_value, str) else None
    if expected_family and family != expected_family:
        return ArtifactSchemaValidation(False, family, None, f"expected {expected_family}, got {family or 'missing'}")

    if not family:
        return ArtifactSchemaValidation(False, None, None, "missing artifact_family")
    supported = SUPPORTED_ARTIFACT_SCHEMAS.get(family)
    if supported is None:
        return ArtifactSchemaValidation(True, family, _int(payload.get("schema_version")), None)

    version = _int(payload.get("schema_version"))
    if version is None:
        return ArtifactSchemaValidation(False, family, None, f"{family} missing schema_version")
    if version not in supported:
        versions = ", ".join(str(item) for item in sorted(supported))
        return ArtifactSchemaValidation(False, family, version, f"{family} schema_version {version} not in {{{versions}}}")
    return ArtifactSchemaValidation(True, family, version, None)


def assert_valid_trading_artifact(payload: Mapping[str, Any], *, expected_family: str | None = None) -> None:
    result = validate_trading_artifact(payload, expected_family=expected_family)
    if not result.ok:
        raise ValueError(result.reason or "invalid trading artifact schema")


def _int(value: object) -> int | None:
    if isinstance(value, bool):
        return None
    try:
        return int(value)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return None
