from __future__ import annotations

from data.risk_budget import build_position_size_recommendation
from lifecycle.paper_portfolio import select_entries
from lifecycle.trade_objects import ClosedPosition, OpenPosition


def test_position_size_recommendation_caps_high_risk_and_liquidity():
    recommendation = build_position_size_recommendation(
        signal={
            "effective_confidence": 82.0,
            "risk": "high",
        },
        risk_overlay={
            "state": "open",
            "budget_fraction": 1.0,
        },
        execution_policy={
            "fill_allowed": True,
            "liquidity_penalty_bps": 58.0,
        },
        data_quality_state="ok",
    )

    assert recommendation.size_tier == "starter"
    assert recommendation.capital_fraction <= 0.05
    assert recommendation.suppressed is False


def test_position_size_recommendation_suppresses_degraded_risky():
    recommendation = build_position_size_recommendation(
        signal={"effective_confidence": 70.0},
        risk_overlay={"state": "balanced", "budget_fraction": 0.5},
        execution_policy={"fill_allowed": True},
        data_quality_state="degraded_risky",
    )

    assert recommendation.size_tier == "no_size"
    assert recommendation.suppressed is True


def test_portfolio_selection_blocks_duplicates_and_recent_reentry():
    open_positions = [
        OpenPosition(
            id="open-1",
            position_key="pos-1",
            schema_version="lifecycle.v1",
            symbol="MSFT",
            strategy="canslim",
            entered_at="2026-04-03T20:00:00+00:00",
            entry_price=100.0,
            capital_allocated=10_000.0,
        )
    ]
    closed_positions = [
        ClosedPosition(
            id="closed-1",
            position_key="pos-2",
            schema_version="lifecycle.v1",
            symbol="NVDA",
            strategy="canslim",
            entered_at="2026-04-01T20:00:00+00:00",
            exited_at="2026-04-02T20:00:00+00:00",
            entry_price=200.0,
            exit_price=210.0,
        )
    ]
    candidates = [
        {"symbol": "MSFT", "strategy": "canslim", "capital_fraction": 0.10},
        {"symbol": "NVDA", "strategy": "canslim", "capital_fraction": 0.10},
        {"symbol": "META", "strategy": "canslim", "capital_fraction": 0.10},
    ]

    selected, snapshot = select_entries(
        candidates=candidates,
        open_positions=open_positions,
        closed_positions=closed_positions,
        snapshot_at="2026-04-03T20:00:00+00:00",
    )

    assert [item["symbol"] for item in selected] == ["META"]
    blocked = {item["symbol"]: item["block_reason"] for item in snapshot.blocked_candidates}
    assert blocked["MSFT"] == "duplicate_symbol"
    assert blocked["NVDA"] == "reentry_cooldown"
