from __future__ import annotations

import pytest

from alert_contract import build_alert_contract


def test_alert_contract_stabilizes_buy_candidate_dedupe_key():
    contract = build_alert_contract("buy_candidate", symbol="NVDA", strategy="dip_buyer", generated_at="2026-04-24T14:00:00+00:00")

    assert contract["artifact_family"] == "telegram_alert_contract"
    assert contract["schema_version"] == 1
    assert contract["severity"] == "critical"
    assert contract["dedupe_key"] == "buy_candidate:NVDA:dip_buyer"
    assert contract["receipt_required"] is True


def test_alert_contract_rejects_unknown_type():
    with pytest.raises(ValueError, match="unknown alert_type"):
        build_alert_contract("random_alert")
