"""Strategy-specific entry-plan helpers."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from lifecycle.trade_objects import EntryPlan, SCHEMA_VERSION, deterministic_key


def build_entry_plan_from_signal(
    *,
    strategy: str,
    signal: dict[str, Any],
    market: dict[str, Any] | None = None,
    overlays: dict[str, Any] | None = None,
    generated_at: str | None = None,
) -> EntryPlan | None:
    action = str(signal.get("action") or "NO_BUY").strip().upper()
    if action not in {"BUY", "WATCH"}:
        return None

    quality_state = _data_quality_state(signal=signal, market=market)
    if quality_state == "degraded_risky":
        return None

    symbol = str(signal.get("symbol") or "").strip().upper()
    if not symbol:
        return None
    created_at = _normalize_timestamp(generated_at or datetime.now(timezone.utc).isoformat())
    normalized_strategy = str(strategy or "").strip().lower()
    builder = _build_canslim_plan if normalized_strategy == "canslim" else _build_dip_buyer_plan
    plan_fields = builder(signal)
    if not plan_fields:
        return None

    action_context = "BUY" if action == "BUY" else "WATCH_PREVIEW"
    preview_only = action_context == "WATCH_PREVIEW"
    executable = not preview_only
    plan_key = f"{normalized_strategy}:{symbol}:{created_at}:{action_context}:{plan_fields['entry_style']}"
    plan_id = deterministic_key("entry_plan", plan_key)
    return EntryPlan(
        id=plan_id,
        plan_key=plan_key,
        schema_version=SCHEMA_VERSION,
        symbol=symbol,
        strategy=normalized_strategy,
        created_at=created_at,
        action_context=action_context,
        entry_style=plan_fields["entry_style"],
        entry_price_ideal_min=plan_fields.get("entry_price_ideal_min"),
        entry_price_ideal_max=plan_fields.get("entry_price_ideal_max"),
        do_not_chase_above=plan_fields.get("do_not_chase_above"),
        initial_stop_price=plan_fields.get("initial_stop_price"),
        first_target_price=plan_fields.get("first_target_price"),
        stretch_target_price=plan_fields.get("stretch_target_price"),
        expected_hold_days_min=plan_fields.get("expected_hold_days_min"),
        expected_hold_days_max=plan_fields.get("expected_hold_days_max"),
        entry_reason=str(signal.get("reason") or "") or None,
        entry_risk_summary=_build_risk_summary(signal=signal, overlays=overlays),
        execution_policy_ref=str(signal.get("execution_policy_ref") or "") or None,
        data_quality_state=quality_state,
        prediction_ref=str(signal.get("entry_plan_ref") or "") or None,
        executable=executable,
        preview_only=preview_only,
    )


def annotate_alert_payload_with_entry_plans(
    *,
    strategy: str,
    payload: dict[str, Any],
    generated_at: str,
) -> dict[str, Any]:
    signals = list(payload.get("signals") or [])
    market = dict(payload.get("market") or {})
    overlays = dict(payload.get("overlays") or {})
    plans: list[dict[str, Any]] = []
    enriched_signals: list[dict[str, Any]] = []
    for signal in signals:
        copied = dict(signal)
        plan = build_entry_plan_from_signal(
            strategy=strategy,
            signal=copied,
            market=market,
            overlays=overlays,
            generated_at=generated_at,
        )
        if plan is not None:
            copied["entry_plan"] = plan.to_dict()
            copied["entry_plan_ref"] = plan.plan_key
            plans.append(plan.to_dict())
        enriched_signals.append(copied)
    payload["signals"] = enriched_signals
    payload["entry_plans"] = plans
    return payload


def _build_canslim_plan(signal: dict[str, Any]) -> dict[str, Any] | None:
    price = _signal_price(signal)
    if price is None:
        return None
    stop_price = _optional_float((signal.get("rec") or {}).get("stop_loss"))
    return {
        "entry_style": "breakout_buy_zone",
        "entry_price_ideal_min": round(price * 0.995, 4),
        "entry_price_ideal_max": round(price * 1.02, 4),
        "do_not_chase_above": round(price * 1.03, 4),
        "initial_stop_price": stop_price,
        "first_target_price": round(price * 1.08, 4),
        "stretch_target_price": round(price * 1.15, 4),
        "expected_hold_days_min": 5,
        "expected_hold_days_max": 20,
    }


def _build_dip_buyer_plan(signal: dict[str, Any]) -> dict[str, Any] | None:
    price = _signal_price(signal)
    if price is None:
        return None
    stop_price = _optional_float((signal.get("rec") or {}).get("stop_loss"))
    return {
        "entry_style": "reversal_reclaim",
        "entry_price_ideal_min": round(price * 0.99, 4),
        "entry_price_ideal_max": round(price * 1.01, 4),
        "do_not_chase_above": round(price * 1.02, 4),
        "initial_stop_price": stop_price,
        "first_target_price": round(price * 1.06, 4),
        "stretch_target_price": round(price * 1.10, 4),
        "expected_hold_days_min": 3,
        "expected_hold_days_max": 15,
    }


def _signal_price(signal: dict[str, Any]) -> float | None:
    rec = signal.get("rec") if isinstance(signal.get("rec"), dict) else {}
    for value in (rec.get("entry"), signal.get("price"), rec.get("price")):
        parsed = _optional_float(value)
        if parsed is not None and parsed > 0:
            return parsed
    return None


def _build_risk_summary(*, signal: dict[str, Any], overlays: dict[str, Any] | None) -> str:
    pieces: list[str] = []
    risk = str(signal.get("risk") or "").strip()
    if risk:
        pieces.append(f"risk {risk}")
    trade_quality = _optional_float(signal.get("trade_quality_score"))
    if trade_quality is not None:
        pieces.append(f"tq {trade_quality:.1f}")
    effective_confidence = _optional_float(signal.get("effective_confidence"))
    if effective_confidence is not None:
        pieces.append(f"conf {effective_confidence:.0f}%")
    risk_overlay = (overlays or {}).get("risk")
    if isinstance(risk_overlay, dict):
        state = str(risk_overlay.get("state") or risk_overlay.get("tier") or "").strip()
        if state:
            pieces.append(f"budget {state}")
    return " | ".join(pieces) if pieces else "risk context unavailable"


def _data_quality_state(*, signal: dict[str, Any], market: dict[str, Any] | None) -> str:
    source = str(signal.get("data_source") or "unknown").strip().lower()
    staleness = _optional_float(signal.get("data_staleness_seconds")) or 0.0
    market_status = str((market or {}).get("status") or "ok").strip().lower()
    if source in {"unknown", "unavailable"} or market_status in {"degraded_risky"}:
        return "degraded_risky"
    if market_status == "degraded" or staleness > 3600:
        return "degraded"
    return "ok"


def _optional_float(value: object) -> float | None:
    try:
        if value is None or value == "":
            return None
        numeric = float(value)
    except (TypeError, ValueError):
        return None
    if numeric != numeric:
        return None
    return numeric


def _normalize_timestamp(value: str) -> str:
    parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc).isoformat()
