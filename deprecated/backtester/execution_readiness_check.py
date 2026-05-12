"""Dry-run validator for execution intents before any broker adapter sees them."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

from execution.broker_port import ApprovedTradeIntent, DryRunBrokerExecutionPort, ExecutionIntentError


def validate_execution_intent(payload: dict[str, Any]) -> dict[str, Any]:
    try:
        intent = ApprovedTradeIntent(
            symbol=str(payload.get("symbol") or ""),
            side=str(payload.get("side") or ""),
            quantity=float(payload.get("quantity") or 0),
            strategy=str(payload.get("strategy") or ""),
            approval_ref=str(payload.get("approval_ref") or payload.get("approvalRef") or ""),
            buy_readiness=dict(payload.get("buy_readiness") or payload.get("buyReadiness") or {}),
            source_signal_id=payload.get("source_signal_id") or payload.get("sourceSignalId"),
        )
        result = DryRunBrokerExecutionPort().submit_intent(intent)
        return {
            "artifact_family": "execution_readiness_check",
            "schema_version": 1,
            "status": "ok",
            "accepted": True,
            "mode": result["mode"],
            "intent": result["intent"],
            "reason": None,
        }
    except (ExecutionIntentError, TypeError, ValueError) as error:
        return {
            "artifact_family": "execution_readiness_check",
            "schema_version": 1,
            "status": "blocked",
            "accepted": False,
            "mode": "dry_run",
            "intent": None,
            "reason": str(error),
        }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("intent", type=Path)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args(argv)

    payload = json.loads(args.intent.read_text(encoding="utf-8"))
    result = validate_execution_intent(payload if isinstance(payload, dict) else {})
    encoded = json.dumps(result, indent=2, sort_keys=True)
    if args.output:
        args.output.expanduser().parent.mkdir(parents=True, exist_ok=True)
        args.output.expanduser().write_text(encoded + "\n", encoding="utf-8")
    print(encoded)
    return 0 if result["accepted"] else 2


if __name__ == "__main__":
    raise SystemExit(main())
