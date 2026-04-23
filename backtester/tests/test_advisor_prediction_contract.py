from __future__ import annotations

from advisor import TradingAdvisor
from advisor_prediction_contract import build_prediction_contract_context


def test_advisor_prediction_contract_stays_public_api_compatible():
    recommendation = {
        "action": "BUY",
        "effective_confidence": 76,
        "trade_quality_score": 84,
        "canonical_horizon_days": 7,
    }
    analysis = {
        "market_regime": "confirmed_uptrend",
        "feature_summary": {"trend": "strong"},
    }

    direct = build_prediction_contract_context(
        strategy="canslim",
        recommendation=recommendation,
        analysis=analysis,
    )
    via_advisor = TradingAdvisor.build_prediction_contract_context(
        strategy="canslim",
        recommendation=recommendation,
        analysis=analysis,
    )

    assert via_advisor == direct
    assert via_advisor["risk"] == "low"
    assert via_advisor["entry_plan_ref"] == "canslim.breakout_entry_v1"
    assert via_advisor["canonical_horizon_days"] == 7
