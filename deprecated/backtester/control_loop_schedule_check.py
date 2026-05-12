"""Assert whether V4 control-loop artifacts are being refreshed on schedule."""

from __future__ import annotations

import argparse
import json
from datetime import UTC, datetime, time
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo

from readiness.freshness_policy import freshness_policy

ARTIFACTS = {
    "cycle_summary": "cycle_summary.json",
    "desired_state": "desired_state.json",
    "actual_state": "actual_state.json",
    "reconciliation_actions": "reconciliation_actions.json",
}
MARKET_TZ = ZoneInfo("America/New_York")
ACTIONABLE_WEEKDAYS = {0, 1, 2, 3, 4}
ACTIONABLE_START = time(hour=8, minute=20)
ACTIONABLE_END = time(hour=16, minute=0)


def current_time() -> datetime:
    return datetime.now(UTC)


def evaluate_control_loop_schedule(
    *,
    root: Path,
    now: datetime | None = None,
    max_age_seconds: int | None = None,
) -> dict[str, Any]:
    now = now or current_time()
    if now.tzinfo is None:
        now = now.replace(tzinfo=UTC)
    actionable = is_control_loop_schedule_actionable(now)
    max_age = max_age_seconds or freshness_policy("control_loop").max_age_seconds
    lifecycle_root = root.expanduser() / ".cache" / "trade_lifecycle"
    rows = [
        _artifact_row(
            name=name,
            path=lifecycle_root / filename,
            now=now,
            max_age_seconds=max_age,
            actionable=actionable,
        )
        for name, filename in ARTIFACTS.items()
    ]
    late_count = sum(1 for row in rows if row["state"] != "fresh") if actionable else 0
    return {
        "artifact_family": "control_loop_schedule_check",
        "schema_version": 1,
        "generated_at": now.isoformat(),
        "status": "ok" if late_count == 0 else "degraded",
        "actionable": actionable,
        "max_age_seconds": max_age,
        "late_count": late_count,
        "rows": rows,
        "warnings": [
            f"{row['name']}:{row['state']}"
            for row in rows
            if actionable and row["state"] != "fresh"
        ],
    }


def is_control_loop_schedule_actionable(now: datetime) -> bool:
    local_now = now.astimezone(MARKET_TZ)
    if local_now.weekday() not in ACTIONABLE_WEEKDAYS:
        return False
    current_time = local_now.time()
    return ACTIONABLE_START <= current_time <= ACTIONABLE_END


def _artifact_row(
    *,
    name: str,
    path: Path,
    now: datetime,
    max_age_seconds: int,
    actionable: bool,
) -> dict[str, Any]:
    payload = _read_json(path)
    generated_at = payload.get("generated_at") or payload.get("known_at") if payload else None
    timestamp = _parse_time(generated_at)
    if not payload:
        state = "missing"
        age_seconds = None
    elif timestamp is None:
        state = "unknown"
        age_seconds = None
    else:
        age_seconds = max(0, int((now - timestamp).total_seconds()))
        state = "fresh" if (not actionable or age_seconds <= max_age_seconds) else "stale"
    return {
        "name": name,
        "path": str(path),
        "last_run_at": timestamp.isoformat() if timestamp else None,
        "age_seconds": age_seconds,
        "state": state,
    }


def _read_json(path: Path) -> dict[str, Any]:
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return {}
    return payload if isinstance(payload, dict) else {}


def _parse_time(value: object) -> datetime | None:
    if isinstance(value, datetime):
        return value.astimezone(UTC) if value.tzinfo else value.replace(tzinfo=UTC)
    if not isinstance(value, str) or not value.strip():
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
    return parsed.astimezone(UTC) if parsed.tzinfo else parsed.replace(tzinfo=UTC)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parent)
    parser.add_argument("--output", type=Path)
    parser.add_argument("--max-age-seconds", type=int)
    parser.add_argument("--fail-on-late", action="store_true")
    args = parser.parse_args(argv)

    result = evaluate_control_loop_schedule(
        root=args.root,
        max_age_seconds=args.max_age_seconds,
    )
    encoded = json.dumps(result, indent=2, sort_keys=True)
    if args.output:
        args.output.expanduser().parent.mkdir(parents=True, exist_ok=True)
        args.output.expanduser().write_text(encoded + "\n", encoding="utf-8")
    print(encoded)
    return 2 if args.fail_on_late and result["status"] != "ok" else 0


if __name__ == "__main__":
    raise SystemExit(main())
