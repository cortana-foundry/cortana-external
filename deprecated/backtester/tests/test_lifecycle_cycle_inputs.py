from __future__ import annotations

from types import SimpleNamespace

from lifecycle.cycle_inputs import (
    build_review_notes,
    collect_signal_map,
    entry_candidates,
    entry_fill_price,
    normalize_timestamp,
    signal_market,
    signal_overlays,
    signal_price,
)


def _alerts():
    return [
        {
            "strategy": "canslim",
            "market": {"label": "confirmed_uptrend"},
            "overlays": {"risk": {"state": "open"}},
            "signals": [
                {
                    "symbol": "msft",
                    "action": "BUY",
                    "price": 101.235,
                    "reason": "Breakout",
                    "trade_quality_score": 80,
                    "effective_confidence": 70,
                },
                {"symbol": "aapl", "action": "WATCH", "trade_quality_score": 90},
            ],
        },
        {
            "strategy": "dip_buyer",
            "signals": [{"symbol": "nvda", "action": "BUY", "rec": {"entry": 200}, "trade_quality_score": 85}],
        },
    ]


def test_collects_signal_map_and_sorted_entry_candidates():
    alerts = _alerts()

    assert collect_signal_map(alerts)["MSFT"]["strategy"] == "canslim"
    assert [item["symbol"] for item in entry_candidates(alerts)] == ["nvda", "msft"]


def test_signal_context_and_price_helpers():
    alerts = _alerts()
    signal = collect_signal_map(alerts)["MSFT"]

    assert signal_market(signal, alerts) == {"label": "confirmed_uptrend"}
    assert signal_overlays(signal, alerts) == {"risk": {"state": "open"}}
    assert signal_price(signal) == 101.235
    assert entry_fill_price(signal={"rec": {}}, entry_plan={"entry_price_ideal_min": 99, "entry_price_ideal_max": 101}) == 100
    assert entry_fill_price(signal={"price": 98}, entry_plan={"entry_price_ideal_min": 99, "entry_price_ideal_max": 101}) == 99


def test_review_notes_and_timestamp_normalization():
    notes = build_review_notes(
        signal={"action": "NO_BUY", "reason": "Setup failed"},
        decision=SimpleNamespace(reason="target_hit"),
    )

    assert notes == ["latest signal action NO_BUY", "Setup failed", "decision reason target_hit"]
    assert normalize_timestamp("2026-04-03T20:00:00Z") == "2026-04-03T20:00:00+00:00"
