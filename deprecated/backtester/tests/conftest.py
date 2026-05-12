from __future__ import annotations

import sys
from pathlib import Path


# Support the backtester's flat module layout when pytest is launched from the
# repo root as well as from /backtester under uv.
BACKTESTER_ROOT = Path(__file__).resolve().parents[1]
if str(BACKTESTER_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKTESTER_ROOT))


import json

import pytest


def _write_json(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload), encoding="utf-8")


@pytest.fixture(autouse=True)
def seed_buy_readiness_artifacts(tmp_path, monkeypatch):
    generated_at = "2099-01-01T13:00:00+00:00"
    readiness_root = tmp_path / "buy-readiness-root"
    reports = readiness_root / ".cache" / "prediction_accuracy" / "reports"
    lifecycle = readiness_root / ".cache" / "trade_lifecycle"
    strategies = [
        {"strategy_family": "canslim", "sample_depth": 25, "health_status": "fresh"},
        {"strategy_family": "dip_buyer", "sample_depth": 25, "health_status": "fresh"},
    ]
    families = [
        {"strategy_family": "canslim", "authority_tier": "limited_trust", "autonomy_mode": "advisory"},
        {"strategy_family": "dip_buyer", "authority_tier": "limited_trust", "autonomy_mode": "advisory"},
    ]
    _write_json(reports / "strategy-scorecard-latest.json", {"generated_at": generated_at, "strategies": strategies})
    _write_json(reports / "strategy-authority-tiers-latest.json", {"generated_at": generated_at, "families": families})
    for name in ("cycle_summary", "desired_state", "actual_state", "reconciliation_actions"):
        _write_json(lifecycle / f"{name}.json", {"generated_at": generated_at, "status": "ok"})
    _write_json(lifecycle / "runtime_health.json", {"generated_at": generated_at, "status": "ok", "incident_markers": []})
    calibration_path = tmp_path / "buy-decision-calibration-latest.json"
    _write_json(
        calibration_path,
        {
            "generated_at": generated_at,
            "freshness": {"is_stale": False, "reason": "fresh"},
            "summary": {"settled_candidates": 25},
        },
    )
    monkeypatch.setenv("BUY_READINESS_ROOT", str(readiness_root))
    monkeypatch.setenv("BUY_READINESS_TEST_BYPASS", "1")
    monkeypatch.setenv("BUY_READINESS_MARKET_MAX_STALENESS_SECONDS", "999999")
    monkeypatch.setenv("BUY_DECISION_CALIBRATION_PATH", str(calibration_path))
