"""Machine-readable opportunity-cost and veto-effectiveness summaries."""

from __future__ import annotations

import json
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable, Optional

from evaluation.prediction_accuracy import default_prediction_root

SCHEMA_VERSION = 1
DEFAULT_HORIZON_KEY = "5d"


def build_decision_review_artifact(
    *,
    root: Optional[Path] = None,
    horizon_key: str = DEFAULT_HORIZON_KEY,
) -> dict:
    base = root or default_prediction_root()
    records = _load_settled_records(base)
    artifact = {
        "schema_version": SCHEMA_VERSION,
        "artifact_family": "decision_review_summary",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "horizon_key": horizon_key,
        "record_count": len(records),
        "opportunity_cost": _build_opportunity_cost_summary(records, horizon_key=horizon_key),
        "decision_paths": _build_decision_path_summary(records, horizon_key=horizon_key),
        "veto_effectiveness": _build_veto_effectiveness_summary(records, horizon_key=horizon_key),
    }
    reports_dir = base / "reports"
    reports_dir.mkdir(parents=True, exist_ok=True)
    (reports_dir / "decision-review-latest.json").write_text(json.dumps(artifact, indent=2), encoding="utf-8")
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
            records.append(normalized)
    return records


def _build_opportunity_cost_summary(records: Iterable[dict], *, horizon_key: str) -> dict:
    rows: list[dict] = []
    for action in ("WATCH", "NO_BUY"):
        bucket = [record for record in records if str(record.get("action") or "").upper() == action]
        matured = [
            (record, _safe_float((record.get("forward_returns_pct") or {}).get(horizon_key)))
            for record in bucket
        ]
        matured = [(record, value) for record, value in matured if value is not None]
        missed = [(record, value) for record, value in matured if value > 0]
        overblocked = [
            (record, value)
            for record, value in missed
            if _decision_path_tags(record) and not _path_is_downgrade_only(_decision_path_tags(record))
        ]
        rows.append(
            {
                "action": action,
                "count": len(bucket),
                "matured_count": len(matured),
                "missed_winner_count": len(missed),
                "overblock_count": len(overblocked),
                "missed_winner_rate": _ratio(len(missed), len(matured)),
                "overblock_rate": _ratio(len(overblocked), len(matured)),
                "avg_missed_return_pct": _avg([value for _, value in missed]),
                "top_missed_symbols": [
                    {
                        "symbol": str(record.get("symbol") or ""),
                        "strategy": str(record.get("strategy") or "unknown"),
                        "return_pct": round(value, 3),
                    }
                    for record, value in sorted(missed, key=lambda item: item[1], reverse=True)[:5]
                ],
            }
        )
    return {"by_action": rows}


def _build_decision_path_summary(records: Iterable[dict], *, horizon_key: str) -> list[dict]:
    buckets: dict[tuple[str, str], dict[str, object]] = {}
    for record in records:
        action = str(record.get("action") or "UNKNOWN").upper()
        if action not in {"WATCH", "NO_BUY"}:
            continue
        path = _decision_path(record)
        bucket = buckets.setdefault(
            (action, path),
            {
                "action": action,
                "path": path,
                "count": 0,
                "matured_count": 0,
                "missed_winner_count": 0,
                "preserved_bad_outcome_count": 0,
                "return_values": [],
            },
        )
        bucket["count"] = int(bucket["count"]) + 1
        value = _safe_float((record.get("forward_returns_pct") or {}).get(horizon_key))
        if value is None:
            continue
        bucket["matured_count"] = int(bucket["matured_count"]) + 1
        cast_values = list(bucket["return_values"])
        cast_values.append(value)
        bucket["return_values"] = cast_values
        if value > 0:
            bucket["missed_winner_count"] = int(bucket["missed_winner_count"]) + 1
        else:
            bucket["preserved_bad_outcome_count"] = int(bucket["preserved_bad_outcome_count"]) + 1

    rows: list[dict] = []
    for _, bucket in sorted(buckets.items(), key=lambda item: (item[0][0], item[0][1])):
        matured_count = int(bucket["matured_count"])
        return_values = list(bucket["return_values"])
        rows.append(
            {
                "action": bucket["action"],
                "path": bucket["path"],
                "count": int(bucket["count"]),
                "matured_count": matured_count,
                "missed_winner_count": int(bucket["missed_winner_count"]),
                "preserved_bad_outcome_count": int(bucket["preserved_bad_outcome_count"]),
                "missed_winner_rate": _ratio(int(bucket["missed_winner_count"]), matured_count),
                "preserved_bad_outcome_rate": _ratio(int(bucket["preserved_bad_outcome_count"]), matured_count),
                "avg_return_pct": _avg(return_values),
            }
        )
    return rows


def _build_veto_effectiveness_summary(records: Iterable[dict], *, horizon_key: str) -> list[dict]:
    buckets: dict[str, dict[str, object]] = {}
    for record in records:
        vetoes = _normalize_vetoes(record.get("vetoes"))
        if not vetoes:
            continue
        value = _safe_float((record.get("forward_returns_pct") or {}).get(horizon_key))
        for veto in vetoes:
            bucket = buckets.setdefault(
                veto,
                {
                    "veto": veto,
                    "count": 0,
                    "matured_count": 0,
                    "blocked_winner_count": 0,
                    "preserved_bad_outcome_count": 0,
                    "return_values": [],
                },
            )
            bucket["count"] = int(bucket["count"]) + 1
            if value is None:
                continue
            bucket["matured_count"] = int(bucket["matured_count"]) + 1
            cast_values = list(bucket["return_values"])
            cast_values.append(value)
            bucket["return_values"] = cast_values
            if value > 0:
                bucket["blocked_winner_count"] = int(bucket["blocked_winner_count"]) + 1
            else:
                bucket["preserved_bad_outcome_count"] = int(bucket["preserved_bad_outcome_count"]) + 1

    rows: list[dict] = []
    for veto, bucket in sorted(buckets.items()):
        matured_count = int(bucket["matured_count"])
        return_values = list(bucket["return_values"])
        rows.append(
            {
                "veto": veto,
                "count": int(bucket["count"]),
                "matured_count": matured_count,
                "blocked_winner_count": int(bucket["blocked_winner_count"]),
                "preserved_bad_outcome_count": int(bucket["preserved_bad_outcome_count"]),
                "blocked_winner_rate": _ratio(int(bucket["blocked_winner_count"]), matured_count),
                "preserved_bad_outcome_rate": _ratio(int(bucket["preserved_bad_outcome_count"]), matured_count),
                "avg_return_pct": _avg(return_values),
            }
        )
    return rows


def _decision_path(record: dict) -> str:
    tags = _decision_path_tags(record)
    if tags:
        return "+".join(tags)
    action = str(record.get("action") or "UNKNOWN").upper()
    if action == "WATCH":
        return "downgrade:watch_without_explicit_veto"
    if action == "NO_BUY":
        return "downgrade:no_buy_without_explicit_veto"
    return "decision:buy"


def _decision_path_tags(record: dict) -> list[str]:
    return [f"veto:{tag}" for tag in _normalize_vetoes(record.get("vetoes"))]


def _path_is_downgrade_only(tags: list[str]) -> bool:
    return not tags


def _normalize_vetoes(value: object) -> list[str]:
    if not isinstance(value, list):
        return []
    normalized = []
    for item in value:
        text = str(item or "").strip().lower().replace(" ", "_")
        if text:
            normalized.append(text)
    return sorted(set(normalized))


def _safe_float(value: object) -> float | None:
    try:
        numeric = float(value)
    except (TypeError, ValueError):
        return None
    if numeric != numeric:
        return None
    return numeric


def _avg(values: list[float]) -> float | None:
    if not values:
        return None
    return round(sum(values) / len(values), 3)


def _ratio(numerator: int, denominator: int) -> float | None:
    if denominator <= 0:
        return None
    return round(numerator / denominator, 4)
