"""Bounded adaptive weighting and confidence-adjustment helpers."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any


def build_adaptive_weight_snapshot(
    *,
    regime_bucket: str,
    session_bucket: str | None = None,
    comparison_artifact: dict[str, Any] | None = None,
    calibration_artifact: dict[str, Any] | None = None,
    previous_snapshot: dict[str, Any] | None = None,
    min_samples: int = 20,
    max_step: float = 0.10,
) -> dict[str, Any]:
    comparisons = _comparison_rows(comparison_artifact)
    calibration_rows = _calibration_rows(calibration_artifact)
    previous_weights = dict((previous_snapshot or {}).get("strategy_weights", {}) or {})
    previous_veto_weights = dict((previous_snapshot or {}).get("veto_weights", {}) or {})

    strategy_weights: dict[str, float] = {}
    sample_depth: dict[str, int] = {}
    notes: list[str] = []
    for row in comparisons:
        strategy = str(row.get("strategy") or "unknown").strip().lower()
        settled = int(row.get("settled_count") or row.get("sample_count") or 0)
        sample_depth[strategy] = settled
        baseline = float(previous_weights.get(strategy, 1.0) or 1.0)
        if settled < min_samples:
            strategy_weights[strategy] = round(baseline, 3)
            notes.append(f"{strategy}: cold-start weight retained")
            continue
        target = _bounded_target_weight(row)
        strategy_weights[strategy] = _smoothed_value(previous=baseline, target=target, max_step=max_step)

    veto_weights: dict[str, float] = {}
    veto_rows = ((comparison_artifact or {}).get("decision_review") or {}).get("veto_effectiveness") or []
    for row in veto_rows:
        veto = str(row.get("veto") or "").strip().lower()
        if not veto:
            continue
        settled = int(row.get("sample_count") or 0)
        baseline = float(previous_veto_weights.get(veto, 1.0) or 1.0)
        if settled < min_samples:
            veto_weights[veto] = round(baseline, 3)
            continue
        decision_accuracy = float(row.get("decision_accuracy") or 0.0)
        target = 1.0 + max(min((decision_accuracy - 0.5) * 0.5, 0.2), -0.2)
        veto_weights[veto] = _smoothed_value(previous=baseline, target=target, max_step=max_step)

    confidence_adjustments: dict[str, float] = {}
    uncertainty_penalties: dict[str, float] = {}
    for bucket_row in calibration_rows:
        bucket = str(bucket_row.get("confidence_bucket") or "unknown").strip().lower()
        settled = int(bucket_row.get("settled_count") or bucket_row.get("sample_count") or 0)
        if not bucket:
            continue
        if settled < min_samples:
            confidence_adjustments[bucket] = 0.0
            uncertainty_penalties[bucket] = 0.0
            continue
        avg_return = float(bucket_row.get("avg_return_pct") or bucket_row.get("mean_return_pct") or 0.0)
        hit_rate = float(bucket_row.get("hit_rate") or 0.0)
        confidence_adjustments[bucket] = round(max(min(avg_return / 10.0, 5.0), -5.0), 2)
        uncertainty_penalties[bucket] = round(max(min((0.55 - hit_rate) * 20.0, 8.0), 0.0), 2)

    return {
        "artifact_family": "adaptive_weight_snapshot",
        "schema_version": 1,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "regime_bucket": str(regime_bucket or "unknown").strip().lower(),
        "session_bucket": str(session_bucket or "unknown").strip().lower(),
        "strategy_weights": strategy_weights,
        "veto_weights": veto_weights,
        "confidence_adjustments": confidence_adjustments,
        "uncertainty_penalties": uncertainty_penalties,
        "sample_depth": sample_depth,
        "bounded_change_rate": {"max_step": max_step, "min_samples": min_samples},
        "notes": notes,
        "shadow_mode": True,
    }


def _comparison_rows(artifact: dict[str, Any] | None) -> list[dict[str, Any]]:
    if not isinstance(artifact, dict):
        return []
    comparisons = (artifact.get("comparisons") or {}).get("by_strategy_action") or []
    return [row for row in comparisons if isinstance(row, dict)]


def _calibration_rows(artifact: dict[str, Any] | None) -> list[dict[str, Any]]:
    if not isinstance(artifact, dict):
        return []
    summary = artifact.get("summary") if isinstance(artifact.get("summary"), dict) else artifact
    rows = summary.get("by_confidence_bucket") or []
    return [row for row in rows if isinstance(row, dict)]


def _bounded_target_weight(row: dict[str, Any]) -> float:
    mean_return = float(row.get("mean_return_pct") or row.get("avg_return_pct") or 0.0)
    hit_rate = float(row.get("hit_rate") or 0.0)
    expectancy = float(row.get("expectancy") or 0.0)
    target = 1.0 + (mean_return / 20.0) + ((hit_rate - 0.5) * 0.5) + (expectancy / 10.0)
    return round(max(min(target, 1.25), 0.75), 3)


def _smoothed_value(*, previous: float, target: float, max_step: float) -> float:
    delta = target - previous
    if delta > max_step:
        target = previous + max_step
    elif delta < -max_step:
        target = previous - max_step
    return round(target, 3)
