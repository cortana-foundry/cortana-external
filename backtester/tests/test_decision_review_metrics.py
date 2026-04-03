from __future__ import annotations

import json

from evaluation.decision_review_metrics import build_decision_review_artifact


def test_decision_review_artifact_summarizes_opportunity_cost_and_veto_effectiveness(tmp_path):
    settled_dir = tmp_path / "settled"
    settled_dir.mkdir(parents=True, exist_ok=True)
    payload = {
        "strategy": "dip_buyer",
        "market_regime": "correction",
        "records": [
            {
                "symbol": "AAA",
                "action": "WATCH",
                "vetoes": [],
                "forward_returns_pct": {"5d": 4.0},
            },
            {
                "symbol": "BBB",
                "action": "NO_BUY",
                "vetoes": ["market_regime"],
                "forward_returns_pct": {"5d": -3.0},
            },
            {
                "symbol": "CCC",
                "action": "NO_BUY",
                "vetoes": ["market_regime", "credit"],
                "forward_returns_pct": {"5d": 6.0},
            },
        ],
    }
    (settled_dir / "20260401-dip_buyer.json").write_text(json.dumps(payload), encoding="utf-8")

    artifact = build_decision_review_artifact(root=tmp_path)

    watch_row = next(row for row in artifact["opportunity_cost"]["by_action"] if row["action"] == "WATCH")
    no_buy_row = next(row for row in artifact["opportunity_cost"]["by_action"] if row["action"] == "NO_BUY")
    assert watch_row["missed_winner_count"] == 1
    assert watch_row["top_missed_symbols"][0]["symbol"] == "AAA"
    assert no_buy_row["overblock_count"] == 1

    path_rows = {row["path"]: row for row in artifact["decision_paths"]}
    assert path_rows["downgrade:watch_without_explicit_veto"]["missed_winner_count"] == 1
    assert path_rows["veto:market_regime"]["preserved_bad_outcome_count"] == 1
    assert path_rows["veto:credit+veto:market_regime"]["missed_winner_count"] == 1

    veto_rows = {row["veto"]: row for row in artifact["veto_effectiveness"]}
    assert veto_rows["market_regime"]["count"] == 2
    assert veto_rows["market_regime"]["blocked_winner_count"] == 1
    assert veto_rows["market_regime"]["preserved_bad_outcome_count"] == 1
    assert (tmp_path / "reports" / "decision-review-latest.json").exists()
