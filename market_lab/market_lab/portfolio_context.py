from __future__ import annotations

import json
from datetime import UTC, datetime
from pathlib import Path

from .models import PortfolioContext
from .schwab_portfolio import SchwabPortfolioClient
from .storage import default_cache_dir


class PortfolioContextService:
    def __init__(self, *, cache_dir: Path | str | None = None, schwab: SchwabPortfolioClient | None = None):
        self.cache_dir = Path(cache_dir).expanduser().resolve() if cache_dir else default_cache_dir() / "portfolio"
        self.schwab = schwab or SchwabPortfolioClient()

    @property
    def latest_path(self) -> Path:
        return self.cache_dir / "schwab-portfolio-latest.json"

    def latest(self) -> PortfolioContext:
        if not self.latest_path.exists():
            return PortfolioContext(
                status="unavailable",
                source="schwab",
                generated_at=datetime.now(UTC),
                message="No cached Schwab portfolio snapshot yet.",
            )
        try:
            return PortfolioContext.model_validate(json.loads(self.latest_path.read_text(encoding="utf-8")))
        except Exception as exc:
            return PortfolioContext(status="error", source="schwab", generated_at=datetime.now(UTC), message=str(exc))

    def refresh(self) -> PortfolioContext:
        context = self.schwab.fetch_context()
        context = self._add_overlap_notes(context)
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        context = context.model_copy(update={"artifact_path": str(self.latest_path)})
        self.latest_path.write_text(context.model_dump_json(indent=2), encoding="utf-8")
        return context

    def context_for_symbol(self, symbol: str) -> PortfolioContext:
        context = self.latest()
        return self._add_overlap_notes(context, symbol=symbol)

    def _add_overlap_notes(self, context: PortfolioContext, *, symbol: str | None = None) -> PortfolioContext:
        if context.status != "available":
            return context
        notes = list(context.overlap_notes)
        if symbol:
            normalized = symbol.strip().upper()
            owned = [item for item in context.positions if item.symbol == normalized]
            if owned:
                total_value = sum((item.market_value or 0.0) for item in owned)
                notes.append(f"{normalized} is already owned; current market value ${total_value:,.2f}.")
            else:
                notes.append(f"{normalized} is not currently in the cached Schwab portfolio.")
        exposure_notes = [
            f"{len(context.positions)} positions across {len(context.accounts)} account(s).",
        ]
        return context.model_copy(update={"overlap_notes": notes, "exposure_notes": exposure_notes})
