"""Benchmark and null-model comparisons for settled prediction artifacts."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable, Optional

from evaluation.prediction_accuracy import default_prediction_root
from outcomes import compare_metrics_to_baseline, summarize_forward_return_metrics

SCHEMA_VERSION = 1
DEFAULT_HORIZON_KEY = "5d"


def build_benchmark_comparison_artifact(
    *,
    root: Optional[Path] = None,
    horizon_key: str = DEFAULT_HORIZON_KEY,
) -> dict:
    base = root or default_prediction_root()
    records = _load_settled_records(base)
    all_metrics = summarize_forward_return_metrics(records, horizon_key=horizon_key)
    action_baselines = {
        action: summarize_forward_return_metrics(
            [record for record in records if str(record.get("action") or "").upper() == action],
            horizon_key=horizon_key,
        )
        for action in sorted({str(record.get("action") or "").upper() for record in records})
        if action
    }

    artifact = {
        "schema_version": SCHEMA_VERSION,
        "artifact_family": "benchmark_comparison_summary",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "horizon_key": horizon_key,
        "record_count": len(records),
        "baselines": {
            "all_predictions": all_metrics,
            "by_action": action_baselines,
        },
        "comparisons": {
            "by_strategy": _build_group_benchmarks(
                records,
                group_fields=("strategy",),
                horizon_key=horizon_key,
                all_baseline=all_metrics,
                action_baselines=action_baselines,
            ),
            "by_strategy_action": _build_group_benchmarks(
                records,
                group_fields=("strategy", "action"),
                horizon_key=horizon_key,
                all_baseline=all_metrics,
                action_baselines=action_baselines,
            ),
            "by_regime": _build_group_benchmarks(
                records,
                group_fields=("strategy", "market_regime", "action"),
                horizon_key=horizon_key,
                all_baseline=all_metrics,
                action_baselines=action_baselines,
            ),
            "by_confidence_bucket": _build_group_benchmarks(
                records,
                group_fields=("strategy", "confidence_bucket", "action"),
                horizon_key=horizon_key,
                all_baseline=all_metrics,
                action_baselines=action_baselines,
            ),
        },
    }
    reports_dir = base / "reports"
    reports_dir.mkdir(parents=True, exist_ok=True)
    (reports_dir / "benchmark-comparison-latest.json").write_text(json.dumps(artifact, indent=2), encoding="utf-8")
    return artifact


def _load_settled_records(base: Path) -> list[dict]:
    records: list[dict] = []
    for path in sorted((base / "settled").glob("*.json")):
        payload = json.loads(path.read_text(encoding="utf-8"))
        strategy = str(payload.get("strategy") or "unknown")
        market_regime = str(payload.get("market_regime") or "unknown")
        for record in payload.get("records") or []:
            normalized = dict(record)
            normalized["strategy"] = strategy
            normalized["market_regime"] = str(record.get("market_regime") or market_regime)
            normalized["action"] = str(record.get("action") or "UNKNOWN").upper()
            normalized["confidence_bucket"] = str(record.get("confidence_bucket") or "unknown")
            normalized["forward_returns"] = dict(record.get("forward_returns") or record.get("forward_returns_pct") or {})
            records.append(normalized)
    return records


def _build_group_benchmarks(
    records: Iterable[dict],
    *,
    group_fields: tuple[str, ...],
    horizon_key: str,
    all_baseline: dict,
    action_baselines: dict[str, dict],
) -> list[dict]:
    grouped: dict[tuple[str, ...], list[dict]] = {}
    for record in records:
        key = tuple(str(record.get(field) or "unknown") for field in group_fields)
        grouped.setdefault(key, []).append(record)

    rows: list[dict] = []
    for key, group_records in sorted(grouped.items()):
        row = {field: value for field, value in zip(group_fields, key)}
        metrics = summarize_forward_return_metrics(group_records, horizon_key=horizon_key)
        action = str(row.get("action") or "").upper()
        same_action_baseline = action_baselines.get(action)
        row.update(
            {
                "metrics": metrics,
                "lift_vs_all_predictions": compare_metrics_to_baseline(metrics, all_baseline),
                "lift_vs_same_action": compare_metrics_to_baseline(metrics, same_action_baseline)
                if same_action_baseline
                else None,
            }
        )
        rows.append(row)
    return rows
