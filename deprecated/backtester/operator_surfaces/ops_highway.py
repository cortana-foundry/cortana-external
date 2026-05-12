"""Machine-readable Ops Highway planning artifacts."""

from __future__ import annotations

from pathlib import Path
from typing import Any

from evaluation.artifact_contracts import (
    ARTIFACT_FAMILY_OPS_HIGHWAY_PLAN,
    ARTIFACT_FAMILY_RUNTIME_HEALTH_SNAPSHOT,
    ARTIFACT_FAMILY_RUNTIME_INVENTORY,
    annotate_artifact,
)
from operator_surfaces.runtime_health import build_runtime_health_snapshot
from operator_surfaces.runtime_inventory import build_runtime_inventory_artifact

BACKTESTER_ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = BACKTESTER_ROOT.parent


def build_ops_highway_plan(
    *,
    generated_at: str,
    runtime_inventory: dict[str, Any] | None = None,
    runtime_health: dict[str, Any] | None = None,
) -> dict[str, Any]:
    inventory = runtime_inventory or build_runtime_inventory_artifact(generated_at=generated_at)
    health = runtime_health or build_runtime_health_snapshot(generated_at=generated_at)

    warnings = []
    if health.get("status") != "ok":
        warnings.append("runtime_health_not_green")
    if any(row.get("warning_threshold") for row in _capacity_thresholds()):
        warnings.append("capacity_thresholds_defined")

    return annotate_artifact(
        {
            "retention_policies": _retention_policies(),
            "backup_restore": _backup_restore_manifest(),
            "incident_runbooks": _incident_runbooks(),
            "capacity_thresholds": _capacity_thresholds(),
            "change_management": _change_management_checklists(),
            "source_refs": {
                "runtime_inventory": _source_ref(
                    family=ARTIFACT_FAMILY_RUNTIME_INVENTORY,
                    producer=inventory.get("producer", "backtester.operator_surfaces.runtime_inventory"),
                    generated_at=inventory.get("generated_at", generated_at),
                ),
                "runtime_health_snapshot": _source_ref(
                    family=ARTIFACT_FAMILY_RUNTIME_HEALTH_SNAPSHOT,
                    producer=health.get("producer", "backtester.operator_surfaces.runtime_health"),
                    generated_at=health.get("generated_at", generated_at),
                ),
            },
            "warnings": warnings,
        },
        artifact_family=ARTIFACT_FAMILY_OPS_HIGHWAY_PLAN,
        producer="backtester.operator_surfaces.ops_highway",
        generated_at=generated_at,
        known_at=generated_at,
        status="ok" if health.get("status") == "ok" else "degraded",
        degraded_status="healthy" if health.get("status") == "ok" else "degraded_safe",
        outcome_class="run_completed" if health.get("status") == "ok" else "degraded_safe",
    )


def _retention_policies() -> list[dict[str, Any]]:
    return [
        _retention_row("market_brief", "14d", "replace latest + prune old snapshots", "local backup optional", "medium"),
        _retention_row("strategy_alert", "30d", "keep daily history; prune by run date", "local backup optional", "medium"),
        _retention_row("run_manifest", "60d", "keep until paired artifacts are reviewed", "local backup preferred", "high"),
        _retention_row("readiness_check", "14d", "keep latest + two weeks of history", "local backup optional", "medium"),
        _retention_row("operator_payload", "30d", "rebuildable from source artifacts; keep for replay fixtures", "local backup optional", "medium"),
        _retention_row("runtime_inventory", "90d", "replace on structural changes; keep change history", "git + local backup", "high"),
        _retention_row("runtime_health_snapshot", "30d", "keep daily history for incident review", "local backup optional", "high"),
        _retention_row("ops_highway_plan", "180d", "keep each approved revision", "git + local backup", "high"),
    ]


def _backup_restore_manifest() -> dict[str, Any]:
    return {
        "critical_assets": [
            _asset(
                "postgres",
                "database",
                "postgresql://local/cortana",
                "Contains shared state, streamer coordination, and cross-run structured data.",
                "nightly pg_dump to local backup volume",
                [
                    "Stop write-heavy flows if possible.",
                    "Restore latest verified dump into a clean local database.",
                    "Run smoke query: select 1.",
                ],
            ),
            _asset(
                "repo_config",
                "config",
                str(REPO_ROOT / ".env"),
                "Holds local runtime config for service and research flows.",
                "copy encrypted local secret file; never commit",
                [
                    "Restore .env from local secret backup.",
                    "Confirm service boots with market-data ready check.",
                ],
            ),
            _asset(
                "schwab_token",
                "token",
                "${SCHWAB_TOKEN_PATH}",
                "Required for live Schwab auth refresh and normal market-data reads.",
                "copy protected token file with local secret backup",
                [
                    "Restore token file to SCHWAB_TOKEN_PATH.",
                    "Check /auth/schwab/status and /market-data/ready.",
                ],
            ),
            _asset(
                "readiness_artifacts",
                "artifact",
                str(BACKTESTER_ROOT / "var" / "readiness"),
                "Shows whether the live lane was safe before the open.",
                "keep local snapshots for 14 days",
                [
                    "Restore latest readiness artifact if needed for incident review.",
                    "Re-run pre_open_canary.py to generate a fresh artifact.",
                ],
            ),
        ],
        "minimum_recovery_sequence": [
            "Restore repo config and Schwab token material.",
            "Confirm Postgres is reachable.",
            "Start apps/external-service and verify /market-data/ready.",
            "Re-run runtime_health_snapshot.py --pretty.",
            "Run cday only after readiness is green or degraded-safe with understood warnings.",
        ],
        "do_not_commit_paths": [
            str(REPO_ROOT / ".env"),
            "${SCHWAB_TOKEN_PATH}",
            str(BACKTESTER_ROOT / ".cache"),
            str(BACKTESTER_ROOT / "var" / "local-workflows"),
        ],
    }


def _incident_runbooks() -> list[dict[str, Any]]:
    return [
        _incident(
            "provider_cooldown",
            "TS market-data service enters provider_cooldown or quote batch returns 503.",
            [
                "Check /market-data/ready and /market-data/ops.",
                "Confirm token refresh health.",
                "Use runtime_health_snapshot.py for inspection paths.",
            ],
            [
                "http://127.0.0.1:3033/market-data/ready",
                "http://127.0.0.1:3033/market-data/ops",
            ],
            str(BACKTESTER_ROOT / "docs" / "source" / "reference" / "market-data-service-reference.md"),
        ),
        _incident(
            "schwab_auth_failure",
            "Schwab access token refresh fails or auth status reports human action required.",
            [
                "Check /auth/schwab/status.",
                "Run the Schwab reauth runbook.",
            ],
            [
                "http://127.0.0.1:3033/auth/schwab/status",
                str(BACKTESTER_ROOT / "docs" / "source" / "runbook" / "schwab-oauth-reauth-runbook.md"),
            ],
            str(BACKTESTER_ROOT / "docs" / "source" / "runbook" / "schwab-oauth-reauth-runbook.md"),
        ),
        _incident(
            "pre_open_gate_failed",
            "Pre-open canary returns fail or warn before the market opens.",
            [
                "Inspect readiness artifact.",
                "Run runtime_health_snapshot.py.",
                "Review watchdog state and recent cron logs.",
            ],
            [
                str(BACKTESTER_ROOT / "var" / "readiness" / "pre-open-canary-latest.json"),
                str(REPO_ROOT / "watchdog" / "watchdog-state.json"),
            ],
            str(REPO_ROOT / "watchdog" / "README.md"),
        ),
        _incident(
            "silent_alert_delivery",
            "Expected alert run completed but Telegram delivery did not occur.",
            [
                "Inspect run manifest and operator payload.",
                "Check notify-side dedupe or runtime health delivery status.",
            ],
            [
                str(BACKTESTER_ROOT / "var"),
                str(REPO_ROOT / "watchdog" / "logs"),
            ],
            str(REPO_ROOT / "watchdog" / "README.md"),
        ),
        _incident(
            "empty_scan",
            "A surface returns BUY 0 / WATCH 0 / NO_BUY 0.",
            [
                "Check whether the market gate blocked entries.",
                "Inspect operator payload outcome_class.",
                "Confirm watchlist and universe inputs were present.",
            ],
            [
                str(BACKTESTER_ROOT / "docs" / "consumer-contracts.md"),
                str(BACKTESTER_ROOT / "var" / "local-workflows"),
            ],
            str(BACKTESTER_ROOT / "README.md"),
        ),
    ]


def _capacity_thresholds() -> list[dict[str, Any]]:
    return [
        _capacity("market_brief_snapshot", "under 15s", "over 30s", "over 60s", "Recheck service health and tape fetch path."),
        _capacity("cday", "under 5m", "over 8m", "over 12m", "Inspect market-data ops, streamer state, and watchlist refresh timing."),
        _capacity("cnight", "under 12m", "over 18m", "over 25m", "Inspect nightly timing output, live prefilter reuse, and quote fetch volume."),
        _capacity("pre_open_canary", "under 45s", "over 90s", "over 180s", "Recheck readiness dependencies before the open."),
        _capacity("trading_cron_compute", "under 10m", "over 12m", "over 15m", "Treat as delivery risk; inspect compute runtime and health snapshots."),
    ]


def _change_management_checklists() -> dict[str, Any]:
    return {
        "post_merge_smoke_tests": [
            "Run targeted pytest for touched modules.",
            "Run cbreadth and confirm the operator story is readable.",
            "Run runtime_health_snapshot.py --pretty and confirm inspection paths resolve.",
            "Run cday or cnight if the change touched live operator surfaces.",
        ],
        "rollback_checklist": [
            "Record current failing symptom and last good commit.",
            "Revert the smallest surface-specific change first.",
            "Re-run targeted tests and one operator command before declaring rollback complete.",
        ],
        "schema_change_checklist": [
            "Bump schema_version only when typed consumer fields change.",
            "Update consumer-contracts.md and replay fixtures in the same PR.",
            "Fail loudly on unsupported schema versions in downstream consumers.",
        ],
        "reconsider_triggers": [
            "Disk growth no longer fits local retention windows.",
            "Postgres latency becomes a daily operator problem.",
            "Market-day compute routinely misses delivery windows.",
            "Single-host recovery steps stop being practical within one trading session.",
        ],
    }


def _retention_row(
    artifact_family: str,
    retention_window: str,
    prune_policy: str,
    backup_policy: str,
    restore_priority: str,
) -> dict[str, Any]:
    return {
        "artifact_family": artifact_family,
        "retention_window": retention_window,
        "prune_policy": prune_policy,
        "backup_policy": backup_policy,
        "restore_priority": restore_priority,
    }


def _asset(
    asset_key: str,
    asset_type: str,
    path: str,
    why_it_matters: str,
    backup_method: str,
    restore_steps: list[str],
) -> dict[str, Any]:
    return {
        "asset_key": asset_key,
        "asset_type": asset_type,
        "path": path,
        "why_it_matters": why_it_matters,
        "backup_method": backup_method,
        "restore_steps": restore_steps,
    }


def _incident(
    incident_type: str,
    trigger: str,
    first_checks: list[str],
    inspection_paths: list[str],
    runbook_ref: str,
) -> dict[str, Any]:
    return {
        "incident_type": incident_type,
        "trigger": trigger,
        "first_checks": first_checks,
        "inspection_paths": inspection_paths,
        "runbook_ref": runbook_ref,
    }


def _capacity(
    surface_key: str,
    target_runtime: str,
    warning_threshold: str,
    critical_threshold: str,
    operator_action: str,
) -> dict[str, Any]:
    return {
        "surface_key": surface_key,
        "target_runtime": target_runtime,
        "warning_threshold": warning_threshold,
        "critical_threshold": critical_threshold,
        "operator_action": operator_action,
    }


def _source_ref(*, family: str, producer: str, generated_at: str) -> dict[str, str]:
    return {
        "artifact_family": family,
        "producer": producer,
        "generated_at": generated_at,
    }
