from __future__ import annotations

from datetime import datetime
from zoneinfo import ZoneInfo

import data.intraday_breadth as module


def _market_time(hour: int, minute: int = 0) -> datetime:
    return datetime(2026, 3, 31, hour, minute, tzinfo=ZoneInfo("America/New_York"))


def test_build_intraday_breadth_snapshot_selective_buy_when_broad_rally(monkeypatch):
    monkeypatch.setattr(module, "GROWTH_WATCHLIST", ["NVDA", "MSFT", "AMD"])
    monkeypatch.setattr(module, "_load_base_universe_symbols", lambda service_base_url: (["AAA", "BBB", "CCC", "DDD"], None))
    monkeypatch.setattr(
        module,
        "_quote_batch",
        lambda symbols, service_base_url, chunk_size=120: (
            [
                {"symbol": "SPY", "data": {"changePercent": 1.8}},
                {"symbol": "QQQ", "data": {"changePercent": 2.4}},
                {"symbol": "IWM", "data": {"changePercent": 1.1}},
                {"symbol": "DIA", "data": {"changePercent": 1.0}},
                {"symbol": "AAA", "data": {"changePercent": 1.0}},
                {"symbol": "BBB", "data": {"changePercent": 0.8}},
                {"symbol": "CCC", "data": {"changePercent": 0.4}},
                {"symbol": "DDD", "data": {"changePercent": -0.2}},
                {"symbol": "NVDA", "data": {"changePercent": 3.0}},
                {"symbol": "MSFT", "data": {"changePercent": 2.2}},
                {"symbol": "AMD", "data": {"changePercent": -0.4}},
            ],
            [],
        ),
    )

    snapshot = module.build_intraday_breadth_snapshot(service_base_url="http://service", now=_market_time(12, 0))

    assert snapshot["status"] == "ok"
    assert snapshot["override_state"] == "selective-buy"
    assert snapshot["s_and_p"]["pct_up"] == 0.75
    assert snapshot["growth"]["pct_up"] == 2 / 3
    assert snapshot["strong_up_day_flag"] is False


def test_build_intraday_breadth_snapshot_stays_inactive_when_breadth_is_narrow(monkeypatch):
    monkeypatch.setattr(module, "GROWTH_WATCHLIST", ["NVDA", "MSFT", "AMD"])
    monkeypatch.setattr(module, "_load_base_universe_symbols", lambda service_base_url: (["AAA", "BBB", "CCC", "DDD"], None))
    monkeypatch.setattr(
        module,
        "_quote_batch",
        lambda symbols, service_base_url, chunk_size=120: (
            [
                {"symbol": "SPY", "data": {"changePercent": 1.7}},
                {"symbol": "QQQ", "data": {"changePercent": 2.1}},
                {"symbol": "IWM", "data": {"changePercent": 0.2}},
                {"symbol": "DIA", "data": {"changePercent": 0.1}},
                {"symbol": "AAA", "data": {"changePercent": 1.2}},
                {"symbol": "BBB", "data": {"changePercent": -1.0}},
                {"symbol": "CCC", "data": {"changePercent": -0.8}},
                {"symbol": "DDD", "data": {"changePercent": -0.3}},
                {"symbol": "NVDA", "data": {"changePercent": 2.6}},
                {"symbol": "MSFT", "data": {"changePercent": -0.8}},
                {"symbol": "AMD", "data": {"changePercent": -1.1}},
            ],
            [],
        ),
    )

    snapshot = module.build_intraday_breadth_snapshot(service_base_url="http://service", now=_market_time(13, 5))

    assert snapshot["status"] == "ok"
    assert snapshot["override_state"] == "inactive"
    assert "breadth is not broad enough" in snapshot["override_reason"]
    assert snapshot["narrow_rally_flag"] is True


def test_build_intraday_breadth_snapshot_marks_unavailable_when_coverage_is_too_low(monkeypatch):
    monkeypatch.setattr(module, "GROWTH_WATCHLIST", ["NVDA", "MSFT", "AMD"])
    monkeypatch.setattr(module, "_load_base_universe_symbols", lambda service_base_url: (["AAA", "BBB", "CCC", "DDD"], None))
    monkeypatch.setattr(
        module,
        "_quote_batch",
        lambda symbols, service_base_url, chunk_size=120: (
            [
                {"symbol": "SPY", "data": {"changePercent": 1.8}},
                {"symbol": "QQQ", "data": {"changePercent": 2.4}},
                {"symbol": "AAA", "data": {"changePercent": 1.0}},
                {"symbol": "NVDA", "data": {"changePercent": 3.0}},
            ],
            [],
        ),
    )

    snapshot = module.build_intraday_breadth_snapshot(service_base_url="http://service", now=_market_time(14, 10))

    assert snapshot["status"] == "degraded"
    assert snapshot["override_state"] == "unavailable"
    assert "coverage" in " ".join(snapshot["warnings"])

