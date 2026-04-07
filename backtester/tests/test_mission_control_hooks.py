from importlib.util import module_from_spec, spec_from_file_location
from pathlib import Path

MODULE_PATH = Path(__file__).resolve().parents[1] / "operator_surfaces" / "mission_control.py"
MODULE_SPEC = spec_from_file_location("mission_control_test_module", MODULE_PATH)
assert MODULE_SPEC and MODULE_SPEC.loader
mission_control = module_from_spec(MODULE_SPEC)
MODULE_SPEC.loader.exec_module(mission_control)


def test_emit_decision_trace_posts_decision_payload(monkeypatch):
    posted = {}

    monkeypatch.setattr(mission_control, "mission_control_enabled", lambda: True)
    monkeypatch.setattr(
        mission_control,
        "_post_json",
        lambda path, payload: posted.update({"path": path, "payload": dict(payload)}),
    )

    mission_control.emit_decision_trace(
        {
            "producer": "backtester.market_brief_snapshot",
            "generated_at": "2026-04-07T12:00:00+00:00",
            "known_at": "2026-04-07T12:00:00+00:00",
            "health_status": "ok",
            "policy_state": {"action": "WATCH", "reason": "Breadth is mixed."},
            "regime_state": {"label": "uptrend"},
            "symbol_state": {"focus": {"symbols": ["NVDA"]}},
        },
        trigger_type="market_brief",
        action_type="market_posture",
        metadata={"session_phase": "OPEN"},
    )

    assert posted["path"] == "/api/decisions"
    assert posted["payload"]["action_name"] == "WATCH"
    assert posted["payload"]["reasoning"] == "Breadth is mixed."
    assert posted["payload"]["metadata"]["session_phase"] == "OPEN"


def test_fetch_remote_overlay_manual_approvals_filters_to_latest_approved_unexecuted(monkeypatch):
    monkeypatch.setattr(
        mission_control,
        "_get_json",
        lambda path, params=None: {
            "approvals": [
                {
                    "id": "apr-approved",
                    "status": "approved",
                    "executedAt": None,
                    "proposal": {
                        "overlay_name": "execution_quality",
                        "correlation_key": "overlay-rank:execution_quality",
                    },
                },
                {
                    "id": "apr-executed",
                    "status": "approved",
                    "executedAt": "2026-04-07T12:10:00+00:00",
                    "proposal": {
                        "overlay_name": "liquidity_tier",
                        "correlation_key": "overlay-rank:liquidity_tier",
                    },
                },
            ]
        },
    )

    approvals = mission_control.fetch_remote_overlay_manual_approvals()

    assert approvals == {
        "execution_quality": {
            "id": "apr-approved",
            "status": "approved",
            "executedAt": None,
            "proposal": {
                "overlay_name": "execution_quality",
                "correlation_key": "overlay-rank:execution_quality",
            },
        }
    }


def test_reconcile_overlay_promotion_approvals_requests_pending_signal(monkeypatch):
    calls = []

    monkeypatch.setattr(mission_control, "mission_control_enabled", lambda: True)
    monkeypatch.setattr(
        mission_control,
        "_post_json",
        lambda path, payload: calls.append((path, dict(payload))) or {},
    )

    mission_control.reconcile_overlay_promotion_approvals(
        {
            "generated_at": "2026-04-07T12:00:00+00:00",
            "policy_version": "2026-03-19-v1",
            "overlays": [
                {
                    "name": "execution_quality",
                    "last_gate_details": {"samples_total": 220},
                }
            ],
            "decisions": [
                {
                    "name": "execution_quality",
                    "from_stage": "surfaced",
                    "to_stage": "surfaced",
                    "action": "hold",
                    "reasons": [mission_control.MANUAL_APPROVAL_REASON],
                }
            ],
        },
        state_path=Path("/tmp/overlay-state.json"),
        horizon="5d",
    )

    assert calls[0][0] == "/api/approvals/ingest"
    assert calls[0][1]["signal_state"] == "pending"
    assert calls[0][1]["correlation_key"] == "overlay-rank:execution_quality"


def test_reconcile_overlay_promotion_approvals_marks_remote_approval_executed(monkeypatch):
    calls = []

    monkeypatch.setattr(mission_control, "mission_control_enabled", lambda: True)
    monkeypatch.setattr(
        mission_control,
        "_post_json",
        lambda path, payload: calls.append((path, dict(payload))) or {},
    )

    mission_control.reconcile_overlay_promotion_approvals(
        {
            "generated_at": "2026-04-07T12:00:00+00:00",
            "overlays": [{"name": "execution_quality"}],
            "decisions": [
                {
                    "name": "execution_quality",
                    "from_stage": "surfaced",
                    "to_stage": "rank_modifier",
                    "action": "promote",
                    "reasons": [],
                }
            ],
        },
        remote_approvals={
            "execution_quality": {
                "id": "apr-approved",
                "status": "approved",
                "proposal": {
                    "overlay_name": "execution_quality",
                    "correlation_key": "overlay-rank:execution_quality",
                },
            }
        },
    )

    assert calls[0][0] == "/api/approvals/ingest"
    assert calls[0][1]["signal_state"] == "cleared"
    assert calls[1][0] == "/api/approvals/apr-approved/resume"
    assert calls[1][1]["execution_result"]["status"] == "applied"
