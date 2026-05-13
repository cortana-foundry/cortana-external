from __future__ import annotations

import json
from datetime import UTC, datetime, timedelta

from market_lab.models import PortfolioAccount, PortfolioContext, PortfolioPosition
from market_lab.portfolio_context import PortfolioContextService
from market_lab.schwab_portfolio import SchwabPortfolioClient, normalize_schwab_portfolio


def test_schwab_portfolio_normalizes_positions_without_raw_order_calls():
    context = normalize_schwab_portfolio(
        [{"hashValue": "hash-1", "accountNumber": "1234"}],
        [
            {
                "securitiesAccount": {
                    "accountNumber": "1234",
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
    assert context.positions[0].account_hash == "hash-1"
    assert context.positions[0].current_price == 150
    assert context.positions[0].weight_pct == 30


def test_portfolio_context_unavailable_without_cache(tmp_path):
    context = PortfolioContextService(cache_dir=tmp_path).latest()

    assert context.status == "unavailable"


def test_schwab_portfolio_prefers_fresh_accounts_trading_token(tmp_path):
    expired = tmp_path / "schwab-token.json"
    fresh = tmp_path / "schwab-streamer-token.json"
    expired.write_text(json.dumps({"accessToken": "market-data-token", "expiresAt": 1}), encoding="utf-8")
    fresh.write_text(
        json.dumps({"accessToken": "accounts-trading-token", "expiresAt": int((datetime.now(UTC) + timedelta(minutes=5)).timestamp() * 1000)}),
        encoding="utf-8",
    )

    client = SchwabPortfolioClient(token_path=expired)
    client.token_paths = [expired, fresh]

    assert client._access_token() == "accounts-trading-token"


def test_portfolio_refresh_enriches_positions_with_batch_quote_changes(tmp_path):
    class FakeSchwab:
        def fetch_context(self):
            return PortfolioContext(
                status="available",
                source="schwab",
                generated_at=datetime.now(UTC),
                accounts=[PortfolioAccount(account_hash="hash-1", liquidation_value=1000, cash_value=100)],
                positions=[
                    PortfolioPosition(
                        account_hash="hash-1",
                        symbol="AAPL",
                        quantity=2,
                        average_price=100,
                        current_price=150,
                        market_value=300,
                    )
                ],
            )

    class FakeMarketData:
        def get_quote_batch(self, symbols):
            assert symbols == ["AAPL"]
            return {
                "AAPL": {
                    "source": "schwab_streamer",
                    "status": "ok",
                    "data": {
                        "symbol": "AAPL",
                        "price": 155,
                        "change": 5,
                        "changePercent": 3.33,
                        "timestamp": "2026-05-13T17:00:00Z",
                    },
                }
            }

    context = PortfolioContextService(cache_dir=tmp_path, schwab=FakeSchwab(), market_data=FakeMarketData()).refresh()

    position = context.positions[0]
    assert position.current_price == 155
    assert position.market_value == 310
    assert position.day_change == 5
    assert position.day_change_pct == 3.33
    assert position.quote_source == "schwab_streamer"
    assert position.quote_status == "ok"
