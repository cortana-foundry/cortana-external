from __future__ import annotations

from data.market_data_contract import normalize_provider_metadata, service_metadata_from_payload


def test_normalize_provider_metadata_accepts_camel_and_snake_case():
    meta = normalize_provider_metadata(
        {
            "source": "service",
            "status": "degraded",
            "degradedReason": "provider cooldown",
            "stalenessSeconds": "12.5",
            "providerMode": "alpaca_fallback",
            "fallbackEngaged": True,
            "providerModeReason": "Fallback lane",
        },
        provider="alpaca",
    )

    assert meta.source == "alpaca"
    assert meta.status == "degraded"
    assert meta.degraded_reason == "provider cooldown"
    assert meta.staleness_seconds == 12.5
    assert meta.provider_mode == "alpaca_fallback"
    assert meta.fallback_engaged is True
    assert meta.provider_mode_reason == "Fallback lane"


def test_normalize_provider_metadata_defaults_invalid_status():
    meta = normalize_provider_metadata({"status": "weird", "staleness_seconds": "bad"}, provider="service")

    assert meta.source == "service"
    assert meta.status == "ok"
    assert meta.staleness_seconds == 0.0


def test_service_metadata_from_payload_preserves_loader_fields():
    payload = {
        "source": "schwab",
        "status": "ok",
        "sourceData": {"provider": "schwab"},
        "availability": {"fresh": True},
    }

    metadata = service_metadata_from_payload(payload)

    assert metadata["source"] == "schwab"
    assert metadata["status"] == "ok"
    assert metadata["sourceData"] == {"provider": "schwab"}
    assert metadata["availability"] == {"fresh": True}
