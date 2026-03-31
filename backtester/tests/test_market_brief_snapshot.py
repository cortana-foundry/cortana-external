from __future__ import annotations

from types import SimpleNamespace

import market_brief_snapshot as module
from data.market_regime import MarketRegime, MarketStatus


def make_status(**overrides):
    payload = {
        "regime": MarketRegime.CORRECTION,
        "distribution_days": 7,
        "last_ftd": "",
        "trend_direction": "down",
        "position_sizing": 0.0,
        "notes": "Stay defensive.",
        "data_source": "schwab",
        "status": "ok",
        "degraded_reason": "",
        "snapshot_age_seconds": 0.0,
        "next_action": "",
        "regime_score": -7,
        "drawdown_pct": -5.4,
        "recent_return_pct": -4.0,
    }
    payload.update(overrides)
    return MarketStatus(**payload)


def test_classify_posture_respects_regime():
    correction = module.classify_posture(make_status(regime=MarketRegime.CORRECTION))
    assert correction["action"] == "NO_BUY"

    watch = module.classify_posture(make_status(regime=MarketRegime.UPTREND_UNDER_PRESSURE, position_sizing=0.5))
    assert watch["action"] == "WATCH"

    buy = module.classify_posture(make_status(regime=MarketRegime.CONFIRMED_UPTREND, position_sizing=1.0, notes="Trend is supportive."))
    assert buy["action"] == "BUY"
    assert "Trend is supportive" in buy["reason"]


def test_build_tape_summary_and_risk_tone():
    quotes = [
        {"symbol": "SPY", "change_percent": -0.62},
        {"symbol": "QQQ", "change_percent": -0.91},
        {"symbol": "IWM", "change_percent": -0.55},
        {"symbol": "DIA", "change_percent": -0.21},
        {"symbol": "GLD", "change_percent": 0.46},
        {"symbol": "TLT", "change_percent": 0.12},
    ]
    assert module.classify_tape_risk(quotes) == "defensive"
    summary = module.build_tape_summary(quotes)
    assert "SPY weak" in summary
    assert "Risk tone defensive" in summary


def test_build_focus_names_prefers_leaders_then_macro():
    focus = module.build_focus_names(["OXY", "QQQ", "FANG"], ["MSFT", "NVDA", "OXY"])
    assert focus["symbols"] == ["OXY", "FANG", "MSFT"]
    assert focus["sources"] == ["leader_priority", "leader_priority", "polymarket"]


def test_build_snapshot_collects_expected_sections(monkeypatch):
    monkeypatch.setattr(module.TradingAdvisor, "get_market_status", lambda self, refresh=True: make_status())
    monkeypatch.setattr(
        module,
        "load_structured_context",
        lambda max_age_hours=12.0: {
            "summary": {
                "conviction": "neutral",
                "divergence": {"state": "watch", "summary": "Mixed theme watch"},
                "themeHighlights": [
                    {"title": "Fed easing odds", "watchTickers": ["QQQ", "NVDA", "MSFT"]},
                ],
            },
            "metadata": {"generatedAt": "2026-03-31T12:00:00Z"},
        },
    )
    monkeypatch.setattr(module, "load_leader_priority_symbols", lambda max_age_hours=72.0: ["OXY", "FANG"])
    monkeypatch.setattr(
        module,
        "requests",
        SimpleNamespace(
            get=lambda *args, **kwargs: SimpleNamespace(
                raise_for_status=lambda: None,
                json=lambda: {
                    "data": {
                        "items": [
                            {"symbol": "SPY", "source": "schwab", "status": "ok", "data": {"price": 500, "changePercent": -0.3}},
                            {"symbol": "QQQ", "source": "schwab", "status": "ok", "data": {"price": 420, "changePercent": -0.4}},
                            {"symbol": "IWM", "source": "schwab", "status": "ok", "data": {"price": 200, "changePercent": -0.2}},
                            {"symbol": "DIA", "source": "schwab", "status": "ok", "data": {"price": 390, "changePercent": -0.1}},
                            {"symbol": "GLD", "source": "schwab", "status": "ok", "data": {"price": 210, "changePercent": 0.5}},
                            {"symbol": "TLT", "source": "schwab", "status": "ok", "data": {"price": 95, "changePercent": 0.1}},
                        ]
                    }
                },
            )
        ),
    )

    snapshot = module.build_snapshot("http://service")

    assert snapshot["posture"]["action"] == "NO_BUY"
    assert snapshot["macro"]["summary_line"].startswith("Polymarket neutral")
    assert snapshot["tape"]["primary_source"] == "schwab"
    assert snapshot["focus"]["symbols"] == ["OXY", "FANG", "NVDA"]
    assert snapshot["regime"]["display"] == "CORRECTION"


def test_build_snapshot_falls_back_conservatively_when_regime_fails(monkeypatch):
    monkeypatch.setattr(module.TradingAdvisor, "get_market_status", lambda self, refresh=True: (_ for _ in ()).throw(RuntimeError("cooldown")))
    monkeypatch.setattr(module, "load_last_known_regime_status", lambda cache_path=module.REGIME_CACHE_PATH: None)
    monkeypatch.setattr(module, "load_structured_context", lambda max_age_hours=12.0: None)
    monkeypatch.setattr(module, "load_leader_priority_symbols", lambda max_age_hours=72.0: [])
    monkeypatch.setattr(
        module,
        "requests",
        SimpleNamespace(
            get=lambda *args, **kwargs: (_ for _ in ()).throw(RuntimeError("service down"))
        ),
    )

    snapshot = module.build_snapshot("http://service")

    assert snapshot["status"] == "degraded"
    assert snapshot["posture"]["action"] == "NO_BUY"
    assert "market_regime_unavailable" in snapshot["warnings"][0]
    assert snapshot["tape"]["risk_tone"] == "unknown"


def test_build_snapshot_uses_last_known_regime_snapshot_when_live_fetch_fails(monkeypatch):
    monkeypatch.setattr(module.TradingAdvisor, "get_market_status", lambda self, refresh=True: (_ for _ in ()).throw(RuntimeError("cooldown")))
    monkeypatch.setattr(
        module,
        "load_last_known_regime_status",
        lambda cache_path=module.REGIME_CACHE_PATH: make_status(
            regime=MarketRegime.CORRECTION,
            notes="Regime score -8: stay defensive. [LAST KNOWN SNAPSHOT 18.0h old]",
            status="degraded",
            degraded_reason="Using last known snapshot.",
            snapshot_age_seconds=18 * 3600,
            regime_score=-8,
            distribution_days=9,
        ),
    )
    monkeypatch.setattr(module, "load_structured_context", lambda max_age_hours=30.0: None)
    monkeypatch.setattr(module, "load_leader_priority_symbols", lambda max_age_hours=72.0: ["OXY"])
    monkeypatch.setattr(
        module,
        "requests",
        SimpleNamespace(
            get=lambda *args, **kwargs: (_ for _ in ()).throw(RuntimeError("service down"))
        ),
    )

    snapshot = module.build_snapshot("http://service")

    assert snapshot["regime"]["distribution_days"] == 9
    assert snapshot["posture"]["action"] == "NO_BUY"
    assert "market_regime_stale_cache" in snapshot["warnings"][0]
