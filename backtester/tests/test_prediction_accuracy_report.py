from __future__ import annotations

import sys

import prediction_accuracy_report


def test_prediction_accuracy_report_renders_richer_summary(monkeypatch, capsys):
    monkeypatch.setattr(prediction_accuracy_report, "settle_prediction_snapshots", lambda: None)
    monkeypatch.setattr(
        prediction_accuracy_report,
        "build_prediction_accuracy_summary",
        lambda: {
            "schema_version": 1,
            "artifact_family": "prediction_accuracy_summary",
            "snapshot_count": 12,
            "record_count": 48,
            "settlement_status_counts": {"settled": 9, "partially_settled": 2, "insufficient_data": 1},
            "maturity_state_counts": {"matured": 9, "partial": 2, "incomplete": 1},
            "horizon_status": {
                "1d": {"matured": 16, "pending": 20, "incomplete": 12},
                "5d": {"matured": 8, "pending": 24, "incomplete": 16},
                "20d": {"matured": 3, "pending": 30, "incomplete": 15},
            },
            "validation_grade_counts": {
                "signal_validation_grade": {"good": 8, "mixed": 3, "poor": 1},
                "entry_validation_grade": {"good": 6, "unknown": 4, "not_applicable": 2},
                "execution_validation_grade": {"unknown": 10, "good": 2},
                "trade_validation_grade": {"good": 5, "mixed": 4, "unknown": 2, "poor": 1},
            },
            "summary": [
                {
                    "strategy": "dip_buyer",
                    "action": "NO_BUY",
                    "5d": {
                        "samples": 8,
                        "avg_return_pct": -1.25,
                        "median_return_pct": -0.8,
                        "hit_rate": 0.25,
                        "decision_accuracy": 0.75,
                        "decision_accuracy_label": "avoidance_rate",
                        "avg_max_drawdown_pct": -3.2,
                        "avg_max_runup_pct": 1.1,
                    }
                }
            ],
            "by_regime": [
                {
                    "strategy": "dip_buyer",
                    "market_regime": "correction",
                    "action": "NO_BUY",
                    "5d": {
                        "samples": 5,
                        "avg_return_pct": -1.8,
                        "median_return_pct": -1.2,
                        "hit_rate": 0.2,
                        "decision_accuracy": 0.8,
                        "decision_accuracy_label": "avoidance_rate",
                    },
                }
            ],
            "by_confidence_bucket": [
                {
                    "strategy": "dip_buyer",
                    "confidence_bucket": "medium",
                    "action": "NO_BUY",
                    "5d": {
                        "samples": 4,
                        "avg_return_pct": -1.1,
                        "median_return_pct": -0.9,
                        "hit_rate": 0.25,
                        "decision_accuracy": 0.75,
                        "decision_accuracy_label": "avoidance_rate",
                    },
                }
            ],
        },
    )
    monkeypatch.setattr(sys, "argv", ["prediction_accuracy_report.py"])

    prediction_accuracy_report.main()

    out = capsys.readouterr().out
    assert "Prediction accuracy" in out
    assert "Snapshots settled: 12" in out
    assert "Records logged: 48" in out
    assert "Settlement states: insufficient_data 1 | partially_settled 2 | settled 9" in out
    assert "Maturity states: incomplete 1 | matured 9 | partial 2" in out
    assert "Settlement coverage: 1d: matured 16 | pending 20 | incomplete 12" in out
    assert "Validation grades: signal validation: good 8 | mixed 3 | poor 1" in out
    assert "By strategy/action" in out
    assert "dip_buyer NO_BUY" in out
    assert "avoidance_rate=75%" in out
    assert "avg drawdown -3.20%" in out
    assert "By regime" in out
    assert "dip_buyer correction NO_BUY" in out
    assert "By confidence bucket" in out
    assert "dip_buyer medium NO_BUY" in out
