from __future__ import annotations

from operator_surfaces.ops_highway import build_ops_highway_plan


def test_ops_highway_plan_includes_retention_rows_for_major_artifact_families():
    payload = build_ops_highway_plan(generated_at="2026-04-03T12:00:00+00:00")

    assert payload["artifact_family"] == "ops_highway_plan"
    families = {row["artifact_family"] for row in payload["retention_policies"]}
    assert {"market_brief", "operator_payload", "runtime_health_snapshot", "ops_highway_plan"} <= families


def test_ops_highway_plan_includes_backup_restore_and_runbook_links():
    payload = build_ops_highway_plan(generated_at="2026-04-03T12:00:00+00:00")

    asset_keys = {row["asset_key"] for row in payload["backup_restore"]["critical_assets"]}
    incident_types = {row["incident_type"] for row in payload["incident_runbooks"]}

    assert {"postgres", "repo_config", "schwab_token"} <= asset_keys
    assert {"provider_cooldown", "schwab_auth_failure", "pre_open_gate_failed"} <= incident_types


def test_ops_highway_plan_includes_capacity_and_change_management_checklists():
    payload = build_ops_highway_plan(generated_at="2026-04-03T12:00:00+00:00")

    surface_keys = {row["surface_key"] for row in payload["capacity_thresholds"]}
    assert {"cday", "cnight", "trading_cron_compute"} <= surface_keys
    assert payload["change_management"]["post_merge_smoke_tests"]
    assert payload["change_management"]["schema_change_checklist"]
