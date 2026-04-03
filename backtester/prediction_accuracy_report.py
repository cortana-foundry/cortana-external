#!/usr/bin/env python3
"""Settle logged alert predictions and write a compact accuracy artifact."""

from __future__ import annotations

import argparse
import json

from evaluation.decision_review_metrics import build_decision_review_artifact
from evaluation.prediction_accuracy import build_prediction_accuracy_summary, settle_prediction_snapshots


def main() -> None:
    parser = argparse.ArgumentParser(description="Settle prediction snapshots and build an accuracy artifact")
    parser.add_argument("--json", action="store_true", help="Emit summary as JSON")
    args = parser.parse_args()

    settle_prediction_snapshots()
    summary = build_prediction_accuracy_summary()
    build_decision_review_artifact()

    if args.json:
        print(json.dumps(summary, indent=2))
        return

    print("Prediction accuracy")
    print(f"Snapshots settled: {int(summary.get('snapshot_count', 0) or 0)}")
    print(f"Records logged: {int(summary.get('record_count', 0) or 0)}")
    settlement_status_counts = summary.get("settlement_status_counts") or {}
    if settlement_status_counts:
        print("Settlement states: " + _format_counts(settlement_status_counts))
    maturity_state_counts = summary.get("maturity_state_counts") or {}
    if maturity_state_counts:
        print("Maturity states: " + _format_counts(maturity_state_counts))
    horizon_status = summary.get("horizon_status") or {}
    if horizon_status:
        parts = []
        for horizon_key, status in sorted(horizon_status.items()):
            if not isinstance(status, dict):
                continue
            parts.append(
                f"{horizon_key}: matured {int(status.get('matured', 0) or 0)}"
                f" | pending {int(status.get('pending', 0) or 0)}"
                f" | incomplete {int(status.get('incomplete', 0) or 0)}"
            )
        if parts:
            print("Settlement coverage: " + " ; ".join(parts))
    validation_grade_counts = summary.get("validation_grade_counts") or {}
    if validation_grade_counts:
        grade_parts = []
        for key in (
            "signal_validation_grade",
            "entry_validation_grade",
            "execution_validation_grade",
            "trade_validation_grade",
        ):
            counts = validation_grade_counts.get(key)
            if not isinstance(counts, dict) or not counts:
                continue
            label = key.replace("_grade", "").replace("_", " ")
            grade_parts.append(f"{label}: {_format_counts(counts)}")
        if grade_parts:
            print("Validation grades: " + " ; ".join(grade_parts))
    rows = summary.get("summary") or []
    if not rows:
        print("No settled prediction samples yet.")
        return
    print("")
    print("By strategy/action")
    for row in rows:
        print(_format_summary_row(row, key_fields=("strategy", "action")))

    strategy_rows = summary.get("by_strategy") or []
    if strategy_rows:
        print("")
        print("By strategy")
        for row in strategy_rows:
            print(_format_summary_row(row, key_fields=("strategy",)))

    action_rows = summary.get("by_action") or []
    if action_rows:
        print("")
        print("By action")
        for row in action_rows:
            print(_format_summary_row(row, key_fields=("action",)))

    regime_rows = summary.get("by_regime") or []
    if regime_rows:
        print("")
        print("By regime")
        for row in regime_rows:
            print(_format_summary_row(row, key_fields=("strategy", "market_regime", "action")))

    confidence_rows = summary.get("by_confidence_bucket") or []
    if confidence_rows:
        print("")
        print("By confidence bucket")
        for row in confidence_rows:
            print(_format_summary_row(row, key_fields=("strategy", "confidence_bucket", "action")))

    rolling_summary = summary.get("rolling_summary") or {}
    if rolling_summary:
        print("")
        print("Rolling windows")
        for window_key in ("20", "50", "100"):
            payload = rolling_summary.get(window_key)
            if not isinstance(payload, dict):
                continue
            requested = int(payload.get("requested_window", 0) or 0)
            considered = int(payload.get("records_considered", 0) or 0)
            partial = bool(payload.get("is_partial_window"))
            qualifier = " (partial)" if partial else ""
            print(f"Latest {requested} samples{qualifier}: {considered} records")
            window_rows = payload.get("summary") or []
            if not window_rows:
                print("  no settled records")
                continue
            for row in window_rows:
                print("  " + _format_summary_row(row, key_fields=("strategy", "action")))


def _format_summary_row(row: dict, *, key_fields: tuple[str, ...]) -> str:
    parts = [" ".join(str(row.get(field) or "unknown") for field in key_fields)]
    for horizon_key, metrics in row.items():
        if horizon_key in set(key_fields) or not isinstance(metrics, dict):
            continue
        decision_accuracy = float(metrics.get("decision_accuracy", 0.0) or 0.0)
        decision_label = str(metrics.get("decision_accuracy_label") or "decision_accuracy")
        drawdown = metrics.get("avg_max_drawdown_pct")
        runup = metrics.get("avg_max_runup_pct")
        segment = (
            f"{horizon_key}: n={int(metrics.get('samples', 0) or 0)} "
            f"avg={float(metrics.get('avg_return_pct', 0.0) or 0.0):+.2f}% "
            f"median={float(metrics.get('median_return_pct', 0.0) or 0.0):+.2f}% "
            f"hit={float(metrics.get('hit_rate', 0.0) or 0.0):.0%} "
            f"{decision_label}={decision_accuracy:.0%}"
        )
        extras = []
        if isinstance(drawdown, (int, float)):
            extras.append(f"avg drawdown {float(drawdown):+.2f}%")
        if isinstance(runup, (int, float)):
            extras.append(f"avg runup {float(runup):+.2f}%")
        if extras:
            segment += " | " + " | ".join(extras)
        parts.append(segment)
    return " | ".join(parts)


def _format_counts(counts: dict) -> str:
    parts = []
    for key, value in sorted(counts.items()):
        parts.append(f"{key} {int(value or 0)}")
    return " | ".join(parts)


if __name__ == "__main__":
    main()
