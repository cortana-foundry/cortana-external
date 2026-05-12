"""Best-effort Mission Control producer hooks for governance and decision telemetry."""

from __future__ import annotations

import hashlib
import logging
import os
from pathlib import Path
from typing import Any, Mapping

try:
    import requests
except ImportError:  # pragma: no cover - optional at test time
    requests = None

LOGGER = logging.getLogger(__name__)
DEFAULT_TIMEOUT_SECONDS = 3.0
OVERLAY_APPROVAL_ACTION_TYPE = "promote_rank_modifier_overlay"
MANUAL_APPROVAL_REASON = "manual approval required for rank_modifier promotion"


def mission_control_base_url() -> str:
    explicit = str(
        os.getenv("MISSION_CONTROL_BASE_URL")
        or os.getenv("MISSION_CONTROL_URL")
        or ""
    ).strip()
    if explicit:
        return explicit.rstrip("/")
    if os.getenv("PYTEST_CURRENT_TEST"):
        return ""
    return "http://127.0.0.1:3000"


def mission_control_enabled() -> bool:
    return bool(mission_control_base_url())


def _headers() -> dict[str, str]:
    headers = {"content-type": "application/json"}
    token = str(os.getenv("MISSION_CONTROL_API_TOKEN") or "").strip()
    if token:
        headers["x-api-key"] = token
    return headers


def _request_timeout_seconds() -> float:
    try:
        return max(float(os.getenv("MISSION_CONTROL_TIMEOUT_SECONDS", DEFAULT_TIMEOUT_SECONDS)), 0.1)
    except ValueError:
        return DEFAULT_TIMEOUT_SECONDS


def _post_json(path: str, payload: Mapping[str, Any]) -> dict[str, Any] | None:
    base_url = mission_control_base_url()
    if not base_url or requests is None:
        return None

    try:
        response = requests.post(
            f"{base_url}{path}",
            json=dict(payload),
            headers=_headers(),
            timeout=_request_timeout_seconds(),
        )
        response.raise_for_status()
        return response.json() if response.content else {}
    except Exception as exc:  # pragma: no cover - defensive logging path
        LOGGER.warning("Mission Control POST failed for %s: %s", path, exc)
        return None


def _get_json(path: str, *, params: Mapping[str, Any] | None = None) -> dict[str, Any] | None:
    base_url = mission_control_base_url()
    if not base_url or requests is None:
        return None

    try:
        response = requests.get(
            f"{base_url}{path}",
            params=params,
            headers=_headers(),
            timeout=_request_timeout_seconds(),
        )
        response.raise_for_status()
        return response.json() if response.content else {}
    except Exception as exc:  # pragma: no cover - defensive logging path
        LOGGER.warning("Mission Control GET failed for %s: %s", path, exc)
        return None


def _normalize_mapping(value: Any) -> dict[str, Any]:
    return dict(value) if isinstance(value, Mapping) else {}


def _normalize_list(value: Any) -> list[Any]:
    return list(value) if isinstance(value, list) else []


def emit_decision_trace(
    decision_state: Mapping[str, Any],
    *,
    trigger_type: str,
    action_type: str,
    metadata: Mapping[str, Any] | None = None,
    confidence: float | None = None,
    run_id: str | None = None,
) -> None:
    if not mission_control_enabled():
        return

    policy_state = _normalize_mapping(decision_state.get("policy_state"))
    producer = str(decision_state.get("producer") or "unknown").strip() or "unknown"
    generated_at = str(decision_state.get("generated_at") or "").strip()
    action_name = str(policy_state.get("action") or "unknown").strip() or "unknown"
    symbol_state = _normalize_mapping(decision_state.get("symbol_state"))
    focus = _normalize_mapping(symbol_state.get("focus"))
    focus_symbols = [
        str(symbol).strip().upper()
        for symbol in _normalize_list(focus.get("symbols"))
        if str(symbol).strip()
    ]
    trace_suffix = ",".join(focus_symbols[:3]) or str(policy_state.get("session_phase") or "global")
    trace_hash = hashlib.sha1(trace_suffix.encode("utf-8")).hexdigest()[:10]
    trace_id = f"{producer}:{generated_at}:{trigger_type}:{action_name}:{trace_hash}"

    payload = {
        "trace_id": trace_id,
        "run_id": run_id,
        "trigger_type": trigger_type,
        "action_type": action_type,
        "action_name": action_name,
        "reasoning": str(policy_state.get("reason") or "").strip() or None,
        "confidence": confidence,
        "outcome": "success" if action_name.lower() != "unknown" else "unknown",
        "created_at": generated_at or None,
        "completed_at": generated_at or None,
        "data_inputs": {
            "health_status": decision_state.get("health_status"),
            "regime_state": _normalize_mapping(decision_state.get("regime_state")),
            "breadth_state": _normalize_mapping(decision_state.get("breadth_state")),
            "tape_state": _normalize_mapping(decision_state.get("tape_state")),
            "symbol_state": symbol_state,
        },
        "metadata": {
            "producer": producer,
            "known_at": decision_state.get("known_at"),
            "shadow_mode": bool(decision_state.get("shadow_mode", False)),
            **_normalize_mapping(metadata),
        },
    }
    _post_json("/api/decisions", payload)


def fetch_remote_overlay_manual_approvals() -> dict[str, dict[str, Any]]:
    payload = _get_json(
        "/api/approvals",
        params={
            "status": "all",
            "actionType": OVERLAY_APPROVAL_ACTION_TYPE,
            "rangeHours": 24 * 30,
            "limit": 200,
        },
    )
    approvals = payload.get("approvals") if isinstance(payload, Mapping) else None
    if not isinstance(approvals, list):
        return {}

    latest_by_key: dict[str, dict[str, Any]] = {}
    for item in approvals:
        if not isinstance(item, Mapping):
            continue
        proposal = _normalize_mapping(item.get("proposal"))
        correlation_key = str(proposal.get("correlation_key") or "").strip()
        overlay_name = str(proposal.get("overlay_name") or "").strip().lower()
        if not correlation_key or not overlay_name or correlation_key in latest_by_key:
            continue
        latest_by_key[correlation_key] = dict(item)

    approved: dict[str, dict[str, Any]] = {}
    for approval in latest_by_key.values():
        status = str(approval.get("status") or "").strip().lower()
        executed_at = approval.get("executedAt")
        proposal = _normalize_mapping(approval.get("proposal"))
        overlay_name = str(proposal.get("overlay_name") or "").strip().lower()
        if (
            overlay_name
            and status in {"approved", "approved_edited"}
            and not executed_at
        ):
            approved[overlay_name] = dict(approval)
    return approved


def reconcile_overlay_promotion_approvals(
    state_payload: Mapping[str, Any],
    *,
    state_path: Path | None = None,
    horizon: str = "5d",
    remote_approvals: Mapping[str, Mapping[str, Any]] | None = None,
) -> None:
    if not mission_control_enabled():
        return

    overlays = {
        str(entry.get("name") or "").strip().lower(): dict(entry)
        for entry in _normalize_list(state_payload.get("overlays"))
        if isinstance(entry, Mapping) and str(entry.get("name") or "").strip()
    }
    remote = {
        str(name).strip().lower(): dict(approval)
        for name, approval in (remote_approvals or {}).items()
        if str(name).strip()
    }

    for raw_decision in _normalize_list(state_payload.get("decisions")):
        if not isinstance(raw_decision, Mapping):
            continue
        decision = dict(raw_decision)
        overlay_name = str(decision.get("name") or "").strip().lower()
        if not overlay_name:
            continue

        reasons = [str(reason).strip() for reason in _normalize_list(decision.get("reasons")) if str(reason).strip()]
        non_manual_reasons = [reason for reason in reasons if reason != MANUAL_APPROVAL_REASON]
        only_manual_missing = (
            str(decision.get("from_stage") or "") == "surfaced"
            and str(decision.get("to_stage") or "") == "surfaced"
            and str(decision.get("action") or "") == "hold"
            and MANUAL_APPROVAL_REASON in reasons
            and not non_manual_reasons
        )
        correlation_key = f"overlay-rank:{overlay_name}"
        overlay_entry = overlays.get(overlay_name, {})

        if only_manual_missing:
            _post_json(
                "/api/approvals/ingest",
                {
                    "signal_state": "pending",
                    "agent_id": "backtester.experimental_alpha",
                    "action_type": OVERLAY_APPROVAL_ACTION_TYPE,
                    "correlation_key": correlation_key,
                    "risk_level": "p1",
                    "blast_radius": "ranking policy",
                    "rationale": (
                        f"{overlay_name} is eligible for rank_modifier promotion and is only blocked on operator approval."
                    ),
                    "proposal": {
                        "overlay_name": overlay_name,
                        "from_stage": decision.get("from_stage"),
                        "to_stage": "rank_modifier",
                        "policy_version": state_payload.get("policy_version"),
                        "generated_at": state_payload.get("generated_at"),
                        "gate_details": _normalize_mapping(overlay_entry.get("last_gate_details")),
                        "reasons": reasons,
                    },
                    "resume_payload": {
                        "overlay_name": overlay_name,
                        "approve_flag": overlay_name,
                        "horizon": horizon,
                        "state_path": str(state_path) if state_path else None,
                    },
                },
            )
            continue

        _post_json(
            "/api/approvals/ingest",
            {
                "signal_state": "cleared",
                "agent_id": "backtester.experimental_alpha",
                "action_type": OVERLAY_APPROVAL_ACTION_TYPE,
                "correlation_key": correlation_key,
                "proposal": {"overlay_name": overlay_name},
                "actor": "backtester.experimental_alpha",
                "clear_reason": "overlay is no longer waiting on manual approval",
            },
        )

        remote_approval = remote.get(overlay_name)
        promoted = (
            str(decision.get("action") or "") == "promote"
            and str(decision.get("to_stage") or "") == "rank_modifier"
        )
        if not remote_approval or not promoted:
            continue

        approval_id = str(remote_approval.get("id") or "").strip()
        if not approval_id:
            continue

        _post_json(
            f"/api/approvals/{approval_id}/resume",
            {
                "actor": "backtester.experimental_alpha",
                "execution_result": {
                    "status": "applied",
                    "overlay_name": overlay_name,
                    "applied_stage": "rank_modifier",
                    "generated_at": state_payload.get("generated_at"),
                },
            },
        )
