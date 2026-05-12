"""Replay and rollback drill helpers for the V4 trading control loop."""

from __future__ import annotations

from typing import Any, Mapping

from control_loop.reconciler import build_reconciliation_actions_artifact
from release.release_units import rollback_release_unit_artifact


def replay_reconciliation_cycle(
    *,
    generated_at: str,
    desired_state_artifact: Mapping[str, Any],
    actual_state_artifact: Mapping[str, Any],
    interventions_artifact: Mapping[str, Any] | None = None,
    iterations: int = 2,
) -> dict[str, Any]:
    cycle_count = max(1, int(iterations or 1))
    action_sets: list[list[str]] = []
    action_type_sets: list[list[str]] = []

    for _ in range(cycle_count):
        artifact = build_reconciliation_actions_artifact(
            generated_at=generated_at,
            desired_state_artifact=desired_state_artifact,
            actual_state_artifact=actual_state_artifact,
            interventions_artifact=interventions_artifact,
        )
        actions = [
            dict(item)
            for item in artifact.get("actions") or []
            if isinstance(item, Mapping)
        ]
        action_sets.append(sorted(str(action.get("action_id") or "") for action in actions if str(action.get("action_id") or "").strip()))
        action_type_sets.append(sorted(str(action.get("action_type") or "") for action in actions if str(action.get("action_type") or "").strip()))

    baseline_ids = action_sets[0]
    duplicate_side_effect_count = sum(1 for action_ids in action_sets[1:] if action_ids != baseline_ids)
    converged = all(action_ids == baseline_ids for action_ids in action_sets[1:])

    return {
        "generated_at": generated_at,
        "iterations": cycle_count,
        "converged": converged,
        "duplicate_side_effect_count": duplicate_side_effect_count,
        "baseline_action_ids": baseline_ids,
        "baseline_action_types": action_type_sets[0],
        "replay_action_types": action_type_sets,
    }


def run_release_rollback_drill(
    *,
    generated_at: str,
    release_unit_artifact: Mapping[str, Any],
    reason: str,
    restore_release_key: str | None = None,
) -> dict[str, Any]:
    rolled_back_release = rollback_release_unit_artifact(
        generated_at=generated_at,
        release_unit_artifact=release_unit_artifact,
        reason=reason,
        restore_release_key=restore_release_key,
    )
    rollback_state = dict(rolled_back_release.get("rollback_state") or {})
    canary_state = dict(rolled_back_release.get("canary_state") or {})
    expected_restore_key = str(
        restore_release_key
        or ((release_unit_artifact.get("rollback_state") or {}).get("restore_release_key"))
        or release_unit_artifact.get("release_key")
        or ""
    )

    return {
        "generated_at": generated_at,
        "coherent_restore_target": str(rollback_state.get("restore_release_key") or "") == expected_restore_key,
        "rollback_ready": bool(rollback_state.get("rollback_ready")),
        "rollback_stage": str(canary_state.get("stage") or ""),
        "rollback_status": str(canary_state.get("status") or ""),
        "transition_count": len(rolled_back_release.get("transition_history") or []),
        "rolled_back_release": rolled_back_release,
    }
