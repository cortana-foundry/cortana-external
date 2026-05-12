"""Read Dip Buyer scan timing artifacts and name the bottleneck to optimize."""

from __future__ import annotations

import argparse
import json
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, Mapping

from artifact_schema import assert_valid_trading_artifact

SCHEMA_VERSION = 1


def build_dipbuyer_profile_report(*, root: Path | None = None, generated_at: str | None = None) -> dict[str, Any]:
    base = (root or Path(__file__).resolve().parent).expanduser()
    source = base / ".cache" / "trade_lifecycle" / "scan_performance_dip_buyer_latest.json"
    performance = _read_json(source)
    top_phase = _top_phase(performance)
    if not performance or not top_phase:
        return _artifact(
            generated_at=generated_at,
            source=str(source),
            status="missing",
            slowest_phase=None,
            slowest_seconds=None,
            sample_count=0,
            recommendation="Run Dip Buyer scans with scan performance artifacts before optimizing.",
        )

    return _artifact(
        generated_at=generated_at,
        source=str(source),
        status="ok",
        slowest_phase=top_phase["name"],
        slowest_seconds=top_phase["seconds"],
        sample_count=1,
        recommendation=f"Optimize only {top_phase['name']} after repeated samples confirm this bottleneck.",
    )


def save_dipbuyer_profile_report(*, root: Path | None = None, output: Path | None = None, generated_at: str | None = None) -> Path:
    base = (root or Path(__file__).resolve().parent).expanduser()
    target = output.expanduser() if output else base / ".cache" / "trade_lifecycle" / "dipbuyer_profile_report_latest.json"
    payload = build_dipbuyer_profile_report(root=base, generated_at=generated_at)
    assert_valid_trading_artifact(payload, expected_family="dipbuyer_profile_report")
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    return target


def _artifact(
    *,
    generated_at: str | None,
    source: str,
    status: str,
    slowest_phase: str | None,
    slowest_seconds: float | None,
    sample_count: int,
    recommendation: str,
) -> dict[str, Any]:
    return {
        "artifact_family": "dipbuyer_profile_report",
        "schema_version": SCHEMA_VERSION,
        "generated_at": generated_at or datetime.now(UTC).isoformat(),
        "status": status,
        "source": source,
        "slowest_phase": slowest_phase,
        "slowest_seconds": slowest_seconds,
        "sample_count": sample_count,
        "recommendation": recommendation,
    }


def _read_json(path: Path) -> Mapping[str, Any] | None:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None
    return value if isinstance(value, Mapping) else None


def _top_phase(performance: Mapping[str, Any] | None) -> dict[str, Any] | None:
    rows = performance.get("top_phases") if performance else None
    if not isinstance(rows, list) or not rows:
        return None
    row = rows[0]
    if not isinstance(row, Mapping):
        return None
    name = str(row.get("name") or "").strip()
    try:
        seconds = round(float(row.get("seconds") or 0.0), 3)
    except (TypeError, ValueError):
        seconds = 0.0
    return {"name": name, "seconds": seconds} if name else None


def main() -> int:
    parser = argparse.ArgumentParser(description="Write a Dip Buyer profiling report from scan performance artifacts.")
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parent)
    parser.add_argument("--output", type=Path)
    parser.add_argument("--pretty", action="store_true")
    args = parser.parse_args()
    path = save_dipbuyer_profile_report(root=args.root, output=args.output)
    if args.pretty:
        print(path)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
