from control_loop.actual_state import build_actual_state_artifact
from control_loop.desired_state import build_desired_state_artifact
from control_loop.drills import replay_reconciliation_cycle, run_release_rollback_drill
from control_loop.interventions import (
    build_intervention_events_artifact,
    build_intervention_event,
    clear_intervention_event,
    derive_intervention_events,
)
from control_loop.reconciler import build_reconciliation_actions_artifact
from release.drift_monitor import build_drift_monitor_artifact
from release.release_units import advance_release_unit_artifact, build_release_unit_artifact


def test_desired_actual_and_reconciliation_preserve_distinct_contracts():
    release_unit = build_release_unit_artifact(
        generated_at="2026-04-18T14:00:00+00:00",
        release_key="bt-v4-control-loop",
        code_ref="abc1234",
        strategy_refs=["dip_buyer", "canslim"],
        config_refs=["backtester/governance/promotion_gates.json"],
    )
    desired = build_desired_state_artifact(
        snapshot_at="2026-04-18T14:00:00+00:00",
        posture_artifact={
            "posture_state": "selective",
            "drawdown_state": {"allowed_gross_exposure_fraction": 0.4},
            "strategy_allocations": [
                {
                    "strategy_family": "dip_buyer",
                    "budget_amount": 25000,
                    "authority_tier": "trusted",
                    "autonomy_mode": "supervised_live",
                }
            ],
            "summary": {"top_strategy_family": "dip_buyer"},
        },
        authority_artifact={
            "authority_counts": {"trusted": 1},
            "summary": {"highest_autonomy_mode": "supervised_live"},
            "families": [{"strategy_family": "dip_buyer", "authority_tier": "trusted", "autonomy_mode": "supervised_live"}],
        },
        release_target=release_unit,
    )
    drift = build_drift_monitor_artifact(
        generated_at="2026-04-18T14:00:00+00:00",
        runtime_health_artifact={"status": "ok"},
        release_unit_artifact=release_unit,
        posture_artifact={"posture_state": "paused"},
    )
    actual = build_actual_state_artifact(
        snapshot_at="2026-04-18T14:00:00+00:00",
        posture_artifact={"posture_state": "paused", "gross_exposure": 0.55},
        portfolio_snapshot={"summary": {"open_count": 3, "closed_total_count": 10}, "gross_exposure_pct": 0.55},
        authority_artifact={"authority_counts": {"trusted": 1}, "summary": {"highest_autonomy_mode": "supervised_live"}},
        runtime_health_artifact={"status": "ok", "incident_markers": []},
        runtime_inventory_artifact={"components": [{"component_key": "external_service"}]},
        drift_artifact=drift,
        release_unit_artifact=release_unit,
    )
    interventions = build_intervention_events_artifact(
        generated_at="2026-04-18T14:00:00+00:00",
        events=derive_intervention_events(
            generated_at="2026-04-18T14:00:00+00:00",
            actual_state_artifact=actual,
            drift_artifact=drift,
            release_unit_artifact=release_unit,
        ),
    )
    reconciliation = build_reconciliation_actions_artifact(
        generated_at="2026-04-18T14:00:00+00:00",
        desired_state_artifact=desired,
        actual_state_artifact=actual,
        interventions_artifact=interventions,
    )

    assert desired["artifact_family"] == "trading_desired_state"
    assert actual["artifact_family"] == "trading_actual_state"
    assert reconciliation["artifact_family"] == "trading_reconciliation_actions"
    assert desired["summary"]["desired_posture_state"] == "selective"
    assert actual["summary"]["actual_posture_state"] == "paused"
    assert interventions["active_event_count"] >= 1
    assert any(action["action_type"] == "rebalance_posture" for action in reconciliation["actions"])
    assert any(action["action_type"] == "respect_manual_pause" for action in reconciliation["actions"])


def test_release_validation_and_drift_hold_rollout():
    release_unit = build_release_unit_artifact(
        generated_at="2026-04-18T14:00:00+00:00",
        release_key="bt-v4-canary",
        code_ref="",
        strategy_refs=[],
        config_refs=[],
        canary_state={"mode": "canary", "stage": "canary", "status": "warn"},
    )
    drift = build_drift_monitor_artifact(
        generated_at="2026-04-18T14:00:00+00:00",
        runtime_health_artifact={"status": "ok"},
        release_unit_artifact=release_unit,
        posture_artifact={"posture_state": "selective"},
    )

    assert release_unit["validation"]["is_valid"] is False
    assert drift["policy_outcome"]["action"] == "hold_rollout"
    assert drift["summary"]["drift_status"] == "degraded"


def test_reconciliation_replay_is_idempotent():
    release_unit = build_release_unit_artifact(
        generated_at="2026-04-18T15:00:00+00:00",
        release_key="bt-v4-replay",
        code_ref="abc1234",
        strategy_refs=["dip_buyer"],
        config_refs=["backtester/governance/promotion_gates.json"],
    )
    desired = build_desired_state_artifact(
        snapshot_at="2026-04-18T15:00:00+00:00",
        posture_artifact={
            "posture_state": "risk_on",
            "drawdown_state": {"allowed_gross_exposure_fraction": 0.5},
            "strategy_allocations": [{"strategy_family": "dip_buyer"}],
        },
        authority_artifact={
            "authority_counts": {"trusted": 1},
            "summary": {"highest_autonomy_mode": "supervised_live"},
            "families": [{"strategy_family": "dip_buyer", "authority_tier": "trusted"}],
        },
        release_target=release_unit,
    )
    actual = build_actual_state_artifact(
        snapshot_at="2026-04-18T15:00:00+00:00",
        posture_artifact={"posture_state": "paused", "gross_exposure": 0.6},
        portfolio_snapshot={"summary": {"open_count": 2, "closed_total_count": 3}, "gross_exposure_pct": 0.6},
        authority_artifact={"authority_counts": {"trusted": 0}, "summary": {"highest_autonomy_mode": "advisory"}},
        runtime_health_artifact={"status": "ok", "incident_markers": []},
        runtime_inventory_artifact={"components": [{"component_key": "external_service"}]},
        drift_artifact={"summary": {"drift_status": "ok"}},
        release_unit_artifact=release_unit,
    )
    interventions = build_intervention_events_artifact(
        generated_at="2026-04-18T15:00:00+00:00",
        events=[
            build_intervention_event(
                generated_at="2026-04-18T15:00:00+00:00",
                event_type="manual_pause",
                actor="operator",
                scope={"loop": "portfolio"},
                reason={"headline": "Operator paused posture."},
            )
        ],
    )

    replay = replay_reconciliation_cycle(
        generated_at="2026-04-18T15:00:00+00:00",
        desired_state_artifact=desired,
        actual_state_artifact=actual,
        interventions_artifact=interventions,
        iterations=3,
    )

    assert replay["converged"] is True
    assert replay["duplicate_side_effect_count"] == 0
    assert "rebalance_posture" in replay["baseline_action_types"]
    assert "respect_manual_pause" in replay["baseline_action_types"]


def test_release_rollback_drill_and_intervention_clear_are_auditable():
    base_release = build_release_unit_artifact(
        generated_at="2026-04-18T15:00:00+00:00",
        release_key="bt-v4-canary",
        code_ref="abc1234",
        strategy_refs=["dip_buyer"],
        config_refs=["backtester/governance/promotion_gates.json"],
        canary_state={"mode": "canary", "stage": "canary", "status": "warn", "summary": "Canary saw degradation."},
        rollback_state={"rollback_ready": True, "restore_release_key": "bt-v4-steady"},
    )
    staged_release = advance_release_unit_artifact(
        generated_at="2026-04-18T15:10:00+00:00",
        release_unit_artifact=base_release,
        stage="staged",
        status="ok",
        summary="Canary recovered and staged rollout is active.",
    )
    drill = run_release_rollback_drill(
        generated_at="2026-04-18T15:15:00+00:00",
        release_unit_artifact=staged_release,
        reason="Rollback drill after staged rollout regression.",
    )
    event = build_intervention_event(
        generated_at="2026-04-18T15:15:00+00:00",
        event_type="rollout_hold",
        actor="watchdog",
        scope={"loop": "release"},
        reason={"headline": "Hold rollout during rollback drill."},
    )
    cleared = clear_intervention_event(
        event,
        cleared_at="2026-04-18T15:18:00+00:00",
        clear_reason="Rollback completed and operator acknowledged steady restore.",
    )
    intervention_artifact = build_intervention_events_artifact(
        generated_at="2026-04-18T15:18:00+00:00",
        events=[event, cleared],
    )

    assert drill["coherent_restore_target"] is True
    assert drill["rollback_stage"] == "rollback"
    assert drill["rollback_status"] == "rolled_back"
    assert drill["transition_count"] >= 3
    assert cleared["cleared_at"] == "2026-04-18T15:18:00+00:00"
    assert intervention_artifact["active_event_count"] == 1
    assert intervention_artifact["cleared_event_count"] == 1
