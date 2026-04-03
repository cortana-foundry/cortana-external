"""Canonical research artifact contracts with freshness and provenance."""

from __future__ import annotations

from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from typing import Any


RESEARCH_ARTIFACT_SCHEMA_VERSION = "research_artifact.v1"
ARTIFACT_FAMILY_RESEARCH = "research_artifact"


class ResearchArtifactValidationError(ValueError):
    """Raised when a research artifact is incomplete or invalid."""


def _normalize_timestamp(value: object, *, field_name: str) -> str:
    text = str(value or "").strip()
    if not text:
        raise ResearchArtifactValidationError(f"Research artifacts require {field_name}")
    try:
        parsed = datetime.fromisoformat(text.replace("Z", "+00:00"))
    except ValueError as exc:
        raise ResearchArtifactValidationError(f"Invalid {field_name}: {text}") from exc
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc).isoformat()


def _coerce_dict(value: object, *, field_name: str) -> dict[str, Any]:
    if value is None:
        return {}
    if not isinstance(value, dict):
        raise ResearchArtifactValidationError(f"{field_name} must be a dict")
    return dict(value)


@dataclass(frozen=True)
class ResearchArtifact:
    artifact_family: str
    schema_version: str
    artifact_type: str
    producer: str
    generated_at: str
    known_at: str
    freshness_ttl_seconds: int
    health_status: str
    degraded_reason: dict[str, Any] = field(default_factory=dict)
    provenance: dict[str, Any] = field(default_factory=dict)
    payload: dict[str, Any] = field(default_factory=dict)
    source_owner: str = "ts"
    runtime_lane: str = "warm"

    def __post_init__(self) -> None:
        if self.artifact_family != ARTIFACT_FAMILY_RESEARCH:
            raise ResearchArtifactValidationError("Research artifact_family must be research_artifact")
        if not self.artifact_type:
            raise ResearchArtifactValidationError("Research artifacts require artifact_type")
        if not self.producer:
            raise ResearchArtifactValidationError("Research artifacts require producer")
        if self.freshness_ttl_seconds <= 0:
            raise ResearchArtifactValidationError("Research artifacts require positive freshness_ttl_seconds")
        if self.health_status not in {"ok", "degraded", "error"}:
            raise ResearchArtifactValidationError(f"Unsupported research health_status: {self.health_status}")
        if self.source_owner not in {"ts", "python"}:
            raise ResearchArtifactValidationError("source_owner must be ts or python")
        if self.runtime_lane not in {"hot", "warm", "cold"}:
            raise ResearchArtifactValidationError("runtime_lane must be hot, warm, or cold")

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)

    @classmethod
    def from_dict(cls, payload: dict[str, Any]) -> "ResearchArtifact":
        return cls(
            artifact_family=str(payload.get("artifact_family") or ARTIFACT_FAMILY_RESEARCH),
            schema_version=str(payload.get("schema_version") or RESEARCH_ARTIFACT_SCHEMA_VERSION),
            artifact_type=str(payload.get("artifact_type") or ""),
            producer=str(payload.get("producer") or ""),
            generated_at=_normalize_timestamp(payload.get("generated_at"), field_name="generated_at"),
            known_at=_normalize_timestamp(payload.get("known_at"), field_name="known_at"),
            freshness_ttl_seconds=int(payload.get("freshness_ttl_seconds") or 0),
            health_status=str(payload.get("health_status") or ""),
            degraded_reason=_coerce_dict(payload.get("degraded_reason"), field_name="degraded_reason"),
            provenance=_coerce_dict(payload.get("provenance"), field_name="provenance"),
            payload=_coerce_dict(payload.get("payload"), field_name="payload"),
            source_owner=str(payload.get("source_owner") or "ts"),
            runtime_lane=str(payload.get("runtime_lane") or "warm"),
        )


def build_research_artifact(
    *,
    artifact_type: str,
    producer: str,
    generated_at: str,
    known_at: str,
    freshness_ttl_seconds: int,
    health_status: str,
    payload: dict[str, Any],
    degraded_reason: dict[str, Any] | None = None,
    provenance: dict[str, Any] | None = None,
    source_owner: str = "ts",
    runtime_lane: str = "warm",
) -> dict[str, Any]:
    artifact = ResearchArtifact(
        artifact_family=ARTIFACT_FAMILY_RESEARCH,
        schema_version=RESEARCH_ARTIFACT_SCHEMA_VERSION,
        artifact_type=str(artifact_type or "").strip(),
        producer=str(producer or "").strip(),
        generated_at=_normalize_timestamp(generated_at, field_name="generated_at"),
        known_at=_normalize_timestamp(known_at, field_name="known_at"),
        freshness_ttl_seconds=int(freshness_ttl_seconds),
        health_status=str(health_status or "").strip().lower(),
        degraded_reason=_coerce_dict(degraded_reason, field_name="degraded_reason"),
        provenance=_coerce_dict(provenance, field_name="provenance"),
        payload=_coerce_dict(payload, field_name="payload"),
        source_owner=source_owner,
        runtime_lane=runtime_lane,
    )
    return artifact.to_dict()


def validate_research_artifact(payload: dict[str, Any]) -> dict[str, Any]:
    ResearchArtifact.from_dict(payload)
    return payload
