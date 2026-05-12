"""BUY-readiness gates for final operator actions."""

from __future__ import annotations

import json
import os
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, Mapping, Sequence

from evaluation.artifact_safety import looks_like_mock_artifact
from evaluation.prediction_accuracy import default_prediction_root
from artifact_schema import assert_valid_trading_artifact
from readiness.freshness_policy import freshness_policy
from governance.authority import DEFAULT_STRATEGY_AUTHORITY_PATH

SCHEMA_VERSION = 1
GATE_VERSION = "buy_readiness.v1"
DEFAULT_MARKET_MAX_STALENESS_SECONDS = freshness_policy("market_data").max_age_seconds
DEFAULT_SCORECARD_MAX_AGE_HOURS = freshness_policy("prediction_scorecard").max_age_hours
DEFAULT_LIFECYCLE_MAX_AGE_HOURS = freshness_policy("lifecycle").max_age_hours
DEFAULT_RUNTIME_HEALTH_MAX_AGE_HOURS = freshness_policy("runtime_health").max_age_hours
MIN_AUTHORITY_TIER = "limited_trust"
AUTHORITY_RANK = {"demoted": 0, "exploratory": 1, "limited_trust": 2, "trusted": 3}
BLOCKER_PREFIX = "BUY_BLOCKED"


def build_buy_readiness_context(
    *,
    strategy: str,
    market: object,
    max_input_staleness_seconds: float = 0.0,
    calibration_summary: Mapping[str, Any] | None = None,
    generated_at: str | datetime | None = None,
    root: Path | None = None,
) -> dict[str, Any]:
    """Return the canonical hard-gate context for final BUY labels."""

    now = _parse_time(generated_at) or datetime.now(UTC)
    if root is None and os.getenv("BUY_READINESS_TEST_BYPASS") == "1":
        return {
            "artifact_family": "buy_readiness",
            "schema_version": SCHEMA_VERSION,
            "gate_version": GATE_VERSION,
            "generated_at": now.isoformat(),
            "strategy": str(strategy or "").strip().lower(),
            "allowed": True,
            "status": "ok",
            "minimum_authority_tier": os.getenv("BUY_READINESS_MIN_AUTHORITY_TIER", MIN_AUTHORITY_TIER),
            "blockers": [],
            "checks": {"test_bypass": {"passed": True, "blockers": []}},
        }
    base = _base_root(root)
    blockers: list[str] = []
    checks: dict[str, dict[str, Any]] = {}

    checks["market_data"] = _market_data_check(
        market=market,
        max_input_staleness_seconds=max_input_staleness_seconds,
        max_age_seconds=_env_float("BUY_READINESS_MARKET_MAX_STALENESS_SECONDS", DEFAULT_MARKET_MAX_STALENESS_SECONDS),
    )
    checks["scorecard"] = _scorecard_check(
        strategy=strategy,
        path=_prediction_reports_root(base) / "strategy-scorecard-latest.json",
        now=now,
        max_age_hours=_env_float("BUY_READINESS_SCORECARD_MAX_AGE_HOURS", DEFAULT_SCORECARD_MAX_AGE_HOURS),
    )
    checks["authority"] = _authority_check(
        strategy=strategy,
        path=_authority_path(base),
        minimum_tier=os.getenv("BUY_READINESS_MIN_AUTHORITY_TIER", MIN_AUTHORITY_TIER),
    )
    checks["lifecycle"] = _lifecycle_check(
        lifecycle_root=base / ".cache" / "trade_lifecycle",
        now=now,
        max_age_hours=_env_float("BUY_READINESS_LIFECYCLE_MAX_AGE_HOURS", DEFAULT_LIFECYCLE_MAX_AGE_HOURS),
    )
    checks["runtime_health"] = _runtime_health_check(
        path=base / ".cache" / "trade_lifecycle" / "runtime_health.json",
        now=now,
        max_age_hours=_env_float("BUY_READINESS_RUNTIME_HEALTH_MAX_AGE_HOURS", DEFAULT_RUNTIME_HEALTH_MAX_AGE_HOURS),
    )
    checks["calibration"] = _calibration_check(calibration_summary)

    for check in checks.values():
        if not bool(check.get("passed")):
            blockers.extend(str(code) for code in check.get("blockers") or [] if str(code))

    unique_blockers = list(dict.fromkeys(blockers))
    return {
        "artifact_family": "buy_readiness",
        "schema_version": SCHEMA_VERSION,
        "gate_version": GATE_VERSION,
        "generated_at": now.isoformat(),
        "strategy": str(strategy or "").strip().lower(),
        "allowed": not unique_blockers,
        "status": "ok" if not unique_blockers else "blocked",
        "minimum_authority_tier": os.getenv("BUY_READINESS_MIN_AUTHORITY_TIER", MIN_AUTHORITY_TIER),
        "blockers": unique_blockers,
        "checks": checks,
    }


def apply_buy_readiness(records: Sequence[Mapping[str, Any]], readiness: Mapping[str, Any]) -> list[dict[str, Any]]:
    """Preserve raw BUYs but downgrade final BUY labels when readiness fails."""

    allowed = bool(readiness.get("allowed"))
    blockers = [str(code) for code in readiness.get("blockers") or [] if str(code)]
    output: list[dict[str, Any]] = []
    for item in records:
        row = dict(item)
        raw_action = str(row.get("raw_action") or row.get("action") or "NO_BUY").strip().upper()
        current_action = str(row.get("action") or raw_action or "NO_BUY").strip().upper()
        final_action = current_action
        readiness_payload = {
            "gate_version": str(readiness.get("gate_version") or GATE_VERSION),
            "allowed": allowed,
            "status": str(readiness.get("status") or ("ok" if allowed else "blocked")),
            "blockers": list(blockers),
        }
        row["raw_action"] = raw_action
        if current_action == "BUY" and not allowed:
            final_action = "WATCH"
            row["action"] = final_action
            row["buy_readiness_blocked"] = True
            vetoes = [str(value) for value in row.get("vetoes") or [] if str(value)]
            row["vetoes"] = list(dict.fromkeys([*vetoes, *blockers]))
            reason = str(row.get("reason") or "").strip()
            blocker_text = ", ".join(blockers) if blockers else "BUY_BLOCKED:UNKNOWN"
            row["reason"] = f"{reason} BUY readiness blocked final BUY: {blocker_text}".strip()
        else:
            row["buy_readiness_blocked"] = False
        row["final_action"] = final_action
        row["buy_readiness"] = readiness_payload
        output.append(row)
    return output


def summarize_buy_readiness(readiness: Mapping[str, Any], records: Sequence[Mapping[str, Any]]) -> dict[str, Any]:
    raw_buy_count = sum(1 for row in records if str(row.get("raw_action") or row.get("action") or "").upper() == "BUY")
    final_buy_count = sum(1 for row in records if str(row.get("final_action") or row.get("action") or "").upper() == "BUY")
    blocked_buy_count = sum(1 for row in records if bool(row.get("buy_readiness_blocked")))
    return {
        "schema_version": SCHEMA_VERSION,
        "gate_version": str(readiness.get("gate_version") or GATE_VERSION),
        "allowed": bool(readiness.get("allowed")),
        "status": str(readiness.get("status") or "unknown"),
        "decision": "BUY_ALLOWED" if bool(readiness.get("allowed")) else "BUY_BLOCKED",
        "generated_at": readiness.get("generated_at"),
        "strategy": readiness.get("strategy"),
        "blockers": list(readiness.get("blockers") or []),
        "raw_buy_count": raw_buy_count,
        "final_buy_count": final_buy_count,
        "blocked_buy_count": blocked_buy_count,
        "checks": dict(readiness.get("checks") or {}),
    }


def save_buy_readiness_summary(summary: Mapping[str, Any], *, path: Path | None = None, root: Path | None = None) -> Path:
    base = _base_root(root)
    target = path.expanduser() if path else base / ".cache" / "trade_lifecycle" / "buy_readiness_latest.json"
    artifact = build_buy_readiness_artifact(summary)
    assert_valid_trading_artifact(artifact, expected_family="buy_readiness")
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(artifact, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    strategy = str(summary.get("strategy") or "").strip().lower()
    if strategy and path is None:
        strategy_target = target.with_name(f"buy_readiness_{strategy}_latest.json")
        strategy_target.write_text(json.dumps(artifact, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    return target


def build_buy_readiness_artifact(summary: Mapping[str, Any]) -> dict[str, Any]:
    payload = dict(summary)
    payload.update(
        {
            "artifact_family": "buy_readiness",
            "schema_version": SCHEMA_VERSION,
            "gate_version": str(summary.get("gate_version") or GATE_VERSION),
            "decision": "BUY_ALLOWED" if bool(summary.get("allowed")) else "BUY_BLOCKED",
            "summary": {
                "raw_buy_count": int(summary.get("raw_buy_count", 0) or 0),
                "final_buy_count": int(summary.get("final_buy_count", 0) or 0),
                "blocked_buy_count": int(summary.get("blocked_buy_count", 0) or 0),
            },
            "readiness": {
                "allowed": bool(summary.get("allowed")),
                "status": str(summary.get("status") or "unknown"),
                "blockers": list(summary.get("blockers") or []),
                "checks": dict(summary.get("checks") or {}),
            },
        }
    )
    return payload


def buy_readiness_line(summary: Mapping[str, Any]) -> str:
    if not summary or int(summary.get("raw_buy_count", 0) or 0) <= 0:
        return ""
    if bool(summary.get("allowed")):
        return "BUY readiness: BUY_ALLOWED — final BUY labels have current evidence."
    blockers = ", ".join(str(code) for code in summary.get("blockers") or [] if str(code)) or "BUY_BLOCKED:UNKNOWN"
    return f"BUY readiness: BUY_BLOCKED — raw BUY downgraded to WATCH until gates clear ({blockers})."


def _market_data_check(*, market: object, max_input_staleness_seconds: float, max_age_seconds: float) -> dict[str, Any]:
    status = str(getattr(market, "status", "ok") or "ok").strip().lower()
    data_source = str(getattr(market, "data_source", "unknown") or "unknown").strip().lower()
    provider_mode = str(getattr(market, "provider_mode", "unknown") or "unknown").strip().lower()
    fallback = bool(getattr(market, "fallback_engaged", False))
    snapshot_age = _float(getattr(market, "snapshot_age_seconds", 0.0))
    max_input_age = max(_float(max_input_staleness_seconds), snapshot_age)
    blockers: list[str] = []
    if status != "ok":
        blockers.append("BUY_BLOCKED:MARKET_DATA_DEGRADED")
    if fallback or provider_mode in {"cache_fallback", "unavailable"} or data_source in {"cache", "unavailable"}:
        blockers.append("BUY_BLOCKED:MARKET_DATA_NOT_PRIMARY")
    if max_input_age > max_age_seconds:
        blockers.append("BUY_BLOCKED:MARKET_DATA_STALE")
    return {
        "passed": not blockers,
        "blockers": list(dict.fromkeys(blockers)),
        "status": status,
        "data_source": data_source,
        "provider_mode": provider_mode,
        "fallback_engaged": fallback,
        "max_input_staleness_seconds": round(max_input_age, 3),
        "max_allowed_staleness_seconds": float(max_age_seconds),
    }


def _scorecard_check(*, strategy: str, path: Path, now: datetime, max_age_hours: float) -> dict[str, Any]:
    payload = _load_json(path)
    blockers: list[str] = []
    if not payload:
        blockers.append("BUY_BLOCKED:SCORECARD_MISSING")
        return {"passed": False, "blockers": blockers, "path": str(path), "age_hours": None}
    age_hours = _age_hours(payload.get("generated_at"), now)
    if age_hours is None or age_hours > max_age_hours:
        blockers.append("BUY_BLOCKED:SCORECARD_STALE")
    row = _strategy_row(payload.get("strategies"), strategy)
    sample_depth = int((row or {}).get("sample_depth", 0) or 0)
    if not row or sample_depth <= 0:
        blockers.append("BUY_BLOCKED:SCORECARD_EMPTY")
    return {
        "passed": not blockers,
        "blockers": list(dict.fromkeys(blockers)),
        "path": str(path),
        "generated_at": payload.get("generated_at"),
        "age_hours": age_hours,
        "max_age_hours": float(max_age_hours),
        "sample_depth": sample_depth,
        "health_status": str((row or {}).get("health_status") or "unknown"),
    }


def _authority_check(*, strategy: str, path: Path, minimum_tier: str) -> dict[str, Any]:
    payload = _load_json(path)
    blockers: list[str] = []
    if not payload:
        return {"passed": False, "blockers": ["BUY_BLOCKED:AUTHORITY_MISSING"], "path": str(path), "authority_tier": None}
    row = _strategy_row(payload.get("families"), strategy)
    tier = str((row or {}).get("authority_tier") or "").strip().lower()
    if not row:
        blockers.append("BUY_BLOCKED:AUTHORITY_EMPTY")
    if AUTHORITY_RANK.get(tier, 0) < AUTHORITY_RANK.get(str(minimum_tier).strip().lower(), AUTHORITY_RANK[MIN_AUTHORITY_TIER]):
        blockers.append("BUY_BLOCKED:AUTHORITY_BELOW_THRESHOLD")
    return {
        "passed": not blockers,
        "blockers": list(dict.fromkeys(blockers)),
        "path": str(path),
        "authority_tier": tier or None,
        "minimum_tier": str(minimum_tier).strip().lower(),
        "autonomy_mode": str((row or {}).get("autonomy_mode") or "") or None,
    }


def _lifecycle_check(*, lifecycle_root: Path, now: datetime, max_age_hours: float) -> dict[str, Any]:
    required = {
        "cycle_summary": lifecycle_root / "cycle_summary.json",
        "desired_state": lifecycle_root / "desired_state.json",
        "actual_state": lifecycle_root / "actual_state.json",
        "reconciliation_actions": lifecycle_root / "reconciliation_actions.json",
    }
    artifacts: dict[str, Any] = {}
    blockers: list[str] = []
    for name, path in required.items():
        payload = _load_json(path)
        if not payload:
            artifacts[name] = {"path": str(path), "present": False, "age_hours": None}
            blockers.append(f"BUY_BLOCKED:LIFECYCLE_{name.upper()}_MISSING")
            continue
        age_hours = _age_hours(payload.get("generated_at") or payload.get("known_at"), now)
        stale = age_hours is None or age_hours > max_age_hours
        artifacts[name] = {"path": str(path), "present": True, "age_hours": age_hours, "status": payload.get("status")}
        if stale:
            blockers.append(f"BUY_BLOCKED:LIFECYCLE_{name.upper()}_STALE")
    return {
        "passed": not blockers,
        "blockers": blockers,
        "max_age_hours": float(max_age_hours),
        "artifacts": artifacts,
    }


def _runtime_health_check(*, path: Path, now: datetime, max_age_hours: float) -> dict[str, Any]:
    payload = _load_json(path)
    blockers: list[str] = []
    if not payload:
        return {
            "passed": False,
            "blockers": ["BUY_BLOCKED:RUNTIME_HEALTH_MISSING"],
            "path": str(path),
            "age_hours": None,
            "incident_count": None,
        }
    age_hours = _age_hours(payload.get("generated_at") or payload.get("known_at"), now)
    incidents = [item for item in payload.get("incident_markers") or [] if isinstance(item, Mapping)]
    status = str(payload.get("status") or "unknown").strip().lower()
    if age_hours is None or age_hours > max_age_hours:
        blockers.append("BUY_BLOCKED:RUNTIME_HEALTH_STALE")
    if status != "ok":
        blockers.append("BUY_BLOCKED:RUNTIME_HEALTH_DEGRADED")
    if incidents:
        blockers.append("BUY_BLOCKED:RUNTIME_HEALTH_INCIDENTS")
    return {
        "passed": not blockers,
        "blockers": list(dict.fromkeys(blockers)),
        "path": str(path),
        "generated_at": payload.get("generated_at"),
        "age_hours": age_hours,
        "max_age_hours": float(max_age_hours),
        "status": status,
        "incident_count": len(incidents),
    }


def _calibration_check(summary: Mapping[str, Any] | None) -> dict[str, Any]:
    if not summary:
        return {"passed": False, "blockers": ["BUY_BLOCKED:CALIBRATION_MISSING"], "settled_candidates": 0}
    settled = int(summary.get("settled_candidates", 0) or 0)
    stale = bool(summary.get("is_stale"))
    blockers: list[str] = []
    if settled <= 0:
        blockers.append("BUY_BLOCKED:CALIBRATION_EMPTY")
    elif stale:
        blockers.append("BUY_BLOCKED:CALIBRATION_STALE")
    return {
        "passed": not blockers,
        "blockers": blockers,
        "settled_candidates": settled,
        "is_stale": stale,
        "reason": summary.get("reason"),
        "generated_at": summary.get("generated_at"),
    }



def _base_root(root: Path | None) -> Path:
    if root is not None:
        return root.expanduser()
    override = os.getenv("BUY_READINESS_ROOT")
    if override:
        return Path(override).expanduser()
    return Path(__file__).resolve().parents[1]


def _prediction_reports_root(base: Path) -> Path:
    default_root = default_prediction_root()
    repo_root = Path(__file__).resolve().parents[2]
    try:
        if base.resolve() == repo_root.resolve():
            return default_root / "reports"
    except Exception:
        pass
    return base / ".cache" / "prediction_accuracy" / "reports"


def _authority_path(base: Path) -> Path:
    repo_root = Path(__file__).resolve().parents[2]
    try:
        if base.resolve() == repo_root.resolve():
            return DEFAULT_STRATEGY_AUTHORITY_PATH
    except Exception:
        pass
    return base / ".cache" / "prediction_accuracy" / "reports" / "strategy-authority-tiers-latest.json"


def _strategy_row(rows: object, strategy: str) -> dict[str, Any] | None:
    target = str(strategy or "").strip().lower()
    for item in rows or []:
        if not isinstance(item, Mapping):
            continue
        family = str(item.get("strategy_family") or item.get("strategy") or "").strip().lower()
        if family == target:
            return dict(item)
    return None


def _load_json(path: Path) -> dict[str, Any]:
    try:
        payload = json.loads(path.expanduser().read_text(encoding="utf-8"))
    except Exception:
        return {}
    if looks_like_mock_artifact(payload):
        return {}
    return dict(payload) if isinstance(payload, dict) else {}


def _age_hours(value: object, now: datetime) -> float | None:
    ts = _parse_time(value)
    if ts is None:
        return None
    return round(max((now - ts).total_seconds(), 0.0) / 3600.0, 3)


def _parse_time(value: object) -> datetime | None:
    if isinstance(value, datetime):
        return value.astimezone(UTC) if value.tzinfo else value.replace(tzinfo=UTC)
    if not isinstance(value, str) or not value.strip():
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
    return parsed.astimezone(UTC) if parsed.tzinfo else parsed.replace(tzinfo=UTC)


def _float(value: object) -> float:
    try:
        return float(value or 0.0)
    except (TypeError, ValueError):
        return 0.0


def _env_float(name: str, default: float) -> float:
    try:
        return float(os.getenv(name, str(default)))
    except (TypeError, ValueError):
        return float(default)
