"""Input normalization helpers for the trade lifecycle cycle."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any


def collect_signal_map(alerts: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    out: dict[str, dict[str, Any]] = {}
    for payload in alerts:
        strategy = str(payload.get("strategy") or "").strip().lower()
        for signal in payload.get("signals", []) or []:
            if not isinstance(signal, dict):
                continue
            symbol = str(signal.get("symbol") or "").strip().upper()
            if not symbol:
                continue
            copied = dict(signal)
            copied["strategy"] = strategy
            out[symbol] = copied
    return out


def entry_candidates(alerts: list[dict[str, Any]]) -> list[dict[str, Any]]:
    candidates: list[dict[str, Any]] = []
    for payload in alerts:
        strategy = str(payload.get("strategy") or "").strip().lower()
        for signal in payload.get("signals", []) or []:
            if not isinstance(signal, dict):
                continue
            if str(signal.get("action") or "").strip().upper() != "BUY":
                continue
            copied = dict(signal)
            copied["strategy"] = strategy
            candidates.append(copied)
    candidates.sort(
        key=lambda item: (
            float(item.get("trade_quality_score") or 0.0),
            float(item.get("effective_confidence") or 0.0),
        ),
        reverse=True,
    )
    return candidates


def signal_market(signal: dict[str, Any] | None, alerts: list[dict[str, Any]]) -> dict[str, Any]:
    symbol = str((signal or {}).get("symbol") or "").strip().upper()
    for payload in alerts:
        if not isinstance(payload, dict):
            continue
        for item in payload.get("signals", []) or []:
            if str(item.get("symbol") or "").strip().upper() == symbol:
                market = payload.get("market")
                if isinstance(market, dict):
                    return market
    return {}


def signal_overlays(signal: dict[str, Any] | None, alerts: list[dict[str, Any]]) -> dict[str, Any]:
    symbol = str((signal or {}).get("symbol") or "").strip().upper()
    for payload in alerts:
        if not isinstance(payload, dict):
            continue
        for item in payload.get("signals", []) or []:
            if str(item.get("symbol") or "").strip().upper() == symbol:
                overlays = payload.get("overlays")
                if isinstance(overlays, dict):
                    return overlays
    return {}


def signal_price(signal: dict[str, Any] | None) -> float | None:
    if not isinstance(signal, dict):
        return None
    rec = signal.get("rec") if isinstance(signal.get("rec"), dict) else {}
    for value in (signal.get("price"), rec.get("entry"), rec.get("price")):
        parsed = optional_float(value)
        if parsed is not None:
            return parsed
    return None


def entry_fill_price(*, signal: dict[str, Any], entry_plan: dict[str, Any]) -> float | None:
    price = signal_price(signal)
    ideal_min = optional_float(entry_plan.get("entry_price_ideal_min"))
    ideal_max = optional_float(entry_plan.get("entry_price_ideal_max"))
    if price is None and ideal_min is not None and ideal_max is not None:
        return round((ideal_min + ideal_max) / 2.0, 4)
    if price is None:
        return ideal_max or ideal_min
    if ideal_min is not None and price < ideal_min:
        return ideal_min
    if ideal_max is not None and price > ideal_max:
        return ideal_max
    return round(price, 4)


def build_review_notes(*, signal: dict[str, Any] | None, decision: Any) -> list[str]:
    notes: list[str] = []
    if isinstance(signal, dict):
        action = str(signal.get("action") or "").strip().upper()
        if action:
            notes.append(f"latest signal action {action}")
        reason = str(signal.get("reason") or "").strip()
        if reason:
            notes.append(reason)
    if getattr(decision, "reason", ""):
        notes.append(f"decision reason {decision.reason}")
    return notes


def normalize_timestamp(value: str) -> str:
    parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc).isoformat()


def optional_float(value: object) -> float | None:
    try:
        if value is None or value == "":
            return None
        numeric = float(value)
    except (TypeError, ValueError):
        return None
    if numeric <= 0 or numeric != numeric:
        return None
    return round(numeric, 4)
