"""Market-data payload contract helpers shared by provider adapters."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Mapping


@dataclass(frozen=True)
class ProviderMetadata:
    source: str
    status: str = "ok"
    degraded_reason: str = ""
    staleness_seconds: float = 0.0
    provider_mode: str = "unknown"
    fallback_engaged: bool = False
    provider_mode_reason: str = ""


def normalize_provider_metadata(metadata: Mapping[str, Any] | None, *, provider: str) -> ProviderMetadata:
    metadata = metadata or {}
    source = str(metadata.get("source") or provider)
    status = str(metadata.get("status") or "ok")
    if status not in {"ok", "degraded"}:
        status = "ok"
    if source == "service":
        source = provider
    return ProviderMetadata(
        source=source,
        status=status,
        degraded_reason=str(metadata.get("degraded_reason") or metadata.get("degradedReason") or ""),
        staleness_seconds=_floatish(metadata.get("staleness_seconds") or metadata.get("stalenessSeconds") or 0.0),
        provider_mode=str(metadata.get("provider_mode") or metadata.get("providerMode") or "unknown"),
        fallback_engaged=bool(metadata.get("fallback_engaged") or metadata.get("fallbackEngaged") or False),
        provider_mode_reason=str(metadata.get("provider_mode_reason") or metadata.get("providerModeReason") or ""),
    )


def service_metadata_from_payload(payload: Mapping[str, Any] | None) -> dict[str, Any]:
    payload = payload or {}
    return {
        "source": str(payload.get("source") or "service"),
        "status": str(payload.get("status") or "ok"),
        "degradedReason": str(payload.get("degradedReason") or payload.get("degraded_reason") or ""),
        "stalenessSeconds": _floatish(payload.get("stalenessSeconds") or payload.get("staleness_seconds") or 0.0),
        "providerMode": str(payload.get("providerMode") or payload.get("provider_mode") or "unknown"),
        "fallbackEngaged": bool(payload.get("fallbackEngaged") or payload.get("fallback_engaged") or False),
        "providerModeReason": str(payload.get("providerModeReason") or payload.get("provider_mode_reason") or ""),
        "sourceData": payload.get("sourceData", {}),
        "availability": payload.get("availability"),
    }


def _floatish(value: object) -> float:
    try:
        return float(value or 0.0)
    except (TypeError, ValueError):
        return 0.0
