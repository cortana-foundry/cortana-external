from __future__ import annotations

import json
from types import SimpleNamespace

from readiness.buy_readiness import apply_buy_readiness, build_buy_readiness_context, save_buy_readiness_summary, summarize_buy_readiness


def _write_json(path, payload):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload), encoding="utf-8")


def _seed_ready_artifacts(root, generated_at="2026-04-24T13:00:00+00:00"):
    reports = root / ".cache" / "prediction_accuracy" / "reports"
    lifecycle = root / ".cache" / "trade_lifecycle"
    _write_json(
        reports / "strategy-scorecard-latest.json",
        {"generated_at": generated_at, "strategies": [{"strategy_family": "canslim", "sample_depth": 12, "health_status": "fresh"}]},
    )
    _write_json(
        reports / "strategy-authority-tiers-latest.json",
        {"generated_at": generated_at, "families": [{"strategy_family": "canslim", "authority_tier": "limited_trust", "autonomy_mode": "advisory"}]},
    )
    for name in ("cycle_summary", "desired_state", "actual_state", "reconciliation_actions"):
        _write_json(lifecycle / f"{name}.json", {"generated_at": generated_at, "status": "ok"})
    _write_json(lifecycle / "runtime_health.json", {"generated_at": generated_at, "status": "ok", "incident_markers": []})


def test_buy_readiness_allows_buy_when_all_gates_pass(tmp_path):
    _seed_ready_artifacts(tmp_path)
    market = SimpleNamespace(status="ok", data_source="schwab", provider_mode="schwab_primary", fallback_engaged=False, snapshot_age_seconds=30)

    readiness = build_buy_readiness_context(
        strategy="canslim",
        market=market,
        max_input_staleness_seconds=45,
        calibration_summary={"settled_candidates": 8, "is_stale": False},
        generated_at="2026-04-24T14:00:00+00:00",
        root=tmp_path,
    )

    assert readiness["allowed"] is True
    rows = apply_buy_readiness([{"symbol": "MSFT", "action": "BUY"}], readiness)
    assert rows[0]["raw_action"] == "BUY"
    assert rows[0]["final_action"] == "BUY"
    assert rows[0]["action"] == "BUY"


def test_buy_readiness_downgrades_raw_buy_when_required_artifacts_are_missing(tmp_path):
    market = SimpleNamespace(status="degraded", data_source="cache", provider_mode="cache_fallback", fallback_engaged=True, snapshot_age_seconds=7200)

    readiness = build_buy_readiness_context(
        strategy="canslim",
        market=market,
        max_input_staleness_seconds=7200,
        calibration_summary={"settled_candidates": 0, "is_stale": True},
        generated_at="2026-04-24T14:00:00+00:00",
        root=tmp_path,
    )
    rows = apply_buy_readiness([{"symbol": "MSFT", "action": "BUY", "reason": "Strong setup."}], readiness)
    summary = summarize_buy_readiness(readiness, rows)

    assert readiness["allowed"] is False
    assert rows[0]["raw_action"] == "BUY"
    assert rows[0]["final_action"] == "WATCH"
    assert rows[0]["action"] == "WATCH"
    assert rows[0]["buy_readiness_blocked"] is True
    assert "BUY_BLOCKED:MARKET_DATA_DEGRADED" in rows[0]["vetoes"]
    assert summary["raw_buy_count"] == 1
    assert summary["final_buy_count"] == 0
    assert summary["blocked_buy_count"] == 1


def test_buy_readiness_summary_writes_latest_artifact(tmp_path):
    summary = {"status": "blocked", "blocked_buy_count": 1}

    path = save_buy_readiness_summary(summary, root=tmp_path)

    assert path == tmp_path / ".cache" / "trade_lifecycle" / "buy_readiness_latest.json"
    assert json.loads(path.read_text(encoding="utf-8"))["blocked_buy_count"] == 1


def test_buy_readiness_blocks_buy_when_runtime_health_has_incidents(tmp_path):
    _seed_ready_artifacts(tmp_path)
    runtime_path = tmp_path / ".cache" / "trade_lifecycle" / "runtime_health.json"
    _write_json(
        runtime_path,
        {
            "generated_at": "2026-04-24T13:00:00+00:00",
            "status": "degraded",
            "incident_markers": [{"incident_type": "provider_cooldown"}],
        },
    )
    market = SimpleNamespace(status="ok", data_source="schwab", provider_mode="schwab_primary", fallback_engaged=False, snapshot_age_seconds=30)

    readiness = build_buy_readiness_context(
        strategy="canslim",
        market=market,
        max_input_staleness_seconds=45,
        calibration_summary={"settled_candidates": 8, "is_stale": False},
        generated_at="2026-04-24T14:00:00+00:00",
        root=tmp_path,
    )

    assert readiness["allowed"] is False
    assert "BUY_BLOCKED:RUNTIME_HEALTH_DEGRADED" in readiness["blockers"]
    assert "BUY_BLOCKED:RUNTIME_HEALTH_INCIDENTS" in readiness["blockers"]


def test_buy_readiness_rejects_test_generated_scorecard_artifacts(tmp_path):
    _seed_ready_artifacts(tmp_path)
    scorecard_path = tmp_path / ".cache" / "prediction_accuracy" / "reports" / "strategy-scorecard-latest.json"
    _write_json(scorecard_path, {"generated_at": "2026-04-24T13:00:00+00:00", "strategies": ["<MagicMock name=scorecard>"]})
    market = SimpleNamespace(status="ok", data_source="schwab", provider_mode="schwab_primary", fallback_engaged=False, snapshot_age_seconds=30)

    readiness = build_buy_readiness_context(
        strategy="canslim",
        market=market,
        max_input_staleness_seconds=45,
        calibration_summary={"settled_candidates": 8, "is_stale": False},
        generated_at="2026-04-24T14:00:00+00:00",
        root=tmp_path,
    )

    assert readiness["allowed"] is False
    assert "BUY_BLOCKED:SCORECARD_MISSING" in readiness["blockers"]
