from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pandas as pd

from evaluation.prediction_accuracy import (
    build_prediction_accuracy_summary,
    persist_prediction_snapshot,
    settle_prediction_snapshots,
)


class _StubProvider:
    def get_history(self, symbol: str, period: str = "6mo"):
        frame = pd.DataFrame(
            {
                "Open": [10.0, 11.0, 12.0],
                "High": [10.0, 11.0, 12.0],
                "Low": [10.0, 11.0, 12.0],
                "Close": [10.0, 11.0, 12.0],
                "Volume": [100, 100, 100],
            },
            index=pd.to_datetime(
                [
                    datetime(2026, 3, 1, tzinfo=timezone.utc),
                    datetime(2026, 3, 3, tzinfo=timezone.utc),
                    datetime(2026, 3, 25, tzinfo=timezone.utc),
                ]
            ),
        )
        return type("History", (), {"frame": frame})()


def test_prediction_accuracy_round_trip(tmp_path):
    generated_at = datetime(2026, 3, 1, tzinfo=timezone.utc)
    persist_prediction_snapshot(
        strategy="dip_buyer",
        market_regime="correction",
        records=[{"symbol": "AAPL", "action": "WATCH", "score": 8, "effective_confidence": 61, "uncertainty_pct": 18, "trade_quality_score": 72, "reason": "test"}],
        root=tmp_path,
        generated_at=generated_at,
    )

    settle_prediction_snapshots(root=tmp_path, provider=_StubProvider(), now=generated_at + timedelta(days=30))
    summary = build_prediction_accuracy_summary(root=tmp_path)

    assert summary["snapshot_count"] == 1
    assert summary["record_count"] == 1
    assert summary["horizon_status"]["1d"]["matured"] == 1
    assert summary["horizon_status"]["20d"]["matured"] == 1
    bucket = summary["summary"][0]
    assert bucket["strategy"] == "dip_buyer"
    assert bucket["action"] == "WATCH"
    assert bucket["20d"]["samples"] == 1
    assert bucket["20d"]["decision_accuracy_label"] == "watch_success_rate"
    assert bucket["20d"]["decision_accuracy"] == 1.0
    regime_bucket = summary["by_regime"][0]
    assert regime_bucket["market_regime"] == "correction"
    confidence_bucket = summary["by_confidence_bucket"][0]
    assert confidence_bucket["confidence_bucket"] == "medium"


class _NegativeStubProvider:
    def get_history(self, symbol: str, period: str = "6mo"):
        frame = pd.DataFrame(
            {
                "Open": [10.0, 9.0, 8.0],
                "High": [10.0, 9.0, 8.0],
                "Low": [10.0, 9.0, 8.0],
                "Close": [10.0, 9.0, 8.0],
                "Volume": [100, 100, 100],
            },
            index=pd.to_datetime(
                [
                    datetime(2026, 3, 1, tzinfo=timezone.utc),
                    datetime(2026, 3, 3, tzinfo=timezone.utc),
                    datetime(2026, 3, 25, tzinfo=timezone.utc),
                ]
            ),
        )
        return type("History", (), {"frame": frame})()


def test_prediction_accuracy_uses_action_aware_avoidance_rate_for_no_buy(tmp_path):
    generated_at = datetime(2026, 3, 1, tzinfo=timezone.utc)
    persist_prediction_snapshot(
        strategy="canslim",
        market_regime="correction",
        records=[{"symbol": "MSFT", "action": "NO_BUY", "score": 6, "effective_confidence": 29, "reason": "test"}],
        root=tmp_path,
        generated_at=generated_at,
    )

    settle_prediction_snapshots(root=tmp_path, provider=_NegativeStubProvider(), now=generated_at + timedelta(days=30))
    summary = build_prediction_accuracy_summary(root=tmp_path)

    bucket = summary["summary"][0]
    assert bucket["action"] == "NO_BUY"
    assert bucket["20d"]["decision_accuracy_label"] == "avoidance_rate"
    assert bucket["20d"]["decision_accuracy"] == 1.0
    assert bucket["20d"]["avg_return_pct"] < 0
