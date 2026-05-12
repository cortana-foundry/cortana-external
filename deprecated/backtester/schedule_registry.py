"""Canonical trading schedule registry artifact."""

from __future__ import annotations

import argparse
import json
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from artifact_schema import assert_valid_trading_artifact
from readiness.freshness_policy import freshness_policy

SCHEMA_VERSION = 1


def build_schedule_registry(*, root: Path | None = None, generated_at: str | None = None) -> dict[str, Any]:
    base = (root or Path(__file__).resolve().parent).expanduser()
    schedules = [
        _entry("watchdog", "launchd", "com.cortana.watchdog", 15 * 60, "watchdog/watchdog.sh"),
        _entry("mission_control", "launchd", "com.cortana.mission-control", None, "apps/mission-control"),
        _entry("market_data_service", "launchd", "com.cortana.fitness-service", None, "external service"),
        _entry(
            "v4_control_loop",
            "artifact",
            str(base / ".cache" / "trade_lifecycle" / "control_loop_schedule_check_latest.json"),
            freshness_policy("control_loop").max_age_seconds,
            "backtester/control_loop_schedule_check.py",
        ),
        _entry(
            "pre_open_gate",
            "artifact",
            str(base / "var" / "readiness" / "pre-open-canary-latest.json"),
            2 * 60 * 60,
            "backtester/pre_open_canary.py",
        ),
        _entry("openclaw_cron_jobs", "cron_registry", "~/.openclaw/cron/jobs.json", None, "OpenClaw cron"),
    ]
    return {
        "artifact_family": "trading_schedule_registry",
        "schema_version": SCHEMA_VERSION,
        "generated_at": generated_at or datetime.now(UTC).isoformat(),
        "root": str(base),
        "schedules": schedules,
        "summary": {
            "schedule_count": len(schedules),
            "launchd_count": sum(1 for item in schedules if item["kind"] == "launchd"),
            "artifact_count": sum(1 for item in schedules if item["kind"] == "artifact"),
            "cron_registry_count": sum(1 for item in schedules if item["kind"] == "cron_registry"),
        },
    }


def save_schedule_registry(*, root: Path | None = None, output: Path | None = None, generated_at: str | None = None) -> Path:
    base = (root or Path(__file__).resolve().parent).expanduser()
    target = output.expanduser() if output else base / ".cache" / "trade_lifecycle" / "schedule_registry_latest.json"
    payload = build_schedule_registry(root=base, generated_at=generated_at)
    assert_valid_trading_artifact(payload, expected_family="trading_schedule_registry")
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    return target


def _entry(name: str, kind: str, target: str, expected_interval_seconds: int | float | None, owner: str) -> dict[str, Any]:
    return {
        "name": name,
        "kind": kind,
        "target": target,
        "expected_interval_seconds": expected_interval_seconds,
        "owner": owner,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Write the trading schedule registry artifact.")
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parent)
    parser.add_argument("--output", type=Path)
    parser.add_argument("--pretty", action="store_true")
    args = parser.parse_args()
    path = save_schedule_registry(root=args.root, output=args.output)
    if args.pretty:
        print(path)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
