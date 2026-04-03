"""Hot/warm/cold research runtime helpers."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from research.artifacts import build_research_artifact, validate_research_artifact


def write_research_artifact(*, root: Path, filename: str, payload: dict[str, Any]) -> Path:
    validate_research_artifact(payload)
    root.mkdir(parents=True, exist_ok=True)
    path = root / filename
    path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    return path


def read_hot_research_artifact(*, root: Path, filename: str, now: datetime | None = None) -> dict[str, Any] | None:
    path = root / filename
    if not path.exists():
        return None
    payload = json.loads(path.read_text(encoding="utf-8"))
    validate_research_artifact(payload)
    state = classify_research_freshness(payload, now=now)
    if state["state"] == "stale_unusable":
        return None
    enriched = dict(payload)
    enriched["freshness_state"] = state["state"]
    enriched["freshness_age_seconds"] = state["age_seconds"]
    return enriched


def classify_research_freshness(payload: dict[str, Any], *, now: datetime | None = None) -> dict[str, Any]:
    current = now or datetime.now(timezone.utc)
    known_at = datetime.fromisoformat(str(payload.get("known_at")).replace("Z", "+00:00"))
    if known_at.tzinfo is None:
        known_at = known_at.replace(tzinfo=timezone.utc)
    age_seconds = max((current.astimezone(timezone.utc) - known_at.astimezone(timezone.utc)).total_seconds(), 0.0)
    ttl = int(payload.get("freshness_ttl_seconds") or 0)
    if age_seconds <= ttl:
        state = "fresh"
    elif age_seconds <= ttl * 2:
        state = "stale_usable"
    else:
        state = "stale_unusable"
    return {"state": state, "age_seconds": age_seconds}


def build_research_runtime_snapshot(
    *,
    root: Path,
    generated_at: str,
    hot_contracts: list[dict[str, Any]] | None = None,
    warm_registry: list[dict[str, Any]] | None = None,
    cold_registry: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    hot_rows = [_runtime_row(item) for item in (hot_contracts or [])]
    warm_rows = [_runtime_row(item) for item in (warm_registry or [])]
    cold_rows = [_runtime_row(item) for item in (cold_registry or [])]
    snapshot = {
        "artifact_family": "research_runtime_snapshot",
        "schema_version": 1,
        "generated_at": generated_at,
        "root": str(root),
        "hot_path_reads": hot_rows,
        "warm_lane_registry": warm_rows,
        "cold_lane_registry": cold_rows,
    }
    return snapshot


def build_hot_contract(
    *,
    artifact_type: str,
    producer: str,
    known_at: str,
    generated_at: str,
    freshness_ttl_seconds: int,
    payload: dict[str, Any],
    source_owner: str = "ts",
) -> dict[str, Any]:
    return build_research_artifact(
        artifact_type=artifact_type,
        producer=producer,
        generated_at=generated_at,
        known_at=known_at,
        freshness_ttl_seconds=freshness_ttl_seconds,
        health_status="ok",
        payload=payload,
        provenance={"consumer_lane": "hot"},
        source_owner=source_owner,
        runtime_lane="hot",
    )


def _runtime_row(payload: dict[str, Any]) -> dict[str, Any]:
    validate_research_artifact(payload)
    return {
        "artifact_type": payload["artifact_type"],
        "producer": payload["producer"],
        "runtime_lane": payload["runtime_lane"],
        "source_owner": payload["source_owner"],
        "known_at": payload["known_at"],
        "freshness_ttl_seconds": payload["freshness_ttl_seconds"],
        "health_status": payload["health_status"],
    }
