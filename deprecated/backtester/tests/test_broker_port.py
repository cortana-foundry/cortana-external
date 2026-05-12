from __future__ import annotations

import pytest

from execution.broker_port import ApprovedTradeIntent, DryRunBrokerExecutionPort, ExecutionIntentError


def test_dry_run_broker_accepts_already_approved_buy_intent():
    port = DryRunBrokerExecutionPort()
    intent = ApprovedTradeIntent(
        symbol="msft",
        side="buy",
        quantity=3,
        strategy="canslim",
        approval_ref="operator-approval-1",
        buy_readiness={"decision": "BUY_ALLOWED", "allowed": True},
    )

    result = port.submit_intent(intent)

    assert result["status"] == "accepted"
    assert result["intent"]["symbol"] == "MSFT"


def test_broker_boundary_rejects_buy_without_buy_allowed_readiness():
    port = DryRunBrokerExecutionPort()
    intent = ApprovedTradeIntent(
        symbol="MSFT",
        side="buy",
        quantity=3,
        strategy="canslim",
        approval_ref="operator-approval-1",
        buy_readiness={"decision": "BUY_BLOCKED", "allowed": False},
    )

    with pytest.raises(ExecutionIntentError, match="BUY_ALLOWED"):
        port.submit_intent(intent)


def test_broker_boundary_requires_operator_approval_reference():
    intent = ApprovedTradeIntent(
        symbol="MSFT",
        side="sell",
        quantity=1,
        strategy="dip_buyer",
        approval_ref="",
        buy_readiness={"decision": "BUY_BLOCKED", "allowed": False},
    )

    with pytest.raises(ExecutionIntentError, match="approval_ref"):
        intent.validate()
