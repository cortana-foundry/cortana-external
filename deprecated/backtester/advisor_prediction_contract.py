"""Prediction contract helpers used by advisor workflows and alert producers."""

from __future__ import annotations

from typing import Any, Mapping


def prediction_to_float(value: object) -> float | None:
    try:
        numeric = float(value)
    except (TypeError, ValueError):
        return None
    if numeric != numeric:
        return None
    return numeric


def prediction_risk_label(
    *,
    recommendation: Mapping[str, Any] | None = None,
    analysis: Mapping[str, Any] | None = None,
) -> str:
    rec = recommendation if isinstance(recommendation, dict) else {}
    context = analysis if isinstance(analysis, dict) else {}

    explicit = str(rec.get("risk") or context.get("risk") or "").strip().lower()
    if explicit:
        return explicit

    trade_quality = prediction_to_float(rec.get("trade_quality_score", context.get("trade_quality_score")))
    uncertainty_pct = prediction_to_float(rec.get("uncertainty_pct", context.get("uncertainty_pct")))
    adverse_regime_score = prediction_to_float(
        rec.get(
            "adverse_regime_score",
            context.get("adverse_regime_score", (context.get("adverse_regime") or {}).get("score")),
        )
    )
    exit_risk_score = prediction_to_float(rec.get("exit_risk_score", (context.get("exit_risk") or {}).get("score")))
    action = str(rec.get("action") or context.get("action") or "NO_BUY").strip().upper()

    if (
        (uncertainty_pct is not None and uncertainty_pct >= 35.0)
        or (adverse_regime_score is not None and adverse_regime_score >= 40.0)
        or (exit_risk_score is not None and exit_risk_score >= 3.0)
    ):
        return "high"

    if (
        action == "BUY"
        and trade_quality is not None
        and trade_quality >= 80.0
        and (uncertainty_pct is None or uncertainty_pct <= 20.0)
        and (adverse_regime_score is None or adverse_regime_score <= 20.0)
        and (exit_risk_score is None or exit_risk_score <= 1.0)
    ):
        return "low"

    if any(value is not None for value in (trade_quality, uncertainty_pct, adverse_regime_score, exit_risk_score)):
        return "medium"
    return "unknown"


def prediction_entry_plan_ref(
    *,
    strategy: str,
    recommendation: Mapping[str, Any] | None = None,
    analysis: Mapping[str, Any] | None = None,
) -> str | None:
    rec = recommendation if isinstance(recommendation, dict) else {}
    context = analysis if isinstance(analysis, dict) else {}
    explicit = str(rec.get("entry_plan_ref") or context.get("entry_plan_ref") or "").strip()
    if explicit:
        return explicit

    action = str(rec.get("action") or context.get("action") or "").strip().upper()
    normalized_strategy = str(strategy or "").strip().lower()
    if normalized_strategy == "canslim":
        if action == "BUY":
            return "canslim.breakout_entry_v1"
        if action == "WATCH":
            return "canslim.watch_confirmation_v1"
        return None
    if normalized_strategy == "dip_buyer":
        if action == "BUY":
            return "dip_buyer.reversal_entry_v1"
        if action == "WATCH":
            return "dip_buyer.reversal_watch_v1"
        return None
    return None


def prediction_execution_policy_ref(
    *,
    recommendation: Mapping[str, Any] | None = None,
    analysis: Mapping[str, Any] | None = None,
    execution_overlay: Mapping[str, Any] | None = None,
) -> str | None:
    rec = recommendation if isinstance(recommendation, dict) else {}
    context = analysis if isinstance(analysis, dict) else {}
    overlay = execution_overlay if isinstance(execution_overlay, dict) else {}
    explicit = str(rec.get("execution_policy_ref") or context.get("execution_policy_ref") or "").strip()
    if explicit:
        return explicit

    stage = str(overlay.get("stage") or "").strip().lower()
    quality = str(
        overlay.get("execution_quality")
        or overlay.get("quality_label")
        or overlay.get("liquidity_quality")
        or ""
    ).strip().lower()
    liquidity = str(
        overlay.get("liquidity_posture")
        or overlay.get("liquidity_label")
        or overlay.get("liquidity")
        or ""
    ).strip().lower()
    slippage = str(
        overlay.get("slippage_risk")
        or overlay.get("slippage_label")
        or overlay.get("slippage_band")
        or ""
    ).strip().lower()
    bits = [bit for bit in (stage, quality, liquidity, slippage) if bit]
    if not bits:
        return None
    return "execution." + ".".join(bit.replace(" ", "_") for bit in bits[:3])


def prediction_vetoes(
    *,
    recommendation: Mapping[str, Any] | None = None,
    analysis: Mapping[str, Any] | None = None,
) -> list[str]:
    rec = recommendation if isinstance(recommendation, dict) else {}
    context = analysis if isinstance(analysis, dict) else {}

    seen: set[str] = set()
    vetoes: list[str] = []

    def _add(value: object) -> None:
        text = str(value or "").strip()
        if text and text not in seen:
            seen.add(text)
            vetoes.append(text)

    for source in (rec.get("vetoes"), context.get("vetoes")):
        if isinstance(source, list):
            for item in source:
                _add(item)

    if bool(rec.get("sentiment_veto")) or bool((context.get("sentiment_overlay") or {}).get("veto")):
        _add("sentiment")
    if bool(rec.get("exit_risk_veto")) or bool((context.get("exit_risk") or {}).get("veto")):
        _add("exit_risk")
    if bool(rec.get("market_regime_blocked")) or bool(context.get("market_regime_blocked")):
        _add("market_regime")
    if bool(rec.get("credit_veto")) or bool(context.get("credit_veto")):
        _add("credit")
    if bool(rec.get("falling_knife")) or bool(context.get("falling_knife")):
        _add("falling_knife")
    if bool(rec.get("market_inactive")) or context.get("market_active") is False:
        _add("market_inactive")
    if bool(context.get("analysis_failed")):
        _add("analysis_failure")

    codes = rec.get("abstain_reason_codes", context.get("abstain_reason_codes", []))
    if isinstance(codes, list):
        for code in codes:
            normalized = str(code or "").strip()
            if normalized:
                _add(f"abstain:{normalized}")

    return vetoes


def build_prediction_contract_context(
    *,
    strategy: str,
    recommendation: Mapping[str, Any] | None = None,
    analysis: Mapping[str, Any] | None = None,
    execution_overlay: Mapping[str, Any] | None = None,
    breadth_state: str | None = None,
) -> dict[str, object]:
    rec = recommendation if isinstance(recommendation, dict) else {}
    context = analysis if isinstance(analysis, dict) else {}
    effective_confidence = prediction_to_float(
        rec.get("effective_confidence", rec.get("confidence", context.get("effective_confidence", context.get("confidence"))))
    )
    normalized_breadth_state = str(breadth_state or rec.get("breadth_state") or context.get("breadth_state") or "").strip() or None
    market_regime = str(rec.get("market_regime") or context.get("market_regime") or "").strip() or None
    opportunity_score = prediction_to_float(rec.get("opportunity_score", context.get("opportunity_score")))
    calibrated_confidence = prediction_to_float(
        rec.get("calibrated_confidence", context.get("calibrated_confidence", effective_confidence))
    )
    downside_risk = prediction_to_float(rec.get("downside_risk", context.get("downside_risk", context.get("downside_penalty"))))
    if downside_risk is not None and downside_risk > 1.0:
        downside_risk = min(max(downside_risk / 10.0, 0.0), 1.0)
    feature_summary = rec.get("feature_summary", context.get("feature_summary"))
    benchmark_context = rec.get("benchmark_context", context.get("benchmark_context"))
    score_mapping_version = str(rec.get("score_mapping_version") or context.get("score_mapping_version") or "").strip() or None

    return {
        "confidence": effective_confidence,
        "calibrated_confidence": calibrated_confidence,
        "strategy_family": str(rec.get("strategy_family") or context.get("strategy_family") or strategy).strip() or strategy,
        "opportunity_score": opportunity_score,
        "downside_risk": downside_risk,
        "canonical_horizon_days": int(rec.get("canonical_horizon_days") or context.get("canonical_horizon_days") or 5),
        "score_mapping_version": score_mapping_version,
        "risk": prediction_risk_label(recommendation=rec, analysis=context),
        "market_regime": market_regime,
        "breadth_state": normalized_breadth_state,
        "entry_plan_ref": prediction_entry_plan_ref(strategy=strategy, recommendation=rec, analysis=context),
        "execution_policy_ref": prediction_execution_policy_ref(
            recommendation=rec,
            analysis=context,
            execution_overlay=execution_overlay,
        ),
        "feature_summary": dict(feature_summary) if isinstance(feature_summary, dict) else None,
        "benchmark_context": dict(benchmark_context) if isinstance(benchmark_context, dict) else None,
        "vetoes": prediction_vetoes(recommendation=rec, analysis=context),
    }
