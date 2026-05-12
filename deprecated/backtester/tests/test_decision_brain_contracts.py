from __future__ import annotations

import pytest

from decision_brain.state import (
    ARTIFACT_FAMILY_DECISION_STATE,
    DecisionStateValidationError,
    build_decision_state_artifact,
    build_default_ownership_map,
    validate_decision_state_artifact,
)
from research.artifacts import (
    ARTIFACT_FAMILY_RESEARCH,
    ResearchArtifactValidationError,
    build_research_artifact,
    validate_research_artifact,
)


def test_build_decision_state_artifact_serializes_consistently():
    payload = build_decision_state_artifact(
        producer="backtester.market_brief_snapshot",
        generated_at="2026-04-03T16:00:00+00:00",
        known_at="2026-04-03T15:59:00+00:00",
        health_status="ok",
        regime_state={"label": "correction"},
        breadth_state={"override_state": "inactive"},
        tape_state={"risk_tone": "defensive"},
        narrative_state={"state": "watch"},
        symbol_state={"focus": ["OXY"]},
        position_state={"position_sizing_pct": 0},
        policy_state={"posture_action": "NO_BUY"},
        freshness_ttl_seconds=900,
        input_provenance={"market_data": "ts"},
    )

    assert payload["artifact_family"] == ARTIFACT_FAMILY_DECISION_STATE
    assert payload["schema_version"] == "decision_state.v1"
    assert payload["ownership"] == build_default_ownership_map()
    assert validate_decision_state_artifact(payload) == payload


def test_decision_state_artifact_requires_known_at_and_policy_state():
    with pytest.raises(DecisionStateValidationError):
        validate_decision_state_artifact(
            {
                "artifact_family": ARTIFACT_FAMILY_DECISION_STATE,
                "schema_version": "decision_state.v1",
                "producer": "backtester.market_brief_snapshot",
                "generated_at": "2026-04-03T16:00:00+00:00",
                "known_at": "",
                "health_status": "ok",
                "regime_state": {"label": "correction"},
                "policy_state": {},
            }
        )


def test_build_research_artifact_preserves_freshness_and_provenance():
    payload = build_research_artifact(
        artifact_type="ticker_research_profile",
        producer="ts.research.profile_fetcher",
        generated_at="2026-04-03T16:00:00+00:00",
        known_at="2026-04-03T15:45:00+00:00",
        freshness_ttl_seconds=3600,
        health_status="degraded",
        payload={"symbol": "NVDA"},
        degraded_reason={"reason": "partial catalyst fetch"},
        provenance={"source": "ts", "upstream": "earnings_calendar"},
        source_owner="ts",
        runtime_lane="warm",
    )

    assert payload["artifact_family"] == ARTIFACT_FAMILY_RESEARCH
    assert payload["runtime_lane"] == "warm"
    assert payload["provenance"]["upstream"] == "earnings_calendar"
    assert validate_research_artifact(payload) == payload


def test_research_artifact_requires_known_at_and_ttl():
    with pytest.raises(ResearchArtifactValidationError):
        validate_research_artifact(
            {
                "artifact_family": ARTIFACT_FAMILY_RESEARCH,
                "schema_version": "research_artifact.v1",
                "artifact_type": "earnings_calendar_snapshot",
                "producer": "ts.research.fetcher",
                "generated_at": "2026-04-03T16:00:00+00:00",
                "known_at": "2026-04-03T16:00:00+00:00",
                "freshness_ttl_seconds": 0,
                "health_status": "ok",
                "payload": {},
            }
        )
