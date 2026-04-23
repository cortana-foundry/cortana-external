"""Shared alert-runner helpers for strategy alert pipelines."""

from __future__ import annotations

import io
import os
import re
import warnings
from contextlib import redirect_stderr, redirect_stdout
from typing import Callable, TypeVar

from advisor import TradingAdvisor
from evaluation.prediction_accuracy import persist_prediction_snapshot

T = TypeVar("T")


def trade_quality_sort_key(record: dict) -> tuple:
    return (
        TradingAdvisor._action_priority(record.get("action", "NO_BUY")),
        int(bool(record.get("abstain", False))),
        -float(record.get("trade_quality_score", record.get("score", 0))),
        -float(record.get("effective_confidence", 0)),
        float(record.get("uncertainty_pct", 0)),
        -float(record.get("score", 0)),
        str(record.get("symbol", "")),
    )


def run_quiet(fn: Callable[..., T], *args, **kwargs) -> T:
    with warnings.catch_warnings(), redirect_stdout(io.StringIO()), redirect_stderr(io.StringIO()):
        warnings.simplefilter("ignore")
        return fn(*args, **kwargs)


def dedupe_reason(reason: str) -> str:
    reason = re.sub(r"\s+", " ", (reason or "").strip())
    return reason.rstrip(".")


def age_to_human(seconds: float) -> str:
    seconds = max(float(seconds or 0.0), 0.0)
    if seconds < 60:
        return f"{int(seconds)}s"
    if seconds < 3600:
        return f"{int(seconds // 60)}m"
    return f"{seconds / 3600:.1f}h"


def market_degraded_warning_line(market) -> str:
    if getattr(market, "status", "ok") != "degraded":
        return ""
    reason = dedupe_reason(getattr(market, "degraded_reason", "") or "Market regime inputs are degraded")
    age_seconds = float(getattr(market, "snapshot_age_seconds", 0.0) or 0.0)
    if age_seconds > 0:
        reason += f" (snapshot age {age_to_human(age_seconds)})"
    return f"Warning: degraded market regime input — {reason}"


def market_recovery_line(market) -> str:
    if getattr(market, "status", "ok") != "degraded":
        return ""
    next_action = dedupe_reason(getattr(market, "next_action", "") or "")
    if not next_action:
        return ""
    return f"Recovery: {next_action}"


def top_names(records: list[dict], limit: int = 3) -> str:
    names = []
    seen = set()
    for rec in records:
        sym = rec.get("symbol")
        if sym and sym not in seen:
            seen.add(sym)
            names.append(sym)
        if len(names) >= limit:
            break
    return ", ".join(names) if names else "none"


def append_pipeline_contract_summary(
    lines: list[str],
    *,
    scanned: int,
    evaluated: int,
    threshold_passed: int,
    buy_count: int,
    watch_count: int,
    no_buy_count: int,
) -> None:
    lines.append(
        "Summary: "
        f"scanned {scanned} | "
        f"evaluated {evaluated} | "
        f"threshold-passed {threshold_passed} | "
        f"BUY {buy_count} | WATCH {watch_count} | NO_BUY {no_buy_count}"
    )


def append_pipeline_contract_signals(lines: list[str], records: list[dict]) -> None:
    for record in records:
        symbol = str(record.get("symbol", "")).strip().upper()
        if not symbol:
            continue
        score = int(record.get("score", 0) or 0)
        action = str(record.get("action", "NO_BUY")).strip().upper()
        reason = str(record.get("reason", "No reason provided.")).strip() or "No reason provided."
        lines.append(f"• {symbol} ({score}/12) → {action}")
        lines.append(reason)


def persist_strategy_predictions(
    *,
    strategy: str,
    producer: str,
    market: object,
    records: list[dict],
    persist_fn: Callable[..., object] = persist_prediction_snapshot,
) -> None:
    if os.getenv("PREDICTION_ACCURACY_ENABLED", "1") == "0":
        return
    try:
        persist_fn(
            strategy=strategy,
            market_regime=getattr(getattr(market, "regime", None), "value", "unknown"),
            records=records,
            producer=producer,
        )
    except Exception:
        return
