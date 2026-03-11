"""Outcome labeling utilities for realized trades and forward windows."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Dict

import pandas as pd


@dataclass(frozen=True)
class OutcomeLabel:
    """Normalized outcome label for a realized trade."""

    label: str
    bucket: str
    holding_days: int


def label_trade_outcome(
    pnl_pct: float,
    exit_reason: str,
    holding_days: int,
    *,
    scratch_band_pct: float = 1.0,
    win_threshold_pct: float = 4.0,
    outsized_win_threshold_pct: float = 12.0,
) -> OutcomeLabel:
    """Map a realized trade into a reviewable outcome label."""
    holding_days = max(int(holding_days), 0)
    exit_reason = (exit_reason or "").lower()

    if exit_reason == "stop_loss":
        label = "quick_stop" if holding_days <= 3 else "stopped_out"
        return OutcomeLabel(label=label, bucket="loss", holding_days=holding_days)

    if pnl_pct >= outsized_win_threshold_pct:
        return OutcomeLabel(label="outsized_win", bucket="win", holding_days=holding_days)

    if pnl_pct >= win_threshold_pct:
        return OutcomeLabel(label="trend_win", bucket="win", holding_days=holding_days)

    if abs(pnl_pct) < scratch_band_pct:
        return OutcomeLabel(label="scratch", bucket="neutral", holding_days=holding_days)

    if pnl_pct > 0:
        return OutcomeLabel(label="small_win", bucket="win", holding_days=holding_days)

    label = "controlled_loss" if pnl_pct > -win_threshold_pct else "failed_trade"
    return OutcomeLabel(label=label, bucket="loss", holding_days=holding_days)


def annotate_trade_outcomes(trades: pd.DataFrame) -> pd.DataFrame:
    """Attach outcome labels to a trades dataframe."""
    if trades.empty:
        return trades.copy()

    annotated = trades.copy()
    if "holding_days" not in annotated.columns:
        holding_days = (
            pd.to_datetime(annotated["exit_date"]) - pd.to_datetime(annotated["entry_date"])
        ).dt.days.fillna(0)
        annotated["holding_days"] = holding_days.astype(int)

    outcomes = [
        label_trade_outcome(
            float(row.pnl_pct),
            str(row.exit_reason),
            int(row.holding_days),
        )
        for row in annotated.itertuples(index=False)
    ]
    annotated["outcome_label"] = [o.label for o in outcomes]
    annotated["outcome_bucket"] = [o.bucket for o in outcomes]
    return annotated


def summarize_outcomes(trades: pd.DataFrame) -> Dict[str, int]:
    """Return a flat summary of outcome labels for downstream reporting."""
    annotated = annotate_trade_outcomes(trades)
    if annotated.empty:
        return {}
    return annotated["outcome_label"].value_counts().sort_index().to_dict()
