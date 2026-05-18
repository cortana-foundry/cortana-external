from __future__ import annotations

from datetime import UTC, datetime

from market_lab.models import SentimentSnapshot, SentimentSourceResult
from market_lab.source_quality import build_source_quality_snapshot


def test_source_quality_filters_noise_and_preserves_attribution():
    now = datetime.now(UTC)
    snapshot = SentimentSnapshot(
        status="partial",
        sources=[
            SentimentSourceResult(
                source="yahoo_finance_news",
                status="available",
                fetched_at=now,
                sample_count=3,
                fetch_method="rss",
                request_url="https://example.test/yahoo",
                samples=[
                    "AAPL earnings guidance improves after services growth",
                    "AAPL earnings guidance improves after services growth",
                    "Dow futures drift before Fed decision",
                ],
            ),
            SentimentSourceResult(
                source="stocktwits",
                status="available",
                fetched_at=now,
                sample_count=1,
                fetch_method="stream",
                request_url="https://example.test/stocktwits",
                samples=["Bullish: $AAPL demand still looks strong", "Join my Discord for premium signals"],
            ),
            SentimentSourceResult(
                source="reddit",
                status="error",
                fetched_at=now,
                sample_count=0,
                fetch_method="rss",
                request_url="https://example.test/reddit",
                error_message="HTTP 429",
            ),
        ],
    )

    quality = build_source_quality_snapshot("AAPL", snapshot)

    assert quality.status == "partial"
    assert quality.source_status["reddit"] == "error"
    assert quality.missing_sources == ["reddit"]
    assert quality.noise_filtered_count >= 1
    assert all("Discord" not in item.title for item in quality.items)
    assert quality.items[0].source in {"yahoo_finance_news", "stocktwits"}
    assert quality.items[0].url
    assert any("earnings guidance" in item for item in quality.why_this_matters)
    assert any("reddit unavailable" in item.lower() for item in quality.cautions)
