from __future__ import annotations

import json
from types import SimpleNamespace

from market_data_freshness_lane import build_market_data_freshness_lane, save_market_data_freshness_lane


def test_market_data_freshness_lane_reports_fresh_primary_data(tmp_path):
    market = SimpleNamespace(status="ok", provider_mode="schwab_primary", data_source="schwab", fallback_engaged=False, snapshot_age_seconds=30)

    lane = build_market_data_freshness_lane(market, generated_at="2026-04-24T14:00:00+00:00")

    assert lane["status"] == "ok"
    assert lane["reason"] == "fresh"


def test_market_data_freshness_lane_reports_cache_only(tmp_path):
    market = SimpleNamespace(status="ok", provider_mode="cache_fallback", data_source="cache", fallback_engaged=True, snapshot_age_seconds=30)

    path = save_market_data_freshness_lane(market, generated_at="2026-04-24T14:00:00+00:00", root=tmp_path)

    payload = json.loads(path.read_text(encoding="utf-8"))
    assert payload["status"] == "degraded"
    assert payload["reason"] == "cache_only"
