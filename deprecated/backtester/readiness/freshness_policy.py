"""Central freshness windows for trading reliability gates."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class FreshnessPolicy:
    key: str
    max_age_seconds: int
    label: str

    @property
    def max_age_hours(self) -> float:
        return self.max_age_seconds / 3600.0


TRADING_FRESHNESS_POLICIES: dict[str, FreshnessPolicy] = {
    "market_data": FreshnessPolicy("market_data", 15 * 60, "Market data"),
    "runtime_health": FreshnessPolicy("runtime_health", 60 * 60, "Runtime health"),
    "lifecycle": FreshnessPolicy("lifecycle", 4 * 60 * 60, "Lifecycle"),
    "control_loop": FreshnessPolicy("control_loop", 4 * 60 * 60, "V4 control loop"),
    "prediction_scorecard": FreshnessPolicy("prediction_scorecard", 72 * 60 * 60, "Prediction scorecard"),
    "trading_summary": FreshnessPolicy("trading_summary", 24 * 60 * 60, "Trading summary"),
}


def freshness_policy(key: str) -> FreshnessPolicy:
    try:
        return TRADING_FRESHNESS_POLICIES[key]
    except KeyError as exc:
        raise ValueError(f"Unknown trading freshness policy: {key}") from exc
