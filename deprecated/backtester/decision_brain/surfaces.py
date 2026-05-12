"""Surface-facing helpers for canonical decision-state and shadow review artifacts."""

from __future__ import annotations

import json
import os
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from decision_brain.narrative import (
    build_bounded_narrative_overlay,
    normalize_polymarket_narrative_snapshot,
    normalize_x_narrative_snapshot,
)
from decision_brain.state import build_decision_state_artifact
from decision_brain.weights import build_adaptive_weight_snapshot
from evaluation.benchmark_models import DEFAULT_HORIZON_KEY, build_benchmark_comparison_artifact
from evaluation.prediction_accuracy import default_prediction_root
from research.runtime import build_research_runtime_snapshot, read_hot_research_artifact

DEFAULT_RESEARCH_RUNTIME_ROOT = Path(
    os.getenv("RESEARCH_RUNTIME_ROOT", ".cache/research")
).expanduser()
DEFAULT_HOT_RESEARCH_FILES: tuple[str, ...] = (
    "ticker-research-profile.json",
    "earnings-calendar-latest.json",
    "theme-map-latest.json",
)


def load_shadow_inputs() -> tuple[dict[str, Any] | None, dict[str, Any] | None, list[str]]:
    warnings: list[str] = []
    comparison_artifact: dict[str, Any] | None = None
    calibration_artifact: dict[str, Any] | None = None

    comparison_path = (
        default_prediction_root() / "reports" / "benchmark-comparison-latest.json"
    )
    comparison_artifact = _load_json_path(comparison_path)
    if comparison_artifact is None:
        try:
            comparison_artifact = build_benchmark_comparison_artifact(
                root=default_prediction_root(),
                horizon_key=DEFAULT_HORIZON_KEY,
            )
            warnings.append("shadow_inputs_benchmark_rebuilt")
        except Exception as exc:
            warnings.append(f"shadow_inputs_benchmark_unavailable:{exc}")

    calibration_path = Path(
        os.getenv(
            "BUY_DECISION_CALIBRATION_PATH",
            str(_default_calibration_artifact_path()),
        )
    ).expanduser()
    calibration_artifact = _load_json_path(calibration_path)
    if calibration_artifact is None:
        warnings.append("shadow_inputs_calibration_unavailable")

    return comparison_artifact, calibration_artifact, warnings


def build_surface_research_runtime(
    *,
    generated_at: str,
    root: Path = DEFAULT_RESEARCH_RUNTIME_ROOT,
    hot_files: tuple[str, ...] = DEFAULT_HOT_RESEARCH_FILES,
) -> dict[str, Any]:
    hot_contracts: list[dict[str, Any]] = []
    states: dict[str, int] = {"fresh": 0, "stale_usable": 0, "stale_unusable": 0}
    now = datetime.fromisoformat(str(generated_at).replace("Z", "+00:00"))
    if now.tzinfo is None:
        now = now.replace(tzinfo=UTC)
    for filename in hot_files:
        loaded = read_hot_research_artifact(root=root, filename=filename, now=now)
        if loaded is None:
            states["stale_unusable"] += 1
            continue
        freshness_state = str(loaded.get("freshness_state") or "fresh")
        if freshness_state in states:
            states[freshness_state] += 1
        hot_contracts.append(loaded)

    snapshot = build_research_runtime_snapshot(
        root=root,
        generated_at=generated_at,
        hot_contracts=hot_contracts,
        warm_registry=[],
        cold_registry=[],
    )
    hot_rows = snapshot.get("hot_path_reads") or []
    fresh_count = states["fresh"]
    stale_usable_count = states["stale_usable"]
    if hot_rows:
        summary_line = (
            f"Research plane has {len(hot_rows)} hot-path artifact(s): "
            f"{fresh_count} fresh, {stale_usable_count} stale-usable."
        )
        health_status = "ok" if stale_usable_count == 0 else "degraded"
    else:
        summary_line = "Research plane has no hot-path artifacts yet; decisions are not blocked."
        health_status = "degraded"
    snapshot["summary"] = {
        "health_status": health_status,
        "hot_count": len(hot_rows),
        "fresh_count": fresh_count,
        "stale_usable_count": stale_usable_count,
        "summary_line": summary_line,
    }
    return snapshot


def build_market_brief_decision_bundle(
    *,
    generated_at: str,
    known_at: str,
    producer: str,
    session_phase: str,
    regime: dict[str, Any],
    posture: dict[str, Any],
    breadth: dict[str, Any],
    tape: dict[str, Any],
    macro_report: dict[str, Any] | None,
    focus: dict[str, Any],
    comparison_artifact: dict[str, Any] | None = None,
    calibration_artifact: dict[str, Any] | None = None,
    research_runtime: dict[str, Any] | None = None,
) -> dict[str, Any]:
    x_snapshot = normalize_x_narrative_snapshot(
        symbol_rows=[],
        generated_at=generated_at,
        known_at=known_at,
    )
    polymarket_snapshot = (
        normalize_polymarket_narrative_snapshot(
            report=macro_report,
            generated_at=generated_at,
            known_at=known_at,
        )
        if isinstance(macro_report, dict)
        else {}
    )
    narrative_overlay = build_bounded_narrative_overlay(
        x_snapshot=x_snapshot,
        polymarket_snapshot=polymarket_snapshot,
    )
    adaptive_weights = build_adaptive_weight_snapshot(
        regime_bucket=str(regime.get("label") or "unknown"),
        session_bucket=str(session_phase or "unknown").lower(),
        comparison_artifact=comparison_artifact,
        calibration_artifact=calibration_artifact,
    )

    decision_state = build_decision_state_artifact(
        producer=producer,
        generated_at=generated_at,
        known_at=known_at,
        health_status="degraded" if str(regime.get("status") or "ok") != "ok" or str(tape.get("status") or "ok") != "ok" else "ok",
        degraded_reason={
            "regime": regime.get("degraded_reason"),
            "tape_status": tape.get("status"),
            "breadth_warnings": list(breadth.get("warnings") or []),
        },
        freshness_ttl_seconds=900 if str(session_phase).upper() == "OPEN" else 3600,
        input_provenance={
            "regime_source": regime.get("data_source"),
            "tape_primary_source": tape.get("primary_source"),
            "macro_known_at": (macro_report or {}).get("metadata", {}).get("generatedAt")
            if isinstance((macro_report or {}).get("metadata"), dict)
            else None,
        },
        regime_state=dict(regime),
        breadth_state=dict(breadth),
        tape_state=dict(tape),
        narrative_state={
            "x_snapshot": x_snapshot,
            "polymarket_snapshot": polymarket_snapshot,
            "overlay": narrative_overlay,
        },
        symbol_state={"focus": dict(focus)},
        position_state={},
        policy_state={
            "action": posture.get("action"),
            "reason": posture.get("reason"),
            "authority_cap": breadth.get("authority_cap", "inactive"),
            "session_phase": session_phase,
        },
        shadow_mode=True,
    )
    shadow_review = build_shadow_review_artifact(
        generated_at=generated_at,
        session_phase=session_phase,
        posture=posture,
        breadth=breadth,
        adaptive_weights=adaptive_weights,
        narrative_overlay=narrative_overlay,
        research_runtime=research_runtime or build_surface_research_runtime(generated_at=generated_at),
    )
    return {
        "decision_state": decision_state,
        "adaptive_weights": adaptive_weights,
        "narrative_overlay": narrative_overlay,
        "shadow_review": shadow_review,
    }


def build_shadow_review_artifact(
    *,
    generated_at: str,
    session_phase: str,
    posture: dict[str, Any],
    breadth: dict[str, Any],
    adaptive_weights: dict[str, Any],
    narrative_overlay: dict[str, Any],
    research_runtime: dict[str, Any],
) -> dict[str, Any]:
    strategy_weights = dict(adaptive_weights.get("strategy_weights") or {})
    top_weight = None
    if strategy_weights:
        top_weight = max(strategy_weights.items(), key=lambda item: float(item[1]))

    live_action = str(posture.get("action") or "NO_BUY").upper()
    breadth_state = str(breadth.get("override_state") or "inactive").strip().lower()
    shadow_action = live_action
    notes: list[str] = ["Shadow mode only; no live authority changes."]

    if breadth_state == "selective-buy" and live_action == "NO_BUY":
        shadow_action = "SELECTIVE_BUY"
        notes.append("Intraday breadth would permit tightly selective buys in shadow mode.")
    elif breadth_state == "watch_only" and live_action == "NO_BUY":
        shadow_action = "WATCH"
        notes.append("Intraday breadth is constructive, but not strong enough for selective-buy authority.")

    crowding = narrative_overlay.get("crowding_warnings") or []
    if crowding:
        crowded_symbols = ", ".join(str(item.get("symbol") or "") for item in crowding[:3] if str(item.get("symbol") or ""))
        if crowded_symbols:
            notes.append(f"Crowding warnings are suppressing confidence on {crowded_symbols}.")

    priority_symbols = narrative_overlay.get("priority_symbols") or []
    if priority_symbols:
        notes.append(f"Narrative discovery is prioritizing {', '.join(priority_symbols[:3])}.")

    research_summary = (research_runtime.get("summary") or {}) if isinstance(research_runtime, dict) else {}
    notes.append(str(research_summary.get("summary_line") or "Research freshness is unavailable."))

    if top_weight:
        notes.append(f"Top adaptive strategy weight in shadow mode: {top_weight[0]}={float(top_weight[1]):.2f}.")

    authority_change = "no_change" if shadow_action == live_action else "shadow_only_more_constructive"
    summary_line = (
        f"Shadow review: live posture {live_action}; "
        f"shadow posture {shadow_action}; session {str(session_phase or 'unknown').upper()}."
    )
    return {
        "artifact_family": "decision_brain_shadow_review",
        "schema_version": 1,
        "generated_at": generated_at,
        "live_action": live_action,
        "shadow_action": shadow_action,
        "authority_change": authority_change,
        "summary_line": summary_line,
        "notes": notes,
        "top_strategy_weight": {"strategy": top_weight[0], "weight": float(top_weight[1])} if top_weight else None,
    }


def _load_json_path(path: Path) -> dict[str, Any] | None:
    try:
        if not path.exists():
            return None
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return None


def _default_calibration_artifact_path() -> Path:
    return Path(__file__).resolve().parent.parent / ".cache" / "experimental_alpha" / "calibration" / "buy-decision-calibration-latest.json"
