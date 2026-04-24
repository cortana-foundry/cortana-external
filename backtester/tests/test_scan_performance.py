from __future__ import annotations

import json

from scan_performance import build_scan_performance_artifact, save_scan_performance_artifact


def test_scan_performance_artifact_orders_slowest_phases(tmp_path):
    artifact = build_scan_performance_artifact(
        strategy="dip_buyer",
        generated_at="2026-04-24T14:00:00+00:00",
        phase_timings={"market": 0.1, "analysis": 12.4, "context": 1.2},
        nested_timings={"sentiment": 3.2},
        counters={"scanned": 50},
    )

    assert artifact["top_phases"][0] == {"name": "analysis", "seconds": 12.4}
    assert artifact["counters"]["scanned"] == 50


def test_scan_performance_save_writes_strategy_and_latest(tmp_path):
    path = save_scan_performance_artifact(
        strategy="canslim",
        generated_at="2026-04-24T14:00:00+00:00",
        phase_timings={"market": 0.1},
        root=tmp_path,
    )

    assert path.name == "scan_performance_canslim_latest.json"
    assert json.loads(path.with_name("scan_performance_latest.json").read_text(encoding="utf-8"))["strategy"] == "canslim"
