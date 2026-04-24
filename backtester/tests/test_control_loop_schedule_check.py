from __future__ import annotations

import json
from datetime import UTC, datetime, timedelta

from control_loop_schedule_check import evaluate_control_loop_schedule, main


def _write_json(path, payload):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload), encoding="utf-8")


def test_control_loop_schedule_check_reports_current_artifacts(tmp_path):
    now = datetime(2026, 4, 24, 14, 0, tzinfo=UTC)
    lifecycle = tmp_path / ".cache" / "trade_lifecycle"
    for name in ("cycle_summary", "desired_state", "actual_state", "reconciliation_actions"):
        _write_json(lifecycle / f"{name}.json", {"generated_at": (now - timedelta(minutes=20)).isoformat()})

    result = evaluate_control_loop_schedule(root=tmp_path, now=now, max_age_seconds=3600)

    assert result["status"] == "ok"
    assert result["late_count"] == 0
    assert {row["state"] for row in result["rows"]} == {"fresh"}


def test_control_loop_schedule_check_reports_missing_and_stale_artifacts(tmp_path):
    now = datetime(2026, 4, 24, 14, 0, tzinfo=UTC)
    lifecycle = tmp_path / ".cache" / "trade_lifecycle"
    _write_json(lifecycle / "cycle_summary.json", {"generated_at": (now - timedelta(hours=5)).isoformat()})

    result = evaluate_control_loop_schedule(root=tmp_path, now=now, max_age_seconds=3600)

    assert result["status"] == "degraded"
    assert result["late_count"] == 4
    assert result["rows"][0]["state"] == "stale"
    assert result["rows"][1]["state"] == "missing"


def test_control_loop_schedule_check_cli_writes_output_and_fails_on_late(tmp_path, capsys):
    output = tmp_path / "schedule.json"

    exit_code = main(["--root", str(tmp_path), "--output", str(output), "--fail-on-late"])

    assert exit_code == 2
    assert json.loads(output.read_text(encoding="utf-8"))["artifact_family"] == "control_loop_schedule_check"
    assert "control_loop_schedule_check" in capsys.readouterr().out
