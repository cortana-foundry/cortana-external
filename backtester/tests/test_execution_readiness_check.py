from __future__ import annotations

import json

from execution_readiness_check import main, validate_execution_intent


def test_execution_readiness_check_accepts_approved_buy():
    result = validate_execution_intent({
        "symbol": "MSFT",
        "side": "buy",
        "quantity": 2,
        "strategy": "canslim",
        "approval_ref": "operator-1",
        "buy_readiness": {"decision": "BUY_ALLOWED", "allowed": True},
    })

    assert result["status"] == "ok"
    assert result["accepted"] is True


def test_execution_readiness_check_blocks_unapproved_buy():
    result = validate_execution_intent({
        "symbol": "MSFT",
        "side": "buy",
        "quantity": 2,
        "strategy": "canslim",
        "approval_ref": "operator-1",
        "buy_readiness": {"decision": "BUY_BLOCKED", "allowed": False},
    })

    assert result["status"] == "blocked"
    assert "BUY_ALLOWED" in result["reason"]


def test_execution_readiness_check_cli_writes_output(tmp_path, capsys):
    intent = tmp_path / "intent.json"
    output = tmp_path / "out.json"
    intent.write_text(json.dumps({
        "symbol": "MSFT",
        "side": "buy",
        "quantity": 1,
        "strategy": "canslim",
        "approval_ref": "operator-1",
        "buy_readiness": {"decision": "BUY_ALLOWED", "allowed": True},
    }), encoding="utf-8")

    exit_code = main([str(intent), "--output", str(output)])

    assert exit_code == 0
    assert json.loads(output.read_text(encoding="utf-8"))["accepted"] is True
    assert "execution_readiness_check" in capsys.readouterr().out
