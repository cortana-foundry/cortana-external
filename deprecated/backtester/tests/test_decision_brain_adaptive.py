from __future__ import annotations

from decision_brain.narrative import (
    build_bounded_narrative_overlay,
    normalize_polymarket_narrative_snapshot,
    normalize_x_narrative_snapshot,
)
from decision_brain.weights import build_adaptive_weight_snapshot


def test_adaptive_weight_snapshot_cold_start_remains_conservative():
    snapshot = build_adaptive_weight_snapshot(
        regime_bucket="correction",
        comparison_artifact={
            "comparisons": {
                "by_strategy_action": [
                    {"strategy": "canslim", "settled_count": 8, "mean_return_pct": 2.0, "hit_rate": 0.8},
                ]
            }
        },
        calibration_artifact={"summary": {"by_confidence_bucket": []}},
        previous_snapshot={"strategy_weights": {"canslim": 1.0}},
        min_samples=20,
    )

    assert snapshot["strategy_weights"]["canslim"] == 1.0
    assert "cold-start" in snapshot["notes"][0]
    assert snapshot["shadow_mode"] is True


def test_adaptive_weight_snapshot_smooths_and_bounds_changes():
    snapshot = build_adaptive_weight_snapshot(
        regime_bucket="confirmed_uptrend",
        comparison_artifact={
            "comparisons": {
                "by_strategy_action": [
                    {"strategy": "dip_buyer", "settled_count": 50, "mean_return_pct": 6.0, "hit_rate": 0.7, "expectancy": 1.5},
                ]
            },
            "decision_review": {
                "veto_effectiveness": [{"veto": "market_regime", "sample_count": 30, "decision_accuracy": 0.72}]
            },
        },
        calibration_artifact={
            "summary": {
                "by_confidence_bucket": [
                    {"confidence_bucket": "high", "settled_count": 40, "avg_return_pct": 4.0, "hit_rate": 0.68}
                ]
            }
        },
        previous_snapshot={"strategy_weights": {"dip_buyer": 1.0}, "veto_weights": {"market_regime": 1.0}},
        max_step=0.05,
    )

    assert snapshot["strategy_weights"]["dip_buyer"] == 1.05
    assert snapshot["veto_weights"]["market_regime"] == 1.05
    assert snapshot["confidence_adjustments"]["high"] == 0.4


def test_normalize_x_narrative_snapshot_and_overlay_stay_bounded():
    x_snapshot = normalize_x_narrative_snapshot(
        symbol_rows=[
            {"symbol": "NVDA", "mention_count": 5, "repeat_count": 3, "acceleration_score": 2.1, "crowded_score": 0.8, "liquidity_tier": "high"},
            {"symbol": "SMALL", "mention_count": 4, "repeat_count": 0, "acceleration_score": 1.4, "crowded_score": 0.1, "liquidity_tier": "illiquid"},
        ],
        generated_at="2026-04-03T16:00:00+00:00",
        known_at="2026-04-03T15:55:00+00:00",
    )
    poly_snapshot = normalize_polymarket_narrative_snapshot(
        report={
            "summary": {
                "divergence": {"state": "watch"},
                "themeHighlights": [
                    {"title": "Fed easing odds", "watchTickers": ["QQQ", "NVDA"], "severity": "supportive"},
                    {"title": "Inflation upside risk", "watchTickers": ["XLE"], "severity": "conflict"},
                ],
            }
        },
        generated_at="2026-04-03T16:00:00+00:00",
        known_at="2026-04-03T15:30:00+00:00",
    )
    overlay = build_bounded_narrative_overlay(x_snapshot=x_snapshot, polymarket_snapshot=poly_snapshot)

    assert x_snapshot["authority_cap"] == "discovery_only"
    assert poly_snapshot["authority_cap"] == "support_conflict_only"
    assert overlay["buy_authority"] is False
    assert "NVDA" in overlay["priority_symbols"]
    assert "SMALL" not in overlay["priority_symbols"]
    assert any(item["symbol"] == "NVDA" and item["delta_confidence"] == -5 for item in overlay["confidence_nudges"])
