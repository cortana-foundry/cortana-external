"""Multi-timeframe confirmation helpers for intraday authority."""

from __future__ import annotations

from typing import Any


def build_multi_timeframe_context(
    *,
    regime_label: str | None = None,
    tape: dict[str, float] | None = None,
    weekly_confirmed: bool | None = None,
    daily_confirmed: bool | None = None,
) -> dict[str, Any]:
    tape = dict(tape or {})
    qqq = float(tape.get("QQQ", 0.0) or 0.0)
    spy = float(tape.get("SPY", 0.0) or 0.0)
    iwm = float(tape.get("IWM", 0.0) or 0.0)
    short_term_confirmed = qqq >= 0.75 and spy >= 0.5 and iwm >= 0.25

    daily = bool(daily_confirmed) if daily_confirmed is not None else short_term_confirmed
    weekly = bool(weekly_confirmed) if weekly_confirmed is not None else regime_label == "confirmed_uptrend"
    confirmation_score = int(weekly) + int(daily) + int(short_term_confirmed)

    if confirmation_score >= 3:
        authority_cap = "selective_buy"
    elif confirmation_score >= 1:
        authority_cap = "watch_only"
    else:
        authority_cap = "inactive"

    return {
        "weekly_confirmed": weekly,
        "daily_confirmed": daily,
        "short_term_confirmed": short_term_confirmed,
        "confirmation_score": confirmation_score,
        "authority_cap": authority_cap,
    }
