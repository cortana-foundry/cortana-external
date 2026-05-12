"""Read-only risk budget overlay derived from existing regime and stress inputs."""

from __future__ import annotations

from dataclasses import asdict, dataclass
from typing import Any, Literal, Mapping, Optional

from data.adverse_regime import build_adverse_regime_indicator
from data.market_regime import MarketRegime

RiskBudgetTier = Literal["unavailable", "closed", "tight", "balanced", "open"]
AggressionDial = Literal["lean_more_selective", "no_change", "lean_more_aggressive"]
SizeTier = Literal["no_size", "starter", "half", "full"]


@dataclass(frozen=True)
class RiskBudgetOverlay:
    tier: RiskBudgetTier
    aggression_dial: AggressionDial
    budget_fraction: float
    budget_pct: int
    regime: str
    adverse_label: str
    explanation: str
    reasons: list[str]
    source: str
    state: str = "unknown"
    status: str = "unknown"
    label: str = "unknown"
    aggression_posture: str = "unknown"
    risk_budget_remaining: float = 0.0
    exposure_cap_hint: float = 0.0

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass(frozen=True)
class PositionSizeRecommendation:
    size_tier: SizeTier
    capital_fraction: float
    confidence_pct: float | None
    liquidity_penalty_bps: float | None
    suppressed: bool
    suppression_reason: str | None
    notes: list[str]

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def build_risk_budget_overlay(
    *,
    market: Optional[object],
    risk_inputs: Optional[Mapping[str, object]] = None,
    adverse_regime: Optional[Mapping[str, object]] = None,
) -> RiskBudgetOverlay:
    if market is None:
        return RiskBudgetOverlay(
            tier="unavailable",
            aggression_dial="no_change",
            budget_fraction=0.0,
            budget_pct=0,
            regime="unavailable",
            adverse_label="unavailable",
            explanation="Risk budget unavailable: market regime inputs unavailable.",
            reasons=["market regime inputs unavailable"],
            source="unavailable",
            state="unavailable",
            status="unavailable",
            label="unavailable",
            aggression_posture="no_change",
            risk_budget_remaining=0.0,
            exposure_cap_hint=0.0,
        )

    regime = _normalize_regime(getattr(market, "regime", None))
    position_sizing = _clamp(_safe_float(getattr(market, "position_sizing", 0.0), 0.0), 0.0, 1.0)
    degraded = str(getattr(market, "status", "ok") or "ok").strip().lower() == "degraded"

    stress = dict(
        adverse_regime
        or build_adverse_regime_indicator(
            market=market,
            risk_inputs=dict(risk_inputs or {}),
        )
    )
    adverse_label = str(stress.get("label", "normal") or "normal").strip().lower()
    stress_multiplier = _clamp(_safe_float(stress.get("size_multiplier"), 1.0), 0.0, 1.0)

    budget_fraction = position_sizing * stress_multiplier
    if degraded:
        budget_fraction *= 0.85
    budget_fraction = round(_clamp(budget_fraction, 0.0, 1.0), 2)

    if regime == MarketRegime.CORRECTION.value or position_sizing <= 0.0:
        tier: RiskBudgetTier = "closed"
        aggression_dial: AggressionDial = "lean_more_selective"
        budget_fraction = 0.0
    else:
        tier = _tier_for_fraction(budget_fraction)
        if adverse_label in {"elevated", "severe"}:
            tier = _downgrade_tier(tier)
        aggression_dial = _dial_for_context(
            regime=regime,
            tier=tier,
            degraded=degraded,
            adverse_label=adverse_label,
        )

    reasons = _build_reasons(
        regime=regime,
        position_sizing=position_sizing,
        degraded=degraded,
        adverse_regime=stress,
    )
    explanation = _build_explanation(
        tier=tier,
        regime=regime,
        adverse_label=adverse_label,
        reasons=reasons,
    )

    return RiskBudgetOverlay(
        tier=tier,
        aggression_dial=aggression_dial,
        budget_fraction=budget_fraction,
        budget_pct=int(round(budget_fraction * 100)),
        regime=regime,
        adverse_label=adverse_label,
        explanation=explanation,
        reasons=reasons,
        source=str(stress.get("source", "market_status") or "market_status"),
        state=tier,
        status=tier,
        label=tier,
        aggression_posture=aggression_dial,
        risk_budget_remaining=budget_fraction,
        exposure_cap_hint=budget_fraction,
    )


def build_position_size_recommendation(
    *,
    signal: Optional[Mapping[str, object]],
    risk_overlay: Optional[Mapping[str, object]],
    execution_policy: Optional[Mapping[str, object]] = None,
    data_quality_state: str | None = None,
) -> PositionSizeRecommendation:
    rec = dict(signal or {})
    risk = dict(risk_overlay or {})
    policy = dict(execution_policy or {})

    confidence_pct = _safe_float(
        rec.get("effective_confidence", rec.get("confidence")),
        None,
    )
    liquidity_penalty_bps = _safe_float(policy.get("liquidity_penalty_bps"), None)
    fill_allowed = bool(policy.get("fill_allowed", True))
    signal_risk = str(rec.get("risk") or "unknown").strip().lower()
    quality_state = str(data_quality_state or rec.get("data_quality_state") or "ok").strip().lower()
    risk_state = str(
        risk.get("state")
        or risk.get("tier")
        or risk.get("status")
        or "unavailable"
    ).strip().lower()
    budget_fraction = _clamp(_safe_float(risk.get("budget_fraction"), 0.0), 0.0, 1.0)

    if not fill_allowed:
        return PositionSizeRecommendation(
            size_tier="no_size",
            capital_fraction=0.0,
            confidence_pct=confidence_pct,
            liquidity_penalty_bps=liquidity_penalty_bps,
            suppressed=True,
            suppression_reason=str(policy.get("blocked_reason") or "execution_blocked"),
            notes=["execution policy blocked the trade"],
        )
    if quality_state == "degraded_risky":
        return PositionSizeRecommendation(
            size_tier="no_size",
            capital_fraction=0.0,
            confidence_pct=confidence_pct,
            liquidity_penalty_bps=liquidity_penalty_bps,
            suppressed=True,
            suppression_reason="degraded_risky_inputs",
            notes=["data quality is degraded_risky"],
        )
    if risk_state in {"closed", "unavailable"}:
        return PositionSizeRecommendation(
            size_tier="no_size",
            capital_fraction=0.0,
            confidence_pct=confidence_pct,
            liquidity_penalty_bps=liquidity_penalty_bps,
            suppressed=True,
            suppression_reason="risk_budget_closed",
            notes=["risk budget is closed or unavailable"],
        )

    tier: SizeTier = {
        "tight": "starter",
        "balanced": "half",
        "open": "full",
    }.get(risk_state, "starter")
    notes: list[str] = [f"risk budget {risk_state}"]

    if quality_state == "degraded":
        tier = _downgrade_size_tier(tier)
        notes.append("degraded inputs downgraded size")
    if confidence_pct is not None and confidence_pct < 55:
        tier = _downgrade_size_tier(tier)
        notes.append("confidence below 55% downgraded size")
    if liquidity_penalty_bps is not None and liquidity_penalty_bps >= 50:
        tier = _downgrade_size_tier(tier)
        notes.append("liquidity penalty above 50bps downgraded size")
    if signal_risk == "high":
        tier = "half" if tier == "full" else _downgrade_size_tier(tier)
        notes.append("high-risk setup cannot receive full size")

    capital_fraction = _capital_fraction_for_tier(tier, budget_fraction)
    suppressed = tier == "no_size" or capital_fraction <= 0
    return PositionSizeRecommendation(
        size_tier=tier,
        capital_fraction=capital_fraction,
        confidence_pct=confidence_pct,
        liquidity_penalty_bps=liquidity_penalty_bps,
        suppressed=suppressed,
        suppression_reason="size_suppressed" if suppressed else None,
        notes=notes,
    )


def _normalize_regime(value: object) -> str:
    if isinstance(value, MarketRegime):
        return value.value
    normalized = str(value or "").strip().lower()
    return normalized or "unknown"


def _safe_float(value: object, default: float) -> float:
    try:
        if value is None:
            return default
        return float(value)
    except (TypeError, ValueError):
        return default


def _clamp(value: float, low: float, high: float) -> float:
    return max(low, min(high, value))


def _tier_for_fraction(budget_fraction: float) -> RiskBudgetTier:
    if budget_fraction <= 0.0:
        return "closed"
    if budget_fraction < 0.4:
        return "tight"
    if budget_fraction < 0.75:
        return "balanced"
    return "open"


def _downgrade_tier(tier: RiskBudgetTier) -> RiskBudgetTier:
    if tier == "open":
        return "balanced"
    if tier == "balanced":
        return "tight"
    return tier


def _downgrade_size_tier(tier: SizeTier) -> SizeTier:
    if tier == "full":
        return "half"
    if tier == "half":
        return "starter"
    if tier == "starter":
        return "no_size"
    return "no_size"


def _capital_fraction_for_tier(tier: SizeTier, budget_fraction: float) -> float:
    if tier == "no_size":
        return 0.0
    if tier == "starter":
        return round(min(0.05, max(0.02, budget_fraction * 0.35)), 4)
    if tier == "half":
        return round(min(0.10, max(0.05, budget_fraction * 0.55)), 4)
    return round(min(0.15, max(0.08, budget_fraction * 0.8)), 4)


def _dial_for_context(
    *,
    regime: str,
    tier: RiskBudgetTier,
    degraded: bool,
    adverse_label: str,
) -> AggressionDial:
    if tier in {"closed", "tight"}:
        return "lean_more_selective"
    if degraded or adverse_label in {"elevated", "severe"}:
        return "lean_more_selective"
    if regime == MarketRegime.CONFIRMED_UPTREND.value and adverse_label == "normal":
        return "lean_more_aggressive"
    return "no_change"


def _build_reasons(
    *,
    regime: str,
    position_sizing: float,
    degraded: bool,
    adverse_regime: Mapping[str, object],
) -> list[str]:
    reasons: list[str] = []

    regime_reason = {
        MarketRegime.CONFIRMED_UPTREND.value: "market regime confirmed uptrend",
        MarketRegime.UPTREND_UNDER_PRESSURE.value: "market regime uptrend under pressure",
        MarketRegime.CORRECTION.value: "market regime correction",
        MarketRegime.RALLY_ATTEMPT.value: "market regime rally attempt",
    }.get(regime)
    if regime_reason:
        reasons.append(regime_reason)

    if position_sizing < 0.99:
        reasons.append(f"base posture capped at {int(round(position_sizing * 100))}%")

    if degraded:
        reasons.append("market inputs degraded")

    label = str(adverse_regime.get("label", "normal") or "normal").strip().lower()
    if label != "normal":
        components = adverse_regime.get("reason_components")
        if isinstance(components, list):
            for item in components[:2]:
                detail = str(item or "").strip()
                if detail:
                    reasons.append(detail)
        if len(reasons) <= 1:
            detail = str(adverse_regime.get("reason", "") or "").strip()
            if detail:
                reasons.append(detail)

    return reasons or ["risk budget derived from current market posture"]


def _build_explanation(
    *,
    tier: RiskBudgetTier,
    regime: str,
    adverse_label: str,
    reasons: list[str],
) -> str:
    regime_text = regime.replace("_", " ")
    stress_text = f"stress {adverse_label}" if adverse_label not in {"", "normal", "unavailable"} else "stress normal"
    head = f"{tier} risk budget | {regime_text} | {stress_text}"
    if not reasons:
        return head
    return f"{head} | {'; '.join(reasons[:2])}"


__all__ = [
    "AggressionDial",
    "PositionSizeRecommendation",
    "RiskBudgetOverlay",
    "RiskBudgetTier",
    "SizeTier",
    "build_position_size_recommendation",
    "build_risk_budget_overlay",
]
