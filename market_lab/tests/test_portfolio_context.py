from __future__ import annotations

from market_lab.portfolio_context import PortfolioContextService
from market_lab.schwab_portfolio import normalize_schwab_portfolio


def test_schwab_portfolio_normalizes_positions_without_raw_order_calls():
    context = normalize_schwab_portfolio(
        [{"hashValue": "hash-1", "accountNumber": "1234"}],
        [
            {
                "securitiesAccount": {
                    "accountNumber": "hash-1",
                    "type": "MARGIN",
                    "currentBalances": {"liquidationValue": 1000, "cashBalance": 100},
                    "positions": [
                        {
                            "longQuantity": 2,
                            "marketValue": 300,
                            "instrument": {"symbol": "aapl", "assetType": "EQUITY"},
                        }
                    ],
                }
            }
        ],
    )

    assert context.status == "available"
    assert context.accounts[0].account_hash == "hash-1"
    assert context.positions[0].symbol == "AAPL"
    assert context.positions[0].weight_pct == 30


def test_portfolio_context_unavailable_without_cache(tmp_path):
    context = PortfolioContextService(cache_dir=tmp_path).latest()

    assert context.status == "unavailable"
