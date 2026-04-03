from __future__ import annotations

from datetime import datetime, timezone

from research.runtime import (
    build_hot_contract,
    build_research_runtime_snapshot,
    classify_research_freshness,
    read_hot_research_artifact,
    write_research_artifact,
)


def test_hot_research_read_returns_fresh_artifact(tmp_path):
    payload = build_hot_contract(
        artifact_type="ticker_research_profile",
        producer="ts.research.fetcher",
        known_at="2026-04-03T16:00:00+00:00",
        generated_at="2026-04-03T16:05:00+00:00",
        freshness_ttl_seconds=3600,
        payload={"symbol": "NVDA"},
    )
    write_research_artifact(root=tmp_path, filename="nvda.json", payload=payload)

    loaded = read_hot_research_artifact(
        root=tmp_path,
        filename="nvda.json",
        now=datetime(2026, 4, 3, 16, 30, tzinfo=timezone.utc),
    )

    assert loaded is not None
    assert loaded["freshness_state"] == "fresh"
    assert loaded["payload"]["symbol"] == "NVDA"


def test_hot_research_read_drops_stale_unusable_artifact(tmp_path):
    payload = build_hot_contract(
        artifact_type="ticker_research_profile",
        producer="ts.research.fetcher",
        known_at="2026-04-03T16:00:00+00:00",
        generated_at="2026-04-03T16:05:00+00:00",
        freshness_ttl_seconds=60,
        payload={"symbol": "NVDA"},
    )
    write_research_artifact(root=tmp_path, filename="nvda.json", payload=payload)

    loaded = read_hot_research_artifact(
        root=tmp_path,
        filename="nvda.json",
        now=datetime(2026, 4, 3, 17, 10, tzinfo=timezone.utc),
    )

    assert loaded is None


def test_research_runtime_snapshot_tracks_hot_warm_and_cold(tmp_path):
    hot = build_hot_contract(
        artifact_type="ticker_research_profile",
        producer="ts.research.fetcher",
        known_at="2026-04-03T16:00:00+00:00",
        generated_at="2026-04-03T16:05:00+00:00",
        freshness_ttl_seconds=3600,
        payload={"symbol": "NVDA"},
    )
    warm = {
        **hot,
        "artifact_type": "earnings_calendar_snapshot",
        "runtime_lane": "warm",
    }
    cold = {
        **hot,
        "artifact_type": "transcript_archive",
        "runtime_lane": "cold",
    }
    snapshot = build_research_runtime_snapshot(
        root=tmp_path,
        generated_at="2026-04-03T16:10:00+00:00",
        hot_contracts=[hot],
        warm_registry=[warm],
        cold_registry=[cold],
    )

    assert snapshot["hot_path_reads"][0]["runtime_lane"] == "hot"
    assert snapshot["warm_lane_registry"][0]["artifact_type"] == "earnings_calendar_snapshot"
    assert snapshot["cold_lane_registry"][0]["artifact_type"] == "transcript_archive"


def test_classify_research_freshness_distinguishes_usable_and_unusable():
    payload = build_hot_contract(
        artifact_type="ticker_research_profile",
        producer="ts.research.fetcher",
        known_at="2026-04-03T16:00:00+00:00",
        generated_at="2026-04-03T16:05:00+00:00",
        freshness_ttl_seconds=300,
        payload={"symbol": "NVDA"},
    )
    usable = classify_research_freshness(payload, now=datetime(2026, 4, 3, 16, 4, tzinfo=timezone.utc))
    stale = classify_research_freshness(payload, now=datetime(2026, 4, 3, 16, 20, tzinfo=timezone.utc))

    assert usable["state"] == "fresh"
    assert stale["state"] == "stale_unusable"
