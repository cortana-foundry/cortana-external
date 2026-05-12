from __future__ import annotations

from pathlib import Path

from decision_brain.surfaces import (
    build_market_brief_decision_bundle,
    build_shadow_review_artifact,
    build_surface_research_runtime,
)
from research.runtime import build_hot_contract, write_research_artifact


def test_build_surface_research_runtime_reports_fresh_hot_artifacts(tmp_path):
    payload = build_hot_contract(
        artifact_type="ticker_research_profile",
        producer="ts.research.fetcher",
        known_at="2026-04-03T16:00:00+00:00",
        generated_at="2026-04-03T16:05:00+00:00",
        freshness_ttl_seconds=3600,
        payload={"symbol": "NVDA"},
    )
    write_research_artifact(root=tmp_path, filename="ticker-research-profile.json", payload=payload)

    snapshot = build_surface_research_runtime(
        generated_at="2026-04-03T16:10:00+00:00",
        root=tmp_path,
        hot_files=("ticker-research-profile.json",),
    )

    assert snapshot["artifact_family"] == "research_runtime_snapshot"
    assert snapshot["summary"]["hot_count"] == 1
    assert snapshot["summary"]["fresh_count"] == 1
    assert snapshot["summary"]["health_status"] == "ok"


def test_build_market_brief_decision_bundle_returns_canonical_artifacts(tmp_path, monkeypatch):
    monkeypatch.setenv("RESEARCH_RUNTIME_ROOT", str(tmp_path))
    bundle = build_market_brief_decision_bundle(
        generated_at="2026-04-03T16:10:00+00:00",
        known_at="2026-04-03T16:10:00+00:00",
        producer="backtester.market_brief_snapshot",
        session_phase="OPEN",
        regime={
            "label": "correction",
            "display": "CORRECTION",
            "position_sizing_pct": 0.0,
            "distribution_days": 5,
            "regime_score": -5,
            "notes": "Stay defensive.",
            "status": "ok",
            "data_source": "schwab",
            "degraded_reason": None,
            "snapshot_age_seconds": 120.0,
        },
        posture={"action": "NO_BUY", "reason": "Stay defensive."},
        breadth={
            "status": "ok",
            "override_state": "watch_only",
            "override_reason": "constructive but not broad enough",
            "authority_cap": "watch_only",
            "warnings": [],
        },
        tape={"status": "ok", "primary_source": "schwab", "symbols": []},
        macro_report={
            "summary": {
                "divergence": {"state": "watch", "summary": "Mixed theme watch"},
                "themeHighlights": [{"title": "Fed easing odds", "watchTickers": ["NVDA", "MSFT"]}],
            },
            "metadata": {"generatedAt": "2026-04-03T15:30:00Z"},
        },
        focus={"symbols": ["NVDA"], "sources": ["leader_priority"], "reason": "Focus name came from the leader-priority list."},
        comparison_artifact={
            "comparisons": {
                "by_strategy_action": [
                    {
                        "strategy": "dip_buyer",
                        "action": "BUY",
                        "settled_count": 30,
                        "mean_return_pct": 3.0,
                        "hit_rate": 0.64,
                        "expectancy": 1.2,
                    }
                ]
            }
        },
        calibration_artifact={
            "summary": {
                "by_confidence_bucket": [
                    {
                        "confidence_bucket": "high",
                        "sample_count": 30,
                        "avg_return_pct": 2.1,
                        "hit_rate": 0.63,
                    }
                ]
            }
        },
        research_runtime=build_surface_research_runtime(
            generated_at="2026-04-03T16:10:00+00:00",
            root=Path(tmp_path),
            hot_files=(),
        ),
    )

    assert bundle["decision_state"]["artifact_family"] == "decision_state"
    assert bundle["decision_state"]["policy_state"]["action"] == "NO_BUY"
    assert bundle["narrative_overlay"]["buy_authority"] is False
    assert bundle["adaptive_weights"]["shadow_mode"] is True
    assert bundle["shadow_review"]["artifact_family"] == "decision_brain_shadow_review"


def test_build_shadow_review_artifact_flags_more_constructive_shadow():
    review = build_shadow_review_artifact(
        generated_at="2026-04-03T16:10:00+00:00",
        session_phase="OPEN",
        posture={"action": "NO_BUY", "reason": "Stay defensive."},
        breadth={"override_state": "selective-buy"},
        adaptive_weights={"strategy_weights": {"dip_buyer": 1.1}},
        narrative_overlay={"priority_symbols": ["NVDA"], "crowding_warnings": []},
        research_runtime={"summary": {"summary_line": "Research plane has no hot-path artifacts yet; decisions are not blocked."}},
    )

    assert review["shadow_action"] == "SELECTIVE_BUY"
    assert review["authority_change"] == "shadow_only_more_constructive"
    assert "Shadow mode only" in " ".join(review["notes"])
