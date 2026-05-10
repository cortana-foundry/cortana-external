from __future__ import annotations

from datetime import UTC, datetime

import pytest
from pydantic import ValidationError

from market_lab.models import (
    ArtifactPaths,
    Interpretation,
    PriceFacts,
    ReviewArtifact,
    RunStatus,
    TradingAgentsReview,
    TrustVerdict,
)


def test_review_artifact_validates_minimal_blocked_shape():
    now = datetime.now(UTC)
    artifact = ReviewArtifact(
        run_id="mlab_test_AAPL",
        symbol="aapl",
        requested_at=now,
        completed_at=now,
        status=RunStatus.DONE,
        trust_verdict=TrustVerdict.BLOCKED,
        verdict_reasons=["price_data_stale"],
        price_facts=PriceFacts(symbol="aapl", price=100.0, timestamp=now),
        interpretation=Interpretation(summary="Blocked because price data is stale."),
        tradingagents=TradingAgentsReview(status="skipped", summary="Not run."),
        artifact_paths=ArtifactPaths(review="/tmp/review.json", events="/tmp/events.jsonl", logs="/tmp/logs.txt"),
    )

    assert artifact.symbol == "AAPL"
    assert artifact.price_facts
    assert artifact.price_facts.symbol == "AAPL"


def test_review_artifact_requires_trust_verdict():
    now = datetime.now(UTC)
    with pytest.raises(ValidationError):
        ReviewArtifact(
            run_id="mlab_test_AAPL",
            symbol="AAPL",
            requested_at=now,
            status=RunStatus.DONE,
            verdict_reasons=[],
            interpretation=Interpretation(summary="Missing verdict."),
            tradingagents=TradingAgentsReview(status="skipped", summary="Not run."),
            artifact_paths=ArtifactPaths(review="/tmp/review.json", events="/tmp/events.jsonl", logs="/tmp/logs.txt"),
        )
