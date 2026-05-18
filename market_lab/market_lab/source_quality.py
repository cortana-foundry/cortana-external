from __future__ import annotations

import re
from datetime import UTC, datetime

from .models import SentimentSnapshot, SourceItem, SourceQualitySnapshot

CATALYST_TERMS = (
    "earnings",
    "guidance",
    "upgrade",
    "downgrade",
    "analyst",
    "launch",
    "lawsuit",
    "regulator",
    "merger",
    "deal",
    "revenue",
    "margin",
)

NOISE_TERMS = (
    "join my discord",
    "premium signals",
    "free signals",
    "whatsapp",
    "guaranteed profit",
    "100% win",
    "pump",
)

BROAD_MARKET_TERMS = (
    "dow jones",
    "nasdaq",
    "s&p",
    "s&p 500",
    "market",
    "futures",
    "fed",
)


def build_source_quality_snapshot(symbol: str, sentiment_snapshot: SentimentSnapshot | None) -> SourceQualitySnapshot:
    normalized = symbol.strip().upper()
    now = datetime.now(UTC)
    if sentiment_snapshot is None:
        return SourceQualitySnapshot(
            status="missing",
            generated_at=now,
            symbol=normalized,
            missing_sources=["yahoo_finance_news", "stocktwits", "reddit"],
            notes=["No news or sentiment snapshot was collected for this run."],
        )

    source_status = {source.source: source.status for source in sentiment_snapshot.sources}
    items: list[SourceItem] = []
    seen: set[str] = set()
    noise_filtered_count = 0

    for source in sentiment_snapshot.sources:
        for sample in source.samples[:12]:
            title, label = _normalize_sample(sample)
            if not title or _is_noise(title):
                noise_filtered_count += 1
                continue
            key = _dedupe_key(title)
            if key in seen:
                noise_filtered_count += 1
                continue
            seen.add(key)
            relevance, reason, flags = _score_relevance(normalized, title, source.source)
            if relevance < 0.35:
                noise_filtered_count += 1
                continue
            items.append(
                SourceItem(
                    source=source.source,
                    title=title[:240],
                    url=source.request_url,
                    fetched_at=source.fetched_at,
                    relevance_score=relevance,
                    match_reason=reason,
                    sentiment_label=label,
                    quality_flags=flags,
                    excerpt=title[:320],
                )
            )

    available_sources = [source for source in sentiment_snapshot.sources if source.status == "available"]
    error_sources = [source for source in sentiment_snapshot.sources if source.status in {"error", "rate_limited"}]
    if items and error_sources:
        status = "partial"
    elif items:
        status = "available"
    elif error_sources:
        status = "error"
    else:
        status = "missing"

    sorted_items = sorted(items, key=lambda item: item.relevance_score, reverse=True)
    return SourceQualitySnapshot(
        status=status,
        generated_at=now,
        symbol=normalized,
        items=sorted_items[:20],
        source_status=source_status,
        why_this_matters=_why_this_matters(sorted_items),
        catalysts=_catalysts(sorted_items),
        cautions=_cautions(sentiment_snapshot, sorted_items, noise_filtered_count),
        noise_filtered_count=noise_filtered_count,
        missing_sources=[source.source for source in sentiment_snapshot.sources if source.status != "available"],
        notes=[*sentiment_snapshot.notes, f"{len(available_sources)} source(s) available."],
    )


def _normalize_sample(sample: str) -> tuple[str, str]:
    text = re.sub(r"\s+", " ", sample.strip())
    if not text:
        return "", "unknown"
    lowered = text.lower()
    for prefix, label in [
        ("bullish:", "bullish"),
        ("bearish:", "bearish"),
        ("neutral:", "neutral"),
        ("unlabeled:", "unknown"),
    ]:
        if lowered.startswith(prefix):
            return text[len(prefix) :].strip(), label
    return text, "unknown"


def _dedupe_key(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", text.lower()).strip()


def _is_noise(text: str) -> bool:
    lowered = text.lower()
    if len(re.findall(r"[a-zA-Z0-9]", lowered)) < 8:
        return True
    if any(term in lowered for term in NOISE_TERMS):
        return True
    words = re.findall(r"[a-zA-Z]{3,}", lowered)
    return len(words) < 2


def _score_relevance(symbol: str, text: str, source: str) -> tuple[float, str, list[str]]:
    lowered = text.lower()
    flags: list[str] = []
    if symbol.lower() in lowered or f"${symbol.lower()}" in lowered:
        return 1.0, "mentions symbol", flags
    if source == "stocktwits":
        return 0.85, "symbol stream item", flags
    if any(term in lowered for term in BROAD_MARKET_TERMS):
        flags.append("broad_market")
        return 0.45, "broad market context", flags
    return 0.65, "source query match", flags


def _why_this_matters(items: list[SourceItem]) -> list[str]:
    if not items:
        return ["No usable source samples were available."]
    return [f"{item.source}: {item.title}" for item in items[:5]]


def _catalysts(items: list[SourceItem]) -> list[str]:
    catalysts = []
    for item in items:
        lowered = item.title.lower()
        if any(term in lowered for term in CATALYST_TERMS):
            catalysts.append(f"{item.source}: {item.title}")
    return catalysts[:5]


def _cautions(snapshot: SentimentSnapshot, items: list[SourceItem], noise_filtered_count: int) -> list[str]:
    cautions: list[str] = []
    if noise_filtered_count:
        cautions.append(f"{noise_filtered_count} low-quality or duplicate source sample(s) filtered.")
    for source in snapshot.sources:
        if source.status in {"error", "rate_limited"}:
            cautions.append(f"{source.source} unavailable: {source.error_message or source.status}.")
        elif source.status in {"empty", "missing"}:
            cautions.append(f"{source.source} returned no usable samples.")
    if not any(item.relevance_score >= 0.85 for item in items):
        cautions.append("No high-relevance symbol-specific news item was found.")
    return cautions[:6]
