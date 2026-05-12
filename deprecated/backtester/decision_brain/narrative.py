"""Bounded narrative discovery and overlay normalization."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any


def normalize_x_narrative_snapshot(
    *,
    symbol_rows: list[dict[str, Any]],
    generated_at: str,
    known_at: str,
) -> dict[str, Any]:
    new_tickers: list[dict[str, Any]] = []
    repeated_tickers: list[dict[str, Any]] = []
    accelerating_tickers: list[dict[str, Any]] = []
    crowded_tickers: list[dict[str, Any]] = []
    warnings: list[str] = []

    for row in symbol_rows:
        symbol = str(row.get("symbol") or "").strip().upper()
        if not symbol:
            continue
        mention_count = int(row.get("mention_count") or row.get("count") or 0)
        repeat_count = int(row.get("repeat_count") or 0)
        acceleration_score = float(row.get("acceleration_score") or 0.0)
        liquidity_tier = str(row.get("liquidity_tier") or "unknown").strip().lower()
        crowded_score = float(row.get("crowded_score") or 0.0)

        payload = {
            "symbol": symbol,
            "mention_count": mention_count,
            "repeat_count": repeat_count,
            "acceleration_score": acceleration_score,
            "crowded_score": crowded_score,
            "liquidity_tier": liquidity_tier,
        }
        if mention_count >= 1 and repeat_count == 0:
            new_tickers.append(payload)
        if repeat_count >= 2:
            repeated_tickers.append(payload)
        if acceleration_score >= 1.5:
            accelerating_tickers.append(payload)
        if crowded_score >= 0.75:
            crowded_tickers.append(payload)
        if liquidity_tier in {"low", "illiquid"} and acceleration_score >= 1.0:
            warnings.append(f"{symbol}: illiquid narrative burst remains discovery-only")

    return {
        "artifact_family": "narrative_discovery_snapshot",
        "schema_version": 1,
        "producer": "python.narrative.x_normalizer",
        "generated_at": _normalize_timestamp(generated_at),
        "known_at": _normalize_timestamp(known_at),
        "new_tickers": new_tickers,
        "repeated_tickers": repeated_tickers,
        "accelerating_tickers": accelerating_tickers,
        "crowded_tickers": crowded_tickers,
        "warnings": warnings,
        "authority_cap": "discovery_only",
    }


def normalize_polymarket_narrative_snapshot(
    *,
    report: dict[str, Any],
    generated_at: str,
    known_at: str,
) -> dict[str, Any]:
    summary = report.get("summary", {}) if isinstance(report.get("summary"), dict) else {}
    highlights = summary.get("themeHighlights", []) if isinstance(summary.get("themeHighlights"), list) else []
    divergence = summary.get("divergence", {}) if isinstance(summary.get("divergence"), dict) else {}
    theme_to_ticker_map: dict[str, list[str]] = {}
    support: list[dict[str, Any]] = []
    conflict: list[dict[str, Any]] = []

    for item in highlights:
        if not isinstance(item, dict):
            continue
        title = str(item.get("title") or "").strip()
        if not title:
            continue
        watch_tickers = [str(ticker).strip().upper() for ticker in item.get("watchTickers", []) if str(ticker).strip()]
        theme_to_ticker_map[title] = watch_tickers
        severity = str(item.get("severity") or "notable").strip().lower()
        bucket = {"theme": title, "tickers": watch_tickers, "severity": severity}
        if severity in {"major", "supportive"}:
            support.append(bucket)
        else:
            conflict.append(bucket)

    divergence_state = str(divergence.get("state") or "unknown").strip().lower()
    return {
        "artifact_family": "narrative_theme_snapshot",
        "schema_version": 1,
        "producer": "python.narrative.polymarket_normalizer",
        "generated_at": _normalize_timestamp(generated_at),
        "known_at": _normalize_timestamp(known_at),
        "theme_to_ticker_map": theme_to_ticker_map,
        "narrative_support": support,
        "narrative_conflict": conflict,
        "divergence_state": divergence_state,
        "authority_cap": "support_conflict_only",
    }


def build_bounded_narrative_overlay(
    *,
    x_snapshot: dict[str, Any] | None = None,
    polymarket_snapshot: dict[str, Any] | None = None,
) -> dict[str, Any]:
    x_snapshot = dict(x_snapshot or {})
    polymarket_snapshot = dict(polymarket_snapshot or {})

    priority_symbols: list[str] = []
    for bucket_name in ("accelerating_tickers", "repeated_tickers", "new_tickers"):
        for item in x_snapshot.get(bucket_name, []) if isinstance(x_snapshot.get(bucket_name), list) else []:
            symbol = str(item.get("symbol") or "").strip().upper()
            liquidity_tier = str(item.get("liquidity_tier") or "unknown").strip().lower()
            if not symbol or symbol in priority_symbols:
                continue
            if liquidity_tier in {"low", "illiquid"}:
                continue
            priority_symbols.append(symbol)

    confidence_nudges: list[dict[str, Any]] = []
    crowding_warnings: list[dict[str, Any]] = []
    for item in x_snapshot.get("crowded_tickers", []) if isinstance(x_snapshot.get("crowded_tickers"), list) else []:
        symbol = str(item.get("symbol") or "").strip().upper()
        crowded_score = float(item.get("crowded_score") or 0.0)
        if not symbol:
            continue
        crowding_warnings.append({"symbol": symbol, "crowded_score": crowded_score, "nudge": -5})
        confidence_nudges.append({"symbol": symbol, "source": "x_crowding", "delta_confidence": -5})

    theme_map = polymarket_snapshot.get("theme_to_ticker_map", {}) if isinstance(polymarket_snapshot.get("theme_to_ticker_map"), dict) else {}
    for theme, tickers in theme_map.items():
        for symbol in tickers[:3]:
            symbol = str(symbol).strip().upper()
            if not symbol:
                continue
            confidence_nudges.append({"symbol": symbol, "source": f"polymarket:{theme}", "delta_confidence": 3})

    return {
        "artifact_family": "bounded_narrative_overlay",
        "schema_version": 1,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "priority_symbols": priority_symbols[:10],
        "confidence_nudges": confidence_nudges[:20],
        "crowding_warnings": crowding_warnings[:10],
        "theme_to_ticker_map": theme_map,
        "buy_authority": False,
        "authority_cap": "discovery_and_confidence_nudges_only",
    }


def _normalize_timestamp(value: str) -> str:
    parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc).isoformat()
