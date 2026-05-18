from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from .models import FundamentalsSnapshot

FIELD_GROUPS = {
    "valuation": {
        "market_cap": ("marketCap", "market_cap", "MarketCapitalization"),
        "trailing_pe": ("trailingPE", "trailing_pe", "peRatio", "pe_ratio"),
        "forward_pe": ("forwardPE", "forward_pe"),
        "price_to_sales": ("priceToSalesTrailing12Months", "price_to_sales", "priceSales"),
    },
    "earnings": {
        "next_earnings_date": ("nextEarningsDate", "earningsDate", "earnings_date"),
        "eps": ("eps", "trailingEps", "epsTrailingTwelveMonths"),
        "eps_surprise": ("epsSurprise", "eps_surprise"),
    },
    "trends": {
        "revenue_growth": ("revenueGrowth", "revenue_growth"),
        "earnings_growth": ("earningsGrowth", "earnings_growth"),
    },
    "quality": {
        "gross_margin": ("grossMargins", "gross_margin"),
        "operating_margin": ("operatingMargins", "operating_margin"),
        "net_margin": ("profitMargins", "net_margin"),
    },
    "analyst_context": {
        "consensus_rating": ("recommendationKey", "consensus_rating", "analystRating"),
        "price_target": ("targetMeanPrice", "price_target", "targetPrice"),
    },
}


def build_fundamentals_snapshot(symbol: str, market_data: Any) -> FundamentalsSnapshot:
    normalized = symbol.strip().upper()
    payload = _safe_payload(market_data, normalized)
    if payload is None:
        return FundamentalsSnapshot(
            status="missing",
            generated_at=datetime.now(UTC),
            symbol=normalized,
            unavailable_fields=_all_fields(),
            notes=["Fundamentals payload was unavailable from the market data service."],
        )

    data = _extract_payload(payload)
    groups: dict[str, dict[str, Any]] = {}
    unavailable: list[str] = []
    for group, fields in FIELD_GROUPS.items():
        groups[group] = {}
        for output_key, aliases in fields.items():
            value = _first_value(data, aliases)
            if value is None:
                unavailable.append(f"{group}.{output_key}")
            else:
                groups[group][output_key] = value

    present_count = sum(len(item) for item in groups.values())
    if present_count >= 6:
        status = "available"
    elif present_count > 0:
        status = "partial"
    else:
        status = "missing"

    return FundamentalsSnapshot(
        status=status,
        generated_at=datetime.now(UTC),
        symbol=normalized,
        source=str(payload.get("source") or "market-data-service"),
        valuation=groups["valuation"],
        earnings=groups["earnings"],
        trends=groups["trends"],
        quality=groups["quality"],
        analyst_context=groups["analyst_context"],
        unavailable_fields=unavailable,
        notes=_notes(status, present_count, len(unavailable)),
    )


def _safe_payload(market_data: Any, symbol: str) -> dict[str, Any] | None:
    getter = getattr(market_data, "get_fundamentals", None)
    if not callable(getter):
        return None
    try:
        payload = getter(symbol)
    except Exception:
        return None
    return payload if isinstance(payload, dict) else None


def _extract_payload(payload: dict[str, Any]) -> dict[str, Any]:
    data = payload.get("data")
    if isinstance(data, dict):
        nested = data.get("payload")
        return nested if isinstance(nested, dict) else data
    payload_value = payload.get("payload")
    if isinstance(payload_value, dict):
        return payload_value
    return payload


def _first_value(payload: dict[str, Any], aliases: tuple[str, ...]) -> Any:
    for alias in aliases:
        value = _search_key(payload, alias)
        if value is not None and value != "":
            return value
    return None


def _search_key(payload: Any, key: str) -> Any:
    if isinstance(payload, dict):
        if key in payload:
            return payload[key]
        for value in payload.values():
            found = _search_key(value, key)
            if found is not None:
                return found
    elif isinstance(payload, list):
        for item in payload:
            found = _search_key(item, key)
            if found is not None:
                return found
    return None


def _all_fields() -> list[str]:
    return [f"{group}.{field}" for group, fields in FIELD_GROUPS.items() for field in fields]


def _notes(status: str, present_count: int, missing_count: int) -> list[str]:
    if status == "available":
        return [f"{present_count} fundamentals fields available; {missing_count} optional field(s) unavailable."]
    if status == "partial":
        return [f"{present_count} fundamentals fields available; missing fields are explicit."]
    return ["No usable fundamentals fields were available."]
