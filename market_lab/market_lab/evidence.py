from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from .models import (
    CheckResult,
    EvidenceSnapshot,
    FundamentalsSnapshot,
    MomentumSnapshot,
    OptionalEvidence,
    PriceFacts,
    SentimentSnapshot,
    SourceQualitySnapshot,
)


def _fact_summary(facts: PriceFacts | None) -> dict[str, Any]:
    if facts is None:
        return {"status": "missing"}
    return {
        "status": "available",
        "symbol": facts.symbol,
        "price": facts.price,
        "timestamp": facts.timestamp.isoformat(),
        "source": facts.source,
        "provider_mode": facts.provider_mode,
        "price_basis": facts.price_basis,
        "volume": facts.volume,
    }


def _missing_context(optional: OptionalEvidence, sentiment: SentimentSnapshot | None) -> list[str]:
    missing: list[str] = []
    for label, status in [
        ("history", optional.history_status),
        ("fundamentals", optional.fundamentals_status),
        ("news", optional.news_status),
        ("sentiment", optional.sentiment_status),
    ]:
        if status != "available":
            missing.append(label)
    if sentiment:
        missing.extend(item for item in sentiment.missing_sources if item not in missing)
    return missing


def _source_quality_summary(source_quality: SourceQualitySnapshot | None) -> dict[str, Any] | None:
    if source_quality is None:
        return None
    return {
        "status": source_quality.status,
        "source_status": source_quality.source_status,
        "items_count": len(source_quality.items),
        "why_this_matters": source_quality.why_this_matters,
        "catalysts": source_quality.catalysts,
        "cautions": source_quality.cautions,
        "missing_sources": source_quality.missing_sources,
    }


def _momentum_summary(momentum: MomentumSnapshot | None) -> dict[str, Any] | None:
    if momentum is None:
        return None
    return {
        "status": momentum.status,
        "summary": momentum.summary,
        "windows": [item.model_dump(mode="json") for item in momentum.windows],
        "unavailable_windows": momentum.unavailable_windows,
    }


def _fundamentals_summary(fundamentals: FundamentalsSnapshot | None) -> dict[str, Any] | None:
    if fundamentals is None:
        return None
    return {
        "status": fundamentals.status,
        "valuation": fundamentals.valuation,
        "earnings": fundamentals.earnings,
        "trends": fundamentals.trends,
        "quality": fundamentals.quality,
        "analyst_context": fundamentals.analyst_context,
        "unavailable_fields": fundamentals.unavailable_fields,
        "notes": fundamentals.notes,
    }


def build_evidence_snapshot(
    *,
    symbol: str,
    price_facts: PriceFacts | None,
    spy_facts: PriceFacts | None,
    checks: list[CheckResult],
    optional_evidence: OptionalEvidence,
    sentiment_snapshot: SentimentSnapshot | None = None,
    source_quality_snapshot: SourceQualitySnapshot | None = None,
    momentum_snapshot: MomentumSnapshot | None = None,
    fundamentals_snapshot: FundamentalsSnapshot | None = None,
) -> EvidenceSnapshot:
    blockers = [item.code for item in checks if item.severity == "blocker"]
    warnings = [item.code for item in checks if item.severity == "warning"]
    news_summary = None
    sentiment_summary = None
    if sentiment_snapshot:
        news_sources = [item for item in sentiment_snapshot.sources if item.source == "yahoo_finance_news"]
        social_sources = [item for item in sentiment_snapshot.sources if item.source in {"stocktwits", "reddit"}]
        news_summary = {
            "status": news_sources[0].status if news_sources else "missing",
            "sources": [item.model_dump(mode="json") for item in news_sources],
        }
        sentiment_summary = {
            "status": sentiment_snapshot.status,
            "sources": [item.model_dump(mode="json") for item in social_sources],
            "notes": sentiment_snapshot.notes,
        }
    return EvidenceSnapshot(
        symbol=symbol,
        generated_at=datetime.now(UTC),
        price_summary=_fact_summary(price_facts),
        benchmark_summary=_fact_summary(spy_facts),
        momentum_summary=_momentum_summary(momentum_snapshot)
        or {"status": "missing", "reason": "momentum adapter did not produce a usable snapshot"},
        fundamentals_summary=_fundamentals_summary(fundamentals_snapshot) or {"status": optional_evidence.fundamentals_status},
        news_summary=news_summary or _source_quality_summary(source_quality_snapshot) or {"status": optional_evidence.news_status},
        sentiment_summary=sentiment_summary or {"status": optional_evidence.sentiment_status},
        risk_flags=blockers + warnings,
        missing_context=_missing_context(optional_evidence, sentiment_snapshot),
        check_summary=[item.model_dump(mode="json") for item in checks],
    )
