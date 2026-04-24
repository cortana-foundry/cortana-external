"""Execution boundary for already-approved trade intents."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Mapping, Protocol


class ExecutionIntentError(ValueError):
    """Raised when a strategy tries to send an unapproved or invalid intent."""


@dataclass(frozen=True)
class ApprovedTradeIntent:
    symbol: str
    side: str
    quantity: float
    strategy: str
    approval_ref: str
    buy_readiness: Mapping[str, Any]
    source_signal_id: str | None = None

    def validate(self) -> None:
        symbol = self.symbol.strip().upper()
        side = self.side.strip().lower()
        if not symbol:
            raise ExecutionIntentError("symbol is required")
        if side not in {"buy", "sell"}:
            raise ExecutionIntentError("side must be buy or sell")
        if self.quantity <= 0:
            raise ExecutionIntentError("quantity must be positive")
        if not self.strategy.strip():
            raise ExecutionIntentError("strategy is required")
        if not self.approval_ref.strip():
            raise ExecutionIntentError("approval_ref is required")
        if side == "buy":
            decision = str(self.buy_readiness.get("decision") or "").strip().upper()
            allowed = bool(self.buy_readiness.get("allowed"))
            if decision != "BUY_ALLOWED" or not allowed:
                raise ExecutionIntentError("BUY intent requires BUY_ALLOWED readiness")

    def to_payload(self) -> dict[str, Any]:
        self.validate()
        return {
            "symbol": self.symbol.strip().upper(),
            "side": self.side.strip().lower(),
            "quantity": self.quantity,
            "strategy": self.strategy.strip().lower(),
            "approval_ref": self.approval_ref.strip(),
            "source_signal_id": self.source_signal_id,
            "buy_readiness": dict(self.buy_readiness),
        }


class BrokerExecutionPort(Protocol):
    def submit_intent(self, intent: ApprovedTradeIntent) -> Mapping[str, Any]:
        """Submit an already-approved intent to the broker adapter."""


class DryRunBrokerExecutionPort:
    """Validates the execution contract without touching a broker API."""

    def submit_intent(self, intent: ApprovedTradeIntent) -> Mapping[str, Any]:
        payload = intent.to_payload()
        return {
            "status": "accepted",
            "mode": "dry_run",
            "intent": payload,
        }
