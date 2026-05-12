from __future__ import annotations

import json
from pathlib import Path

from dipbuyer_profile_report import build_dipbuyer_profile_report, save_dipbuyer_profile_report


def test_dipbuyer_profile_report_waits_for_real_scan_samples(tmp_path):
    report = build_dipbuyer_profile_report(root=tmp_path, generated_at="2026-04-24T14:00:00+00:00")

    assert report["status"] == "missing"
    assert "before optimizing" in report["recommendation"]


def test_dipbuyer_profile_report_names_slowest_phase(tmp_path):
    source = Path(tmp_path) / ".cache" / "trade_lifecycle" / "scan_performance_dip_buyer_latest.json"
    source.parent.mkdir(parents=True)
    source.write_text(
        json.dumps({"artifact_family": "strategy_scan_performance", "schema_version": 1, "top_phases": [{"name": "score_symbols", "seconds": 12.5}]}),
        encoding="utf-8",
    )

    path = save_dipbuyer_profile_report(root=tmp_path, generated_at="2026-04-24T14:00:00+00:00")

    payload = json.loads(path.read_text(encoding="utf-8"))
    assert payload["slowest_phase"] == "score_symbols"
    assert payload["slowest_seconds"] == 12.5
