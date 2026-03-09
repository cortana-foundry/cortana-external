from unittest.mock import MagicMock

from advisor import TradingAdvisor


def test_analyze_dip_stock_uses_resilient_helper_path(monkeypatch):
    advisor = TradingAdvisor()
    advisor.get_market_status = MagicMock(return_value=object())
    advisor.risk_fetcher.get_snapshot = MagicMock(return_value={"vix": 25.0})

    expected = {"symbol": "NVDA", "total_score": 8, "recommendation": {"action": "BUY"}}
    helper = MagicMock(return_value=expected)
    monkeypatch.setattr(advisor, "_analyze_dip_with_context", helper)

    result = advisor.analyze_dip_stock("NVDA")

    assert result == expected
    helper.assert_called_once_with("NVDA", advisor.get_market_status.return_value, {"vix": 25.0})


def test_scan_dip_opportunities_uses_resilient_helper_path(monkeypatch):
    advisor = TradingAdvisor()
    from data.market_regime import MarketRegime
    market = MagicMock()
    market.regime = MarketRegime.CORRECTION
    advisor.get_market_status = MagicMock(return_value=market)
    advisor.risk_fetcher.get_snapshot = MagicMock(return_value={"vix": 25.0})
    advisor.screener.get_universe = MagicMock(return_value=["NVDA", "META"])

    monkeypatch.setattr(
        advisor,
        "_analyze_dip_with_context",
        MagicMock(
            side_effect=[
                {"symbol": "NVDA", "price": 100.0, "rsi": 30.0, "scores": {"Q": 3, "V": 3, "C": 2}, "total_score": 8, "recommendation": {"action": "BUY"}},
                {"symbol": "META", "price": 200.0, "rsi": 35.0, "scores": {"Q": 2, "V": 2, "C": 2}, "total_score": 6, "recommendation": {"action": "WATCH"}},
            ]
        ),
    )

    df = advisor.scan_dip_opportunities(quick=False, min_score=6)

    assert list(df["symbol"]) == ["NVDA", "META"]
    assert list(df["total_score"]) == [8, 6]
