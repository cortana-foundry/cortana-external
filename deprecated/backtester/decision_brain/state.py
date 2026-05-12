"""Canonical decision-state artifacts for market and symbol posture."""

from __future__ import annotations

from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from typing import Any


DECISION_STATE_SCHEMA_VERSION = "decision_state.v1"
ARTIFACT_FAMILY_DECISION_STATE = "decision_state"


class DecisionStateValidationError(ValueError):
    """Raised when a decision-state artifact is incomplete or invalid."""


def _normalize_timestamp(value: object, *, field_name: str) -> str:
    text = str(value or "").strip()
    if not text:
        raise DecisionStateValidationError(f"Decision-state artifacts require {field_name}")
    try:
        parsed = datetime.fromisoformat(text.replace("Z", "+00:00"))
    except ValueError as exc:
        raise DecisionStateValidationError(f"Invalid {field_name}: {text}") from exc
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc).isoformat()


def _coerce_dict(value: object, *, field_name: str) -> dict[str, Any]:
    if value is None:
        return {}
    if not isinstance(value, dict):
        raise DecisionStateValidationError(f"{field_name} must be a dict")
    return dict(value)


@dataclass(frozen=True)
class DecisionStateArtifact:
    artifact_family: str
    schema_version: str
    producer: str
    generated_at: str
    known_at: str
    health_status: str
    degraded_reason: dict[str, Any] = field(default_factory=dict)
    freshness_ttl_seconds: int | None = None
    input_provenance: dict[str, Any] = field(default_factory=dict)
    regime_state: dict[str, Any] = field(default_factory=dict)
    breadth_state: dict[str, Any] = field(default_factory=dict)
    tape_state: dict[str, Any] = field(default_factory=dict)
    narrative_state: dict[str, Any] = field(default_factory=dict)
    symbol_state: dict[str, Any] = field(default_factory=dict)
    position_state: dict[str, Any] = field(default_factory=dict)
    policy_state: dict[str, Any] = field(default_factory=dict)
    ownership: dict[str, Any] = field(default_factory=dict)
    shadow_mode: bool = False

    def __post_init__(self) -> None:
        if self.artifact_family != ARTIFACT_FAMILY_DECISION_STATE:
            raise DecisionStateValidationError("Decision-state artifact_family must be decision_state")
        if not self.producer:
            raise DecisionStateValidationError("Decision-state artifacts require producer")
        if self.health_status not in {"ok", "degraded", "error"}:
            raise DecisionStateValidationError(f"Unsupported decision-state health_status: {self.health_status}")
        if not self.regime_state:
            raise DecisionStateValidationError("Decision-state artifacts require regime_state")
        if not self.policy_state:
            raise DecisionStateValidationError("Decision-state artifacts require policy_state")
        if self.freshness_ttl_seconds is not None and self.freshness_ttl_seconds <= 0:
            raise DecisionStateValidationError("freshness_ttl_seconds must be positive when provided")

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)

    @classmethod
    def from_dict(cls, payload: dict[str, Any]) -> "DecisionStateArtifact":
        return cls(
            artifact_family=str(payload.get("artifact_family") or ARTIFACT_FAMILY_DECISION_STATE),
            schema_version=str(payload.get("schema_version") or DECISION_STATE_SCHEMA_VERSION),
            producer=str(payload.get("producer") or ""),
            generated_at=_normalize_timestamp(payload.get("generated_at"), field_name="generated_at"),
            known_at=_normalize_timestamp(payload.get("known_at"), field_name="known_at"),
            health_status=str(payload.get("health_status") or ""),
            degraded_reason=_coerce_dict(payload.get("degraded_reason"), field_name="degraded_reason"),
            freshness_ttl_seconds=int(payload["freshness_ttl_seconds"]) if payload.get("freshness_ttl_seconds") is not None else None,
            input_provenance=_coerce_dict(payload.get("input_provenance"), field_name="input_provenance"),
            regime_state=_coerce_dict(payload.get("regime_state"), field_name="regime_state"),
            breadth_state=_coerce_dict(payload.get("breadth_state"), field_name="breadth_state"),
            tape_state=_coerce_dict(payload.get("tape_state"), field_name="tape_state"),
            narrative_state=_coerce_dict(payload.get("narrative_state"), field_name="narrative_state"),
            symbol_state=_coerce_dict(payload.get("symbol_state"), field_name="symbol_state"),
            position_state=_coerce_dict(payload.get("position_state"), field_name="position_state"),
            policy_state=_coerce_dict(payload.get("policy_state"), field_name="policy_state"),
            ownership=_coerce_dict(payload.get("ownership"), field_name="ownership"),
            shadow_mode=bool(payload.get("shadow_mode", False)),
        )


def build_default_ownership_map() -> dict[str, Any]:
    return {
        "ts_owned": {
            "market_data": ["quotes", "history", "universe_base"],
            "narrative_fetchers": ["x_watchlist_refresh", "polymarket_materialization"],
            "research_fetchers": ["earnings_calendar", "catalyst_fetch", "transcript_fetch"],
        },
        "python_owned": {
            "synthesis": ["decision_state", "adaptive_weights", "intraday_state_machine"],
            "narrative_overlay": ["narrative_discovery_snapshot", "crowding_nudges"],
            "research_runtime": ["hot_path_reads", "warm_lane_registry", "cold_lane_registry"],
        },
    }


def build_decision_state_artifact(
    *,
    producer: str,
    generated_at: str,
    known_at: str,
    health_status: str,
    regime_state: dict[str, Any],
    policy_state: dict[str, Any],
    breadth_state: dict[str, Any] | None = None,
    tape_state: dict[str, Any] | None = None,
    narrative_state: dict[str, Any] | None = None,
    symbol_state: dict[str, Any] | None = None,
    position_state: dict[str, Any] | None = None,
    degraded_reason: dict[str, Any] | None = None,
    freshness_ttl_seconds: int | None = None,
    input_provenance: dict[str, Any] | None = None,
    ownership: dict[str, Any] | None = None,
    shadow_mode: bool = False,
) -> dict[str, Any]:
    artifact = DecisionStateArtifact(
        artifact_family=ARTIFACT_FAMILY_DECISION_STATE,
        schema_version=DECISION_STATE_SCHEMA_VERSION,
        producer=str(producer or "").strip(),
        generated_at=_normalize_timestamp(generated_at, field_name="generated_at"),
        known_at=_normalize_timestamp(known_at, field_name="known_at"),
        health_status=str(health_status or "").strip().lower(),
        degraded_reason=_coerce_dict(degraded_reason, field_name="degraded_reason"),
        freshness_ttl_seconds=freshness_ttl_seconds,
        input_provenance=_coerce_dict(input_provenance, field_name="input_provenance"),
        regime_state=_coerce_dict(regime_state, field_name="regime_state"),
        breadth_state=_coerce_dict(breadth_state, field_name="breadth_state"),
        tape_state=_coerce_dict(tape_state, field_name="tape_state"),
        narrative_state=_coerce_dict(narrative_state, field_name="narrative_state"),
        symbol_state=_coerce_dict(symbol_state, field_name="symbol_state"),
        position_state=_coerce_dict(position_state, field_name="position_state"),
        policy_state=_coerce_dict(policy_state, field_name="policy_state"),
        ownership=_coerce_dict(ownership or build_default_ownership_map(), field_name="ownership"),
        shadow_mode=shadow_mode,
    )
    return artifact.to_dict()


def validate_decision_state_artifact(payload: dict[str, Any]) -> dict[str, Any]:
    DecisionStateArtifact.from_dict(payload)
    return payload
