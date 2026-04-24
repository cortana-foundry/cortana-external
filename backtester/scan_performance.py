"""Strategy scan timing artifacts for operator performance debugging."""

from __future__ import annotations

import json
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, Mapping


def build_scan_performance_artifact(
    *,
    strategy: str,
    generated_at: str | None,
    phase_timings: Mapping[str, float],
    nested_timings: Mapping[str, float] | None = None,
    counters: Mapping[str, Any] | None = None,
) -> dict[str, Any]:
    total_seconds = round(sum(float(value or 0.0) for value in phase_timings.values()), 3)
    top_phases = sorted(
        [{"name": key, "seconds": round(float(value or 0.0), 3)} for key, value in phase_timings.items()],
        key=lambda row: row["seconds"],
        reverse=True,
    )
    return {
        "artifact_family": "strategy_scan_performance",
        "schema_version": 1,
        "generated_at": generated_at or datetime.now(UTC).isoformat(),
        "strategy": strategy,
        "total_seconds": total_seconds,
        "phase_timings": {key: round(float(value or 0.0), 3) for key, value in phase_timings.items()},
        "nested_timings": {key: round(float(value or 0.0), 3) for key, value in (nested_timings or {}).items()},
        "top_phases": top_phases[:5],
        "counters": dict(counters or {}),
    }


def save_scan_performance_artifact(
    *,
    strategy: str,
    generated_at: str | None,
    phase_timings: Mapping[str, float],
    nested_timings: Mapping[str, float] | None = None,
    counters: Mapping[str, Any] | None = None,
    root: Path | None = None,
) -> Path:
    base = (root or Path(__file__).resolve().parent).expanduser()
    target = base / ".cache" / "trade_lifecycle" / f"scan_performance_{strategy}_latest.json"
    payload = build_scan_performance_artifact(
        strategy=strategy,
        generated_at=generated_at,
        phase_timings=phase_timings,
        nested_timings=nested_timings,
        counters=counters,
    )
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    latest = target.with_name("scan_performance_latest.json")
    latest.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    return target
