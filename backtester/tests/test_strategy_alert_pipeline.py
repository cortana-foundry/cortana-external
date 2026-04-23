from __future__ import annotations

from types import SimpleNamespace

from strategy_alert_pipeline import (
    append_pipeline_contract_signals,
    append_pipeline_contract_summary,
    market_degraded_warning_line,
    market_recovery_line,
    top_names,
    trade_quality_sort_key,
)


def test_pipeline_summary_and_signal_lines_are_shared_contract():
    lines: list[str] = []
    records = [
        {"symbol": "msft", "score": 8, "action": "buy", "reason": " Breakout. "},
        {"symbol": "", "score": 4, "action": "NO_BUY"},
    ]

    append_pipeline_contract_summary(
        lines,
        scanned=10,
        evaluated=2,
        threshold_passed=1,
        buy_count=1,
        watch_count=0,
        no_buy_count=1,
    )
    append_pipeline_contract_signals(lines, records)

    assert lines == [
        "Summary: scanned 10 | evaluated 2 | threshold-passed 1 | BUY 1 | WATCH 0 | NO_BUY 1",
        "• MSFT (8/12) → BUY",
        "Breakout.",
    ]


def test_market_degraded_copy_and_top_names_are_strategy_neutral():
    market = SimpleNamespace(
        status="degraded",
        degraded_reason=" provider   cooldown. ",
        snapshot_age_seconds=120,
        next_action=" Retry after cooldown. ",
    )

    assert market_degraded_warning_line(market) == (
        "Warning: degraded market regime input — provider cooldown (snapshot age 2m)"
    )
    assert market_recovery_line(market) == "Recovery: Retry after cooldown"
    assert top_names([{"symbol": "MSFT"}, {"symbol": "MSFT"}, {"symbol": "NVDA"}]) == "MSFT, NVDA"


def test_trade_quality_sort_key_prioritizes_action_then_quality():
    buy = {"symbol": "A", "action": "BUY", "trade_quality_score": 50, "effective_confidence": 60}
    watch = {"symbol": "B", "action": "WATCH", "trade_quality_score": 90, "effective_confidence": 90}

    assert trade_quality_sort_key(buy) < trade_quality_sort_key(watch)
