from __future__ import annotations

from market_lab.momentum import build_momentum_snapshot


class FakeMarketData:
    def get_history(self, symbol: str, *, period: str = "3mo"):
        prices = {
            "AAPL": [100, 105, 110, 115, 120],
            "SPY": [500, 505, 510, 515, 520],
        }[symbol]
        dates = ["2026-02-01", "2026-04-23", "2026-05-08", "2026-05-12", "2026-05-13"]
        return {"candles": [{"date": date, "close": price} for date, price in zip(dates, prices, strict=True)]}


def test_momentum_computes_windows_against_spy():
    snapshot = build_momentum_snapshot("AAPL", FakeMarketData())

    assert snapshot.status == "available"
    windows = {item.window: item for item in snapshot.windows}
    assert round(windows["1d"].symbol_return_pct or 0, 2) == 4.35
    assert round(windows["1d"].spy_return_pct or 0, 2) == 0.97
    assert round(windows["1d"].alpha_vs_spy_pct or 0, 2) == 3.38
    assert snapshot.summary and "Best relative window" in snapshot.summary


class EmptyMarketData:
    def get_history(self, symbol: str, *, period: str = "3mo"):
        return None


def test_momentum_marks_missing_when_history_is_unavailable():
    snapshot = build_momentum_snapshot("AAPL", EmptyMarketData())

    assert snapshot.status == "missing"
    assert snapshot.unavailable_windows == ["1d", "5d", "20d", "3m"]
