#!/usr/bin/env python3
"""Paper-only experimental alpha report using quick-check + Polymarket context.

This module is intentionally isolated from the production alert path.
It does not place trades or mutate any runtime artifacts.
"""

from __future__ import annotations

import argparse
import json
from dataclasses import asdict, dataclass
from typing import Iterable, Optional

from advisor import TradingAdvisor
from data.polymarket_context import load_structured_context

VERDICT_BASE_PROB = {
    "actionable": 0.58,
    "needs confirmation": 0.54,
    "early / interesting": 0.515,
    "extended": 0.47,
    "manage winners / exhaustion risk": 0.46,
    "avoid for now": 0.42,
}

SEVERITY_ADJ = {"minor": 0.0, "notable": 0.02, "major": 0.04}
PERSISTENCE_ADJ = {"one_off": 0.0, "persistent": 0.015, "accelerating": 0.03, "reversing": -0.02}
CONVICTION_ADJ = {"supportive": 0.02, "neutral": 0.0, "conflicting": -0.03}
DIVERGENCE_ADJ = {"none": 0.0, "watch": -0.015, "persistent": -0.03}


@dataclass
class AlphaCandidate:
    symbol: str
    asset_class: str
    verdict: str
    base_action: str
    confidence_pct: int
    conviction: str
    divergence_state: str
    severity: str
    persistence: str
    calibrated_prob: float
    edge: float
    kelly_fraction: float
    expected_move_bps: int
    paper_action: str
    rationale: str


def derive_alpha_candidate(result: dict, *, max_kelly_fraction: float = 0.08) -> AlphaCandidate:
    analysis = result.get("analysis", {}) or {}
    recommendation = analysis.get("recommendation", {}) or {}
    polymarket = result.get("polymarket", {}) or {}
    matched = polymarket.get("matched", {}) if isinstance(polymarket.get("matched"), dict) else {}

    verdict = str(result.get("verdict", "avoid for now"))
    base_prob = VERDICT_BASE_PROB.get(verdict, 0.45)
    confidence_pct = int(
        analysis.get("effective_confidence", analysis.get("confidence", recommendation.get("confidence", 0))) or 0
    )
    confidence_adj = max(min((confidence_pct - 50) / 1000.0, 0.03), -0.03)

    conviction = str(polymarket.get("conviction", "neutral") or "neutral")
    divergence_state = str(polymarket.get("divergence_state", "none") or "none")
    severity = str(matched.get("severity", "minor") or "minor")
    persistence = str(matched.get("persistence", "one_off") or "one_off")

    calibrated_prob = base_prob
    calibrated_prob += SEVERITY_ADJ.get(severity, 0.0)
    calibrated_prob += PERSISTENCE_ADJ.get(persistence, 0.0)
    calibrated_prob += CONVICTION_ADJ.get(conviction, 0.0)
    calibrated_prob += DIVERGENCE_ADJ.get(divergence_state, 0.0)
    calibrated_prob += confidence_adj
    calibrated_prob = round(min(max(calibrated_prob, 0.05), 0.95), 4)

    # Even-money binary approximation for paper research only.
    edge = round(calibrated_prob - 0.5, 4)
    kelly_fraction = round(min(max(2 * calibrated_prob - 1, 0.0), max_kelly_fraction), 4)

    expected_move_bps = expected_move_bps_for_candidate(
        asset_class=str(result.get("asset_class", "stock")),
        severity=severity,
        persistence=persistence,
        conviction=conviction,
    )
    paper_action = classify_paper_action(verdict, calibrated_prob, conviction, divergence_state)
    rationale = build_rationale(
        verdict=verdict,
        conviction=conviction,
        divergence_state=divergence_state,
        severity=severity,
        persistence=persistence,
    )

    return AlphaCandidate(
        symbol=str(result.get("symbol", "")),
        asset_class=str(result.get("asset_class", "stock")),
        verdict=verdict,
        base_action=str(recommendation.get("action", "N/A")),
        confidence_pct=confidence_pct,
        conviction=conviction,
        divergence_state=divergence_state,
        severity=severity,
        persistence=persistence,
        calibrated_prob=calibrated_prob,
        edge=edge,
        kelly_fraction=kelly_fraction,
        expected_move_bps=expected_move_bps,
        paper_action=paper_action,
        rationale=rationale,
    )


def expected_move_bps_for_candidate(*, asset_class: str, severity: str, persistence: str, conviction: str) -> int:
    base = 140 if asset_class in {"crypto", "crypto_proxy"} else 90
    sev_mult = {"minor": 1.0, "notable": 1.4, "major": 1.8}.get(severity, 1.0)
    persist_mult = {"one_off": 1.0, "persistent": 1.15, "accelerating": 1.35, "reversing": 0.8}.get(persistence, 1.0)
    conviction_mult = {"supportive": 1.1, "neutral": 1.0, "conflicting": 0.8}.get(conviction, 1.0)
    return int(round(base * sev_mult * persist_mult * conviction_mult))


def classify_paper_action(verdict: str, calibrated_prob: float, conviction: str, divergence_state: str) -> str:
    if conviction == "conflicting" and divergence_state == "persistent":
        return "skip"
    if verdict == "actionable" and calibrated_prob >= 0.57:
        return "paper_long"
    if verdict in {"needs confirmation", "early / interesting"} and calibrated_prob >= 0.54:
        return "track"
    if verdict in {"extended", "manage winners / exhaustion risk"}:
        return "reduce_or_wait"
    return "skip"


def build_rationale(*, verdict: str, conviction: str, divergence_state: str, severity: str, persistence: str) -> str:
    return (
        f"{verdict}; conviction {conviction}; divergence {divergence_state}; "
        f"signal {severity}; persistence {persistence}"
    )


def default_research_symbols(limit_per_bucket: int = 3) -> list[str]:
    report = load_structured_context()
    if report is None:
        return []

    buckets = report.get("watchlistBuckets", {})
    symbols: list[str] = []
    for key in ("stocks", "cryptoProxies", "crypto"):
        entries = buckets.get(key, [])
        if not isinstance(entries, list):
            continue
        for item in entries[:limit_per_bucket]:
            symbol = str(item.get("symbol", "")).strip().upper()
            if symbol and symbol not in symbols:
                symbols.append(symbol)
    return symbols


def build_alpha_report(symbols: Iterable[str], advisor: Optional[TradingAdvisor] = None) -> list[AlphaCandidate]:
    advisor = advisor or TradingAdvisor()
    candidates: list[AlphaCandidate] = []
    for symbol in symbols:
        result = advisor.quick_check(symbol)
        candidates.append(derive_alpha_candidate(result))

    return sorted(
        candidates,
        key=lambda item: (item.paper_action != "paper_long", -item.edge, -item.expected_move_bps, item.symbol),
    )


def format_alpha_report(candidates: list[AlphaCandidate]) -> str:
    if not candidates:
        return "Experimental alpha report\nNo fresh candidates surfaced from the current Polymarket context."

    lines = ["Experimental alpha report", "Paper-only research output"]
    for candidate in candidates:
        lines.append(
            f"- {candidate.symbol}: {candidate.paper_action} | {candidate.verdict} | "
            f"p={candidate.calibrated_prob:.3f} | edge={candidate.edge:+.3f} | "
            f"kelly={candidate.kelly_fraction:.3f} | move={candidate.expected_move_bps}bps | "
            f"{candidate.rationale}"
        )
    return "\n".join(lines)


def parse_args(argv: Optional[list[str]] = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Paper-only experimental alpha report")
    parser.add_argument("--symbols", type=str, help="Comma-separated symbols to evaluate")
    parser.add_argument("--json", action="store_true", help="Emit JSON instead of text")
    parser.add_argument("--limit-per-bucket", type=int, default=3, help="Default symbol fanout from each bucket")
    return parser.parse_args(argv)


def main(argv: Optional[list[str]] = None) -> None:
    args = parse_args(argv)
    if args.symbols:
        symbols = [item.strip().upper() for item in args.symbols.split(",") if item.strip()]
    else:
        symbols = default_research_symbols(limit_per_bucket=args.limit_per_bucket)

    report = build_alpha_report(symbols)
    if args.json:
        print(json.dumps([asdict(candidate) for candidate in report], indent=2))
    else:
        print(format_alpha_report(report))


if __name__ == "__main__":
    main()
