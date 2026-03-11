from __future__ import annotations

import pandas as pd

from backtest import Backtester
from outcomes import label_trade_outcome
from strategies.base import Strategy


class _ImmediateBuyStopStrategy(Strategy):
    def __init__(self) -> None:
        super().__init__(name="Immediate Buy Stop")

    def generate_signals(self, data: pd.DataFrame) -> pd.Series:
        return pd.Series([1, 0, 0], index=data.index)

    def should_use_stop_loss(self) -> bool:
        return True

    def stop_loss_pct(self) -> float:
        return 0.05


def test_label_trade_outcome_maps_common_cases():
    assert label_trade_outcome(-6.0, "stop_loss", 1).label == "quick_stop"
    assert label_trade_outcome(8.5, "signal", 7).label == "trend_win"
    assert label_trade_outcome(0.4, "signal", 2).label == "scratch"


def test_backtester_records_outcome_labels_on_realized_trades():
    idx = pd.date_range("2026-01-02", periods=3, freq="B")
    data = pd.DataFrame({"close": [100.0, 94.0, 94.0]}, index=idx)

    result = Backtester(initial_cash=1000, commission=0.0, slippage=0.0).run(_ImmediateBuyStopStrategy(), data)

    assert len(result.trades) == 1
    trade = result.trades[0]
    assert trade.exit_reason == "stop_loss"
    assert trade.holding_days == 1
    assert trade.outcome_label == "quick_stop"
    assert trade.outcome_bucket == "loss"
