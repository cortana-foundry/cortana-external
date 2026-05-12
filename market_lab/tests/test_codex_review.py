from __future__ import annotations

from datetime import UTC, datetime
from pathlib import Path

from market_lab.codex_review import CODEX_SCHEMA, build_codex_packet
from market_lab.models import (
    ArtifactPaths,
    CheckResult,
    CheckSeverity,
    Interpretation,
    OptionalEvidence,
    PriceFacts,
    ReviewArtifact,
    RunRecord,
    RunStatus,
    TradingAgentsReview,
    TrustVerdict,
)


def make_artifact() -> ReviewArtifact:
    now = datetime.now(UTC)
    run_dir = Path("/tmp/mlab_test_AAPL")
    return ReviewArtifact(
        run_id="mlab_test_AAPL",
        symbol="AAPL",
        requested_at=now,
        completed_at=now,
        status=RunStatus.DONE,
        trust_verdict=TrustVerdict.TRUSTED,
        verdict_reasons=["all_required_evidence_passed"],
        price_facts=PriceFacts(symbol="AAPL", price=100, timestamp=now, source="schwab_streamer"),
        spy_facts=PriceFacts(symbol="SPY", price=500, timestamp=now, source="schwab_streamer"),
        checks=[
            CheckResult(code="price_present", severity=CheckSeverity.INFO, message="AAPL price is available."),
            CheckResult(code="news_missing", severity=CheckSeverity.WARNING, message="Optional news evidence is missing."),
        ],
        optional_evidence=OptionalEvidence(
            history_status="available",
            fundamentals_status="missing",
            news_status="missing",
            sentiment_status="missing",
            notes=["news and sentiment are not wired in v0"],
        ),
        interpretation=Interpretation(summary="Review is trusted."),
        tradingagents=TradingAgentsReview(status="skipped", summary="Codex review available."),
        artifact_paths=ArtifactPaths(
            review=str(run_dir / "review.json"),
            events=str(run_dir / "events.jsonl"),
            logs=str(run_dir / "logs.txt"),
            codex_packet=str(run_dir / "codex-review-packet.md"),
            codex_review=str(run_dir / "codex-review.md"),
        ),
    )


def test_codex_packet_requires_v1_schema_and_roles():
    packet = build_codex_packet(make_artifact())

    assert f"```json {CODEX_SCHEMA}" in packet
    for role in ["price_action", "fundamentals", "news_sentiment", "risk", "final_judge"]:
        assert f'"role": "{role}"' in packet
    assert "confidence" in packet
    assert "evidence_used" in packet


def test_codex_packet_explains_context_and_missing_fact_rules():
    packet = build_codex_packet(make_artifact())

    assert "SPY is the benchmark" in packet
    assert "Alpha versus SPY" in packet
    assert "Do not infer unavailable facts" in packet
    assert "Missing context: fundamentals, news, sentiment" in packet


def test_codex_packet_retires_old_markdown_as_primary_contract():
    packet = build_codex_packet(make_artifact())

    assert "The old free-form `Summary / Bull Case / Bear Case / Decision` shape is not the primary contract." in packet
    assert "Summary:\n..." not in packet
    assert "Bull Case:\n- ..." not in packet


def test_codex_packet_includes_prior_run_settlement_context():
    now = datetime.now(UTC)
    prior = RunRecord(
        run_id="mlab_prior_AAPL",
        symbol="AAPL",
        requested_at=now,
        status=RunStatus.DONE,
        trust_verdict=TrustVerdict.TRUSTED,
        run_dir="/tmp/mlab_prior_AAPL",
        review_path="/tmp/mlab_prior_AAPL/review.json",
        events_path="/tmp/mlab_prior_AAPL/events.jsonl",
        logs_path="/tmp/mlab_prior_AAPL/logs.txt",
        created_at=now,
        updated_at=now,
    )

    packet = build_codex_packet(
        make_artifact(),
        prior_runs=[prior],
        prior_settlements={
            "mlab_prior_AAPL": [
                {"window": "1d", "status": "settled", "score": "success", "alpha_vs_spy_pct": 2.5},
            ],
        },
    )

    assert "mlab_prior_AAPL" in packet
    assert "settlements=1d:settled, score=success, alpha_vs_spy=2.50%" in packet
