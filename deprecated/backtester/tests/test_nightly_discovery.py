import json
from types import SimpleNamespace
from unittest.mock import patch

import pandas as pd

from nightly_discovery import build_report, format_report


class _FakeAdvisor:
    def __init__(self):
        self.last_nightly_symbols = None
        self.screener = SimpleNamespace(
            get_nightly_discovery_breakdown=lambda refresh_sp500=False: {
                "base_count": 2,
                "growth_count": 1,
                "dynamic_only_count": 1,
                "total_count": 4,
            },
            get_universe_for_profile=lambda profile, refresh_sp500=False: ["AAPL", "MSFT", "NVDA", "COIN"],
            get_universe=lambda: ["AAPL", "MSFT", "NVDA", "COIN"],
        )

    def get_market_status(self, refresh: bool = False):
        return SimpleNamespace(regime=SimpleNamespace(value="confirmed_uptrend"), position_sizing=1.0)

    def run_nightly_discovery(
        self,
        limit: int = 25,
        min_technical_score: int = 3,
        refresh_sp500: bool = False,
        symbols=None,
        progress_callback=None,
    ):
        self.last_nightly_symbols = list(symbols or [])
        return pd.DataFrame(
            [
                {
                    "symbol": "NVDA",
                    "technical_score": 6,
                    "total_score": 10,
                    "action": "BUY",
                    "rank_score": 12.5,
                    "confidence": 82,
                    "reason": "clean breakout",
                },
                {
                    "symbol": "COIN",
                    "technical_score": 5,
                    "total_score": 8,
                    "action": "WATCH",
                    "rank_score": 10.0,
                    "confidence": 63,
                    "reason": "crypto proxy strength",
                },
            ]
        )


def test_build_report_uses_nightly_profile_and_formats_leaders():
    fake_advisor = _FakeAdvisor()
    with patch("nightly_discovery.TradingAdvisor", return_value=fake_advisor), patch(
        "nightly_discovery.RankedUniverseSelector.load_fresh_cache_payload",
        return_value=None,
    ), patch(
        "nightly_discovery.RankedUniverseSelector.refresh_cache",
        return_value={
            "generated_at": "2026-03-14T09:00:00+00:00",
            "symbols": [{"symbol": "AAA"}],
            "feature_snapshot": {
                "schema_version": 1,
                "generated_at": "2026-03-14T09:00:00+00:00",
                "symbol_count": 1,
                "source": "ranked_universe_selector.refresh_cache",
            },
            "liquidity_overlay": {
                "path": "/tmp/liquidity.json",
                "generated_at": "2026-03-14T09:00:01+00:00",
                "symbol_count": 1,
                "summary": {
                    "median_estimated_slippage_bps": 11.2,
                    "high_quality_count": 1,
                },
            },
        },
    ), patch(
        "nightly_discovery.generate_buy_decision_calibration_artifact",
        return_value=(
            {
                "generated_at": "2026-03-14T08:30:00+00:00",
                "freshness": {"is_stale": False, "reason": "fresh"},
                "summary": {"settled_candidates": 3},
            },
            "/tmp/buy-decision-calibration-latest.json",
        ),
    ), patch(
        "nightly_discovery.refresh_leader_baskets",
        return_value=(
            {
                "generated_at": "2026-03-14T09:00:00+00:00",
                "buckets": {
                    "daily": [{"symbol": "NVDA"}],
                    "weekly": [{"symbol": "NVDA"}, {"symbol": "COIN"}],
                    "monthly": [{"symbol": "NVDA"}, {"symbol": "COIN"}, {"symbol": "MSFT"}],
                },
                "priority": {"symbols": ["NVDA", "COIN", "MSFT"]},
            },
            "/tmp/leader-baskets-latest.json",
        ),
    ), patch(
        "nightly_discovery.default_research_symbols",
        return_value=["NVDA", "COIN"],
    ), patch(
        "nightly_discovery.build_alpha_report",
        return_value=[],
    ) as build_alpha_report_mock, patch(
        "nightly_discovery.persist_alpha_snapshot",
        return_value="/tmp/experimental-alpha-latest.json",
    ):
        report = build_report(limit=2, min_technical_score=3, refresh_sp500=True)

    assert report["profile"] == "nightly_discovery"
    assert report["market_regime"] == "confirmed_uptrend"
    assert report["universe_size"] == 4
    assert report["universe_breakdown"]["base_count"] == 2
    assert report["leaders"][0]["symbol"] == "NVDA"
    assert report["leaders"][1]["action"] == "WATCH"
    assert report["live_prefilter"]["symbol_count"] == 1
    assert report["feature_snapshot"]["schema_version"] == 1
    assert report["feature_snapshot"]["symbol_count"] == 1
    assert report["liquidity_overlay"]["symbol_count"] == 1
    assert report["liquidity_overlay"]["summary"]["median_estimated_slippage_bps"] == 11.2
    assert fake_advisor.last_nightly_symbols == ["AAPL", "MSFT", "NVDA", "COIN"]
    assert report["buy_decision_calibration"]["settled_candidates"] == 3
    assert report["leader_baskets"]["priority_count"] == 3
    build_alpha_report_mock.assert_called_once()


def test_build_report_emits_universe_breakdown_progress_line():
    fake_advisor = _FakeAdvisor()
    with patch("nightly_discovery.TradingAdvisor", return_value=fake_advisor), patch(
        "nightly_discovery._emit_progress",
    ) as emit_progress_mock, patch(
        "nightly_discovery.RankedUniverseSelector.load_fresh_cache_payload",
        return_value=None,
    ), patch(
        "nightly_discovery.RankedUniverseSelector.refresh_cache",
        return_value={
            "generated_at": "2026-03-14T09:00:00+00:00",
            "symbols": [],
        },
    ), patch(
        "nightly_discovery.generate_buy_decision_calibration_artifact",
        return_value=(
            {
                "generated_at": "2026-03-14T08:30:00+00:00",
                "freshness": {"is_stale": False, "reason": "fresh"},
                "summary": {"settled_candidates": 3},
            },
            "/tmp/buy-decision-calibration-latest.json",
        ),
    ), patch(
        "nightly_discovery.refresh_leader_baskets",
        return_value=(
            {
                "generated_at": "2026-03-14T09:00:00+00:00",
                "buckets": {"daily": [], "weekly": [], "monthly": []},
                "priority": {"symbols": []},
            },
            "/tmp/leader-baskets-latest.json",
        ),
    ), patch(
        "nightly_discovery.default_research_symbols",
        return_value=["NVDA", "COIN"],
    ), patch(
        "nightly_discovery.build_alpha_report",
        return_value=[],
    ), patch(
        "nightly_discovery.persist_alpha_snapshot",
        return_value="/tmp/experimental-alpha-latest.json",
    ):
        build_report(limit=2, min_technical_score=3, refresh_sp500=True)

    emitted = [call.args[0] for call in emit_progress_mock.call_args_list]
    assert any(
        "Nightly discovery progress: running nightly discovery on 4 symbols (deduped total; base 2 S&P | growth 1 watchlist | dynamic-only 1)"
        in message
        for message in emitted
    )
    assert any(
        "Nightly discovery timing: nightly discovery core " in message
        for message in emitted
    )


def test_build_report_reuses_fresh_live_prefilter_cache_without_refresh():
    fake_advisor = _FakeAdvisor()
    fresh_payload = {
        "generated_at": "2026-03-14T09:00:00+00:00",
        "symbols": [{"symbol": "AAA"}],
        "feature_snapshot": {
            "schema_version": 1,
            "generated_at": "2026-03-14T09:00:00+00:00",
            "symbol_count": 1,
            "source": "ranked_universe_selector.refresh_cache",
        },
        "liquidity_overlay": {
            "path": "/tmp/liquidity.json",
            "generated_at": "2026-03-14T09:00:01+00:00",
            "symbol_count": 1,
            "summary": {},
        },
    }
    with patch("nightly_discovery.TradingAdvisor", return_value=fake_advisor), patch(
        "nightly_discovery.RankedUniverseSelector.load_fresh_cache_payload",
        return_value=fresh_payload,
    ), patch(
        "nightly_discovery.RankedUniverseSelector.refresh_cache",
    ) as refresh_cache_mock, patch(
        "nightly_discovery.RankedUniverseSelector._age_hours",
        return_value=0.4,
    ), patch(
        "nightly_discovery.generate_buy_decision_calibration_artifact",
        return_value=(
            {
                "generated_at": "2026-03-14T08:30:00+00:00",
                "freshness": {"is_stale": False, "reason": "fresh"},
                "summary": {"settled_candidates": 3},
            },
            "/tmp/buy-decision-calibration-latest.json",
        ),
    ), patch(
        "nightly_discovery.refresh_leader_baskets",
        return_value=(
            {
                "generated_at": "2026-03-14T09:00:00+00:00",
                "buckets": {"daily": [], "weekly": [], "monthly": []},
                "priority": {"symbols": []},
            },
            "/tmp/leader-baskets-latest.json",
        ),
    ), patch(
        "nightly_discovery.default_research_symbols",
        return_value=["NVDA", "COIN"],
    ), patch(
        "nightly_discovery.build_alpha_report",
        return_value=[],
    ), patch(
        "nightly_discovery.persist_alpha_snapshot",
        return_value="/tmp/experimental-alpha-latest.json",
    ):
        report = build_report(limit=2, min_technical_score=3, refresh_sp500=True)

    refresh_cache_mock.assert_not_called()
    assert report["live_prefilter"]["source"] == "cache_reuse"


def test_format_report_renders_compact_nightly_summary():
    report = {
        "profile": "nightly_discovery",
        "market_regime": "confirmed_uptrend",
        "position_sizing": 1.0,
        "universe_size": 4,
        "universe_breakdown": {
            "base_count": 2,
            "growth_count": 1,
            "dynamic_only_count": 1,
            "total_count": 4,
        },
        "live_prefilter": {
            "path": "/tmp/prefilter.json",
            "generated_at": "2026-03-14T09:00:00+00:00",
            "symbol_count": 42,
        },
        "feature_snapshot": {
            "path": "/tmp/prefilter.json",
            "schema_version": 1,
            "generated_at": "2026-03-14T09:00:00+00:00",
            "symbol_count": 42,
            "source": "ranked_universe_selector.refresh_cache",
        },
        "liquidity_overlay": {
            "path": "/tmp/liquidity.json",
            "generated_at": "2026-03-14T09:00:03+00:00",
            "symbol_count": 39,
            "summary": {
                "median_estimated_slippage_bps": 9.8,
                "high_quality_count": 17,
            },
        },
        "leaders": [
            {
                "symbol": "NVDA",
                "technical_score": 6,
                "total_score": 10,
                "action": "BUY",
                "rank_score": 12.5,
                "confidence": 82,
                "reason": "clean breakout",
            }
        ],
        "leader_baskets": {
            "generated_at": "2026-03-14T09:00:00+00:00",
            "daily_count": 1,
            "weekly_count": 2,
            "monthly_count": 3,
            "priority_count": 3,
        },
    }

    text = format_report(report)

    assert "Nightly Discovery" in text
    assert "Profile: nightly_discovery" in text
    assert "Universe size: 4" in text
    assert "Universe breakdown: base 2 | growth 1 | dynamic-only 1 | total 4" in text
    assert "Universe layers: growth = always-include leaders | dynamic-only = Polymarket/X additions not already in base or growth" in text
    assert "Live prefilter cache: 42 symbols" in text
    assert "Feature snapshot: v1 | 42 symbols | 2026-03-14T09:00:00+00:00 | ranked_universe_selector.refresh_cache" in text
    assert "Liquidity overlay cache: 39 symbols | 2026-03-14T09:00:03+00:00 | median slip 9.8bps | high quality 17" in text
    assert "Leader baskets: daily 1 | weekly 2 | monthly 3 | priority 3" in text
    assert "- NVDA: action BUY | tech 6/6 | total 10/12" in text


def test_format_report_surfaces_buy_decision_calibration_when_available():
    report = {
        "profile": "nightly_discovery",
        "market_regime": "confirmed_uptrend",
        "position_sizing": 1.0,
        "universe_size": 4,
        "leaders": [],
        "buy_decision_calibration": {
            "path": "/tmp/buy-decision-calibration-latest.json",
            "generated_at": "2026-03-14T08:30:00+00:00",
            "is_stale": False,
            "reason": "fresh",
            "status": "fresh",
            "settled_candidates": 24,
        },
    }

    text = format_report(report)

    assert "Buy decision calibration: fresh | stale=False | settled 24 | 2026-03-14T08:30:00+00:00" in text


def test_refresh_buy_decision_calibration_summary_falls_back_to_existing_file(tmp_path):
    payload = {
        "generated_at": "2026-03-14T08:30:00+00:00",
        "freshness": {"is_stale": True, "reason": "no_settled_records"},
        "summary": {"settled_candidates": 0},
    }
    path = tmp_path / "buy-decision-calibration-latest.json"
    path.write_text(json.dumps(payload), encoding="utf-8")

    with patch("nightly_discovery.DEFAULT_BUY_DECISION_CALIBRATION_PATH", path), patch(
        "nightly_discovery.generate_buy_decision_calibration_artifact",
        side_effect=RuntimeError("boom"),
    ):
        from nightly_discovery import _refresh_buy_decision_calibration_summary
        summary = _refresh_buy_decision_calibration_summary()

    assert summary is not None
    assert summary["reason"] == "no_settled_records"
    assert summary["settled_candidates"] == 0


def test_refresh_experimental_alpha_snapshot_persists_default_research_symbols():
    fake_advisor = _FakeAdvisor()

    with patch("nightly_discovery.default_research_symbols", return_value=["NVDA", "COIN"]), patch(
        "nightly_discovery.build_alpha_report",
        return_value=[],
    ) as build_alpha_report_mock, patch(
        "nightly_discovery.persist_alpha_snapshot",
        return_value="/tmp/experimental-alpha-latest.json",
    ) as persist_mock:
        from nightly_discovery import _refresh_experimental_alpha_snapshot

        path = _refresh_experimental_alpha_snapshot(advisor=fake_advisor)

    assert path == "/tmp/experimental-alpha-latest.json"
    build_alpha_report_mock.assert_called_once_with(["NVDA", "COIN"], fake_advisor)
    persist_mock.assert_called_once()
