from __future__ import annotations

from market_lab.fundamentals import build_fundamentals_snapshot


class FakeMarketData:
    def get_fundamentals(self, symbol: str):
        return {
            "source": "fixture",
            "data": {
                "payload": {
                    "marketCap": 1_000_000_000,
                    "trailingPE": 25.4,
                    "nextEarningsDate": "2026-06-01",
                    "revenueGrowth": 0.12,
                    "grossMargins": 0.43,
                    "recommendationKey": "buy",
                }
            },
        }


def test_fundamentals_extracts_available_fields_and_tracks_missing():
    snapshot = build_fundamentals_snapshot("AAPL", FakeMarketData())

    assert snapshot.status == "available"
    assert snapshot.source == "fixture"
    assert snapshot.valuation["market_cap"] == 1_000_000_000
    assert snapshot.earnings["next_earnings_date"] == "2026-06-01"
    assert snapshot.trends["revenue_growth"] == 0.12
    assert snapshot.quality["gross_margin"] == 0.43
    assert snapshot.analyst_context["consensus_rating"] == "buy"
    assert "valuation.forward_pe" in snapshot.unavailable_fields


class EmptyMarketData:
    def get_fundamentals(self, symbol: str):
        return None


def test_fundamentals_marks_missing_without_inventing_data():
    snapshot = build_fundamentals_snapshot("AAPL", EmptyMarketData())

    assert snapshot.status == "missing"
    assert snapshot.valuation == {}
    assert snapshot.unavailable_fields
