from __future__ import annotations

import json

from schedule_registry import build_schedule_registry, save_schedule_registry


def test_schedule_registry_names_core_runtime_sources(tmp_path):
    artifact = build_schedule_registry(root=tmp_path, generated_at="2026-04-24T14:00:00+00:00")

    names = {row["name"] for row in artifact["schedules"]}
    assert {"watchdog", "mission_control", "market_data_service", "v4_control_loop", "pre_open_gate", "openclaw_cron_jobs"} <= names
    assert artifact["artifact_family"] == "trading_schedule_registry"
    assert artifact["schema_version"] == 1


def test_schedule_registry_save_writes_latest_artifact(tmp_path):
    path = save_schedule_registry(root=tmp_path, generated_at="2026-04-24T14:00:00+00:00")

    payload = json.loads(path.read_text(encoding="utf-8"))
    assert path.name == "schedule_registry_latest.json"
    assert payload["summary"]["schedule_count"] >= 5
