from experimental_alpha import (
    build_alpha_report,
    classify_paper_action,
    default_research_symbols,
    derive_alpha_candidate,
    expected_move_bps_for_candidate,
)


def test_derive_alpha_candidate_builds_positive_edge_for_supportive_actionable_setup():
    candidate = derive_alpha_candidate(
        {
            "symbol": "NVDA",
            "asset_class": "stock",
            "verdict": "actionable",
            "analysis": {
                "effective_confidence": 78,
                "recommendation": {"action": "BUY"},
            },
            "polymarket": {
                "conviction": "supportive",
                "divergence_state": "none",
                "matched": {"severity": "major", "persistence": "accelerating", "themes": ["rates"]},
            },
        }
    )

    assert candidate.paper_action == "paper_long"
    assert candidate.calibrated_prob > 0.57
    assert candidate.kelly_fraction > 0
    assert candidate.expected_move_bps >= 150


def test_derive_alpha_candidate_skips_persistent_conflict():
    candidate = derive_alpha_candidate(
        {
            "symbol": "BTC",
            "asset_class": "crypto",
            "verdict": "needs confirmation",
            "analysis": {
                "effective_confidence": 62,
                "recommendation": {"action": "WATCH"},
            },
            "polymarket": {
                "conviction": "conflicting",
                "divergence_state": "persistent",
                "matched": {"severity": "major", "persistence": "persistent", "themes": ["crypto-policy"]},
            },
        }
    )

    assert candidate.paper_action == "skip"
    assert candidate.edge < 0.05


def test_default_research_symbols_uses_structured_buckets(monkeypatch):
    monkeypatch.setattr(
        "experimental_alpha.load_structured_context",
        lambda: {
            "watchlistBuckets": {
                "stocks": [{"symbol": "NVDA"}, {"symbol": "AMD"}],
                "cryptoProxies": [{"symbol": "COIN"}],
                "crypto": [{"symbol": "BTC"}, {"symbol": "ETH"}],
            }
        },
    )

    assert default_research_symbols(limit_per_bucket=1) == ["NVDA", "COIN", "BTC"]


def test_build_alpha_report_orders_best_candidates_first():
    class _Advisor:
        def quick_check(self, symbol: str):
            if symbol == "NVDA":
                return {
                    "symbol": "NVDA",
                    "asset_class": "stock",
                    "verdict": "actionable",
                    "analysis": {"effective_confidence": 80, "recommendation": {"action": "BUY"}},
                    "polymarket": {
                        "conviction": "supportive",
                        "divergence_state": "none",
                        "matched": {"severity": "major", "persistence": "persistent", "themes": ["rates"]},
                    },
                }
            return {
                "symbol": "XLU",
                "asset_class": "stock",
                "verdict": "early / interesting",
                "analysis": {"effective_confidence": 55, "recommendation": {"action": "WATCH"}},
                "polymarket": {
                    "conviction": "neutral",
                    "divergence_state": "watch",
                    "matched": {"severity": "minor", "persistence": "one_off", "themes": ["recession"]},
                },
            }

    report = build_alpha_report(["XLU", "NVDA"], advisor=_Advisor())
    assert report[0].symbol == "NVDA"
    assert report[0].paper_action == "paper_long"


def test_helper_functions_remain_bounded():
    assert classify_paper_action("extended", 0.6, "supportive", "none") == "reduce_or_wait"
    assert expected_move_bps_for_candidate(
        asset_class="crypto", severity="major", persistence="accelerating", conviction="supportive"
    ) > expected_move_bps_for_candidate(
        asset_class="stock", severity="minor", persistence="one_off", conviction="neutral"
    )
