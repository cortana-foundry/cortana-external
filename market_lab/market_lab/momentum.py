from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any

from dateutil.parser import isoparse

from .models import MomentumSnapshot, MomentumWindow

WINDOW_DAYS = {
    "1d": 1,
    "5d": 5,
    "20d": 20,
    "60d": 60,
}


def build_momentum_snapshot(symbol: str, market_data: Any) -> MomentumSnapshot:
    normalized = symbol.strip().upper()
    generated_at = datetime.now(UTC)
    symbol_points = _extract_points(_safe_history(market_data, normalized))
    spy_points = _extract_points(_safe_history(market_data, "SPY"))
    windows = [
        _build_window(label, days, symbol_points=symbol_points, spy_points=spy_points)
        for label, days in WINDOW_DAYS.items()
    ]
    available = [item for item in windows if item.status == "available"]
    if len(available) == len(windows):
        status = "available"
    elif available:
        status = "partial"
    else:
        status = "missing"
    return MomentumSnapshot(
        status=status,
        generated_at=generated_at,
        symbol=normalized,
        windows=windows,
        summary=_summary(available),
        unavailable_windows=[item.window for item in windows if item.status != "available"],
    )


def _safe_history(market_data: Any, symbol: str) -> dict[str, Any] | None:
    getter = getattr(market_data, "get_history", None)
    if not callable(getter):
        return None
    try:
        payload = getter(symbol, period="3mo")
    except TypeError:
        payload = getter(symbol)
    except Exception:
        return None
    return payload if isinstance(payload, dict) else None


def _extract_points(payload: dict[str, Any] | None) -> list[tuple[datetime, float]]:
    if not payload:
        return []
    raw_items = _find_price_items(payload)
    points: list[tuple[datetime, float]] = []
    for item in raw_items:
        if not isinstance(item, dict):
            continue
        timestamp = _parse_time(
            item.get("datetime")
            or item.get("timestamp")
            or item.get("date")
            or item.get("time")
            or item.get("asOf")
            or item.get("as_of")
        )
        close = _parse_price(
            item.get("close")
            or item.get("Close")
            or item.get("price")
            or item.get("last")
            or item.get("lastPrice")
            or item.get("regularMarketPrice")
        )
        if timestamp and close is not None and close > 0:
            points.append((timestamp, close))
    return sorted(points, key=lambda point: point[0])


def _find_price_items(payload: Any) -> list[Any]:
    if isinstance(payload, list):
        return payload
    if not isinstance(payload, dict):
        return []
    for key in ("candles", "prices", "items", "history", "data", "payload"):
        value = payload.get(key)
        if isinstance(value, list):
            return value
        nested = _find_price_items(value)
        if nested:
            return nested
    return []


def _parse_time(value: Any) -> datetime | None:
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=UTC)
    if isinstance(value, (int, float)):
        if value > 10_000_000_000:
            value = value / 1000
        return datetime.fromtimestamp(value, tz=UTC)
    if isinstance(value, str) and value.strip():
        try:
            parsed = isoparse(value)
            return parsed if parsed.tzinfo else parsed.replace(tzinfo=UTC)
        except ValueError:
            return None
    return None


def _parse_price(value: Any) -> float | None:
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        try:
            return float(value)
        except ValueError:
            return None
    return None


def _build_window(
    window: str,
    days: int,
    *,
    symbol_points: list[tuple[datetime, float]],
    spy_points: list[tuple[datetime, float]],
) -> MomentumWindow:
    symbol_pair = _window_pair(symbol_points, days)
    spy_pair = _window_pair(spy_points, days)
    if not symbol_pair or not spy_pair:
        return MomentumWindow(window=window, status="missing", message="Insufficient history for this window.")
    symbol_start, symbol_end = symbol_pair
    spy_start, spy_end = spy_pair
    symbol_return = _pct_return(symbol_start[1], symbol_end[1])
    spy_return = _pct_return(spy_start[1], spy_end[1])
    return MomentumWindow(
        window=window,
        status="available",
        symbol_return_pct=symbol_return,
        spy_return_pct=spy_return,
        alpha_vs_spy_pct=symbol_return - spy_return,
        start_price=symbol_start[1],
        end_price=symbol_end[1],
        spy_start_price=spy_start[1],
        spy_end_price=spy_end[1],
    )


def _window_pair(points: list[tuple[datetime, float]], days: int) -> tuple[tuple[datetime, float], tuple[datetime, float]] | None:
    if len(points) < 2:
        return None
    end = points[-1]
    target = end[0] - timedelta(days=days)
    candidates = [point for point in points if point[0] <= target]
    if not candidates:
        return None
    return candidates[-1], end


def _pct_return(start: float, end: float) -> float:
    return ((end - start) / start) * 100


def _summary(windows: list[MomentumWindow]) -> str | None:
    if not windows:
        return "No usable momentum windows are available."
    strongest = max(windows, key=lambda item: item.alpha_vs_spy_pct or 0)
    weakest = min(windows, key=lambda item: item.alpha_vs_spy_pct or 0)
    return (
        f"Best relative window {strongest.window}: {strongest.alpha_vs_spy_pct:.2f}% vs SPY. "
        f"Weakest relative window {weakest.window}: {weakest.alpha_vs_spy_pct:.2f}% vs SPY."
    )
