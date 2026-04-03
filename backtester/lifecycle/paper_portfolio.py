"""Paper-portfolio allocation and competition rules."""

from __future__ import annotations

from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from typing import Any

from lifecycle.trade_objects import ClosedPosition, OpenPosition, deterministic_key


DEFAULT_TOTAL_CAPITAL = 100_000.0
MAX_TOTAL_POSITIONS = 5
MAX_POSITIONS_PER_STRATEGY = 3
MAX_SINGLE_POSITION_FRACTION = 0.20
REENTRY_COOLDOWN_DAYS = 3.0


@dataclass(frozen=True)
class PaperPortfolioSnapshot:
    snapshot_id: str
    snapshot_at: str
    schema_version: str
    total_capital: float
    available_capital: float
    gross_exposure_pct: float
    pending_entry_count: int
    open_position_keys: list[str]
    blocked_candidates: list[dict[str, Any]]
    selected_candidates: list[dict[str, Any]]

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def select_entries(
    *,
    candidates: list[dict[str, Any]],
    open_positions: list[OpenPosition],
    closed_positions: list[ClosedPosition],
    snapshot_at: str,
    total_capital: float = DEFAULT_TOTAL_CAPITAL,
) -> tuple[list[dict[str, Any]], PaperPortfolioSnapshot]:
    snapshot_at = _normalize_timestamp(snapshot_at)
    available_capital = max(total_capital - _capital_in_use(open_positions), 0.0)
    blocked: list[dict[str, Any]] = []
    selected: list[dict[str, Any]] = []
    open_symbols = {position.symbol for position in open_positions}
    pending_symbols: set[str] = set()
    per_strategy_counts = _strategy_counts(open_positions)

    ordered_candidates = sorted(
        candidates,
        key=lambda item: (
            float(item.get("capital_fraction") or 0.0),
            float(item.get("trade_quality_score") or 0.0),
            float(item.get("effective_confidence") or 0.0),
        ),
        reverse=True,
    )

    for candidate in ordered_candidates:
        symbol = str(candidate.get("symbol") or "").strip().upper()
        strategy = str(candidate.get("strategy") or "").strip().lower()
        capital_fraction = float(candidate.get("capital_fraction") or 0.0)
        allocation = round(min(total_capital * capital_fraction, total_capital * MAX_SINGLE_POSITION_FRACTION), 2)
        block_reason = None

        if not symbol:
            block_reason = "missing_symbol"
        elif symbol in open_symbols or symbol in pending_symbols:
            block_reason = "duplicate_symbol"
        elif _recently_closed(symbol=symbol, closed_positions=closed_positions, snapshot_at=snapshot_at):
            block_reason = "reentry_cooldown"
        elif len(open_positions) + len(selected) >= MAX_TOTAL_POSITIONS:
            block_reason = "portfolio_capacity_reached"
        elif per_strategy_counts.get(strategy, 0) >= MAX_POSITIONS_PER_STRATEGY:
            block_reason = "strategy_cap_reached"
        elif allocation <= 0 or allocation > available_capital:
            block_reason = "insufficient_available_capital"

        if block_reason:
            blocked.append(
                {
                    "symbol": symbol,
                    "strategy": strategy,
                    "block_reason": block_reason,
                }
            )
            continue

        chosen = dict(candidate)
        chosen["capital_allocated"] = allocation
        selected.append(chosen)
        pending_symbols.add(symbol)
        per_strategy_counts[strategy] = per_strategy_counts.get(strategy, 0) + 1
        available_capital = round(max(available_capital - allocation, 0.0), 2)

    gross_exposure = _capital_in_use(open_positions) + sum(float(item.get("capital_allocated") or 0.0) for item in selected)
    snapshot = PaperPortfolioSnapshot(
        snapshot_id=deterministic_key("portfolio_snapshot", snapshot_at, len(selected), len(blocked)),
        snapshot_at=snapshot_at,
        schema_version="portfolio_snapshot.v1",
        total_capital=round(total_capital, 2),
        available_capital=round(available_capital, 2),
        gross_exposure_pct=round((gross_exposure / total_capital) * 100.0, 2) if total_capital > 0 else 0.0,
        pending_entry_count=len(selected),
        open_position_keys=[position.position_key for position in open_positions],
        blocked_candidates=blocked,
        selected_candidates=selected,
    )
    return selected, snapshot


def build_portfolio_snapshot_artifact(snapshot: PaperPortfolioSnapshot) -> dict[str, Any]:
    return {
        "artifact_family": "portfolio_state_snapshot",
        "schema_version": 1,
        "generated_at": snapshot.snapshot_at,
        "snapshot": snapshot.to_dict(),
    }


def _capital_in_use(positions: list[OpenPosition]) -> float:
    return round(sum(float(position.capital_allocated or 0.0) for position in positions), 2)


def _strategy_counts(positions: list[OpenPosition]) -> dict[str, int]:
    counts: dict[str, int] = {}
    for position in positions:
        counts[position.strategy] = counts.get(position.strategy, 0) + 1
    return counts


def _recently_closed(*, symbol: str, closed_positions: list[ClosedPosition], snapshot_at: str) -> bool:
    snapshot = datetime.fromisoformat(snapshot_at.replace("Z", "+00:00"))
    if snapshot.tzinfo is None:
        snapshot = snapshot.replace(tzinfo=timezone.utc)
    for position in reversed(closed_positions):
        if position.symbol != symbol:
            continue
        exited = datetime.fromisoformat(position.exited_at.replace("Z", "+00:00"))
        if exited.tzinfo is None:
            exited = exited.replace(tzinfo=timezone.utc)
        age_days = (snapshot.astimezone(timezone.utc) - exited.astimezone(timezone.utc)).total_seconds() / 86400.0
        return age_days < REENTRY_COOLDOWN_DAYS
    return False


def _normalize_timestamp(value: str) -> str:
    parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc).isoformat()
