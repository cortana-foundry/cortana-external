from __future__ import annotations

import pytest

from artifact_schema import assert_valid_trading_artifact, validate_trading_artifact


def test_validates_known_artifact_family_and_schema_version():
    result = validate_trading_artifact({"artifact_family": "buy_readiness", "schema_version": 1})

    assert result.ok is True
    assert result.family == "buy_readiness"
    assert result.schema_version == 1


def test_rejects_known_artifact_with_missing_schema_version():
    result = validate_trading_artifact({"artifact_family": "buy_readiness"})

    assert result.ok is False
    assert "missing schema_version" in str(result.reason)


def test_expected_family_must_match():
    with pytest.raises(ValueError, match="expected market_data_freshness_lane"):
        assert_valid_trading_artifact({"artifact_family": "buy_readiness", "schema_version": 1}, expected_family="market_data_freshness_lane")
