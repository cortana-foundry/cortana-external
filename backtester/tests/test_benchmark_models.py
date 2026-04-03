from __future__ import annotations

import json

from evaluation.benchmark_models import build_benchmark_comparison_artifact


def test_benchmark_artifact_is_machine_readable_and_non_mutating(tmp_path):
    settled_dir = tmp_path / "settled"
    settled_dir.mkdir(parents=True, exist_ok=True)
    payload = {
        "strategy": "dip_buyer",
        "market_regime": "correction",
        "records": [
            {
                "symbol": "AAA",
                "action": "BUY",
                "confidence_bucket": "high",
                "forward_returns": {"5d": 0.04},
            },
            {
                "symbol": "BBB",
                "action": "NO_BUY",
                "confidence_bucket": "medium",
                "forward_returns": {"5d": -0.02},
            },
        ],
    }
    other_payload = {
        "strategy": "canslim",
        "market_regime": "confirmed_uptrend",
        "records": [
            {
                "symbol": "CCC",
                "action": "BUY",
                "confidence_bucket": "high",
                "forward_returns": {"5d": 0.01},
            },
        ],
    }
    first_path = settled_dir / "20260401-dip_buyer.json"
    second_path = settled_dir / "20260401-canslim.json"
    first_path.write_text(json.dumps(payload), encoding="utf-8")
    second_path.write_text(json.dumps(other_payload), encoding="utf-8")
    original = first_path.read_text(encoding="utf-8")

    artifact = build_benchmark_comparison_artifact(root=tmp_path)

    assert artifact["artifact_family"] == "benchmark_comparison_summary"
    assert artifact["baselines"]["all_predictions"]["matured_count"] == 3
    assert "BUY" in artifact["baselines"]["by_action"]
    assert artifact["comparisons"]["by_strategy_action"][0]["lift_vs_all_predictions"] is not None
    assert (tmp_path / "reports" / "benchmark-comparison-latest.json").exists()
    assert first_path.read_text(encoding="utf-8") == original

