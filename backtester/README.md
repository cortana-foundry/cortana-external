# Backtester — CANSLIM Trading Advisor

A Python-based backtesting engine and trading advisor implementing the CANSLIM strategy.

## Quick Start

```bash
cd ~/Developer/cortana-external/backtester
source venv/bin/activate

# Check market status
python advisor.py --market

# Analyze a specific stock
python advisor.py --symbol NVDA

# Quick scan for opportunities (watchlist)
python advisor.py --quick

# Telegram-ready CANSLIM alert summary
python canslim_alert.py --limit 8 --min-score 6

# Run a backtest
python main.py --symbol AAPL --years 2 --compare
```

## Project Structure

```
backtester/
├── advisor.py          # Main trading advisor (recommendations)
├── canslim_alert.py    # Daily CANSLIM alert formatter (Telegram-ready)
├── main.py             # Backtest runner
├── backtest.py         # Core backtesting engine
├── metrics.py          # Performance calculations (Sharpe, Sortino, etc.)
├── indicators.py       # Technical indicators (SMA, RSI, MACD, etc.)
├── config.py           # Alpaca API configuration
├── requirements.txt    # Python dependencies
│
├── data/
│   ├── fetcher.py      # Alpaca price data
│   ├── fundamentals.py # Yahoo Finance fundamentals (yfinance)
│   ├── universe.py     # Stock screening/filtering
│   ├── market_regime.py # M factor (distribution days, trend)
│   └── cache/          # Cached data
│
└── strategies/
    ├── base.py         # Abstract Strategy class
    ├── momentum.py     # Momentum strategies
    └── canslim.py      # CANSLIM implementation
```

## CANSLIM Factors

| Factor | Name | Source | Implementation |
|--------|------|--------|----------------|
| C | Current Earnings | yfinance | `fundamentals.py` |
| A | Annual Earnings | yfinance | `fundamentals.py` |
| N | New High | Price data | `canslim.py` |
| S | Supply/Demand | Float + Volume | `fundamentals.py` + `canslim.py` |
| L | Leader | Price momentum | `canslim.py` |
| I | Institutional | yfinance | `fundamentals.py` |
| M | Market Direction | SPY analysis | `market_regime.py` |

## Scoring

- Each factor: 0-2 points
- Total: 0-12 points
- Buy threshold: >= 7 points (configurable)
- M factor acts as a GATE (no buys in correction)

## Market Regimes

| Regime | Position Sizing | Action |
|--------|-----------------|--------|
| Confirmed Uptrend | 100% | Full buying |
| Uptrend Under Pressure | 50% | Reduced exposure |
| Rally Attempt | 50% | Cautious buying |
| Correction | 0% | No new buys |

## Example Output

```
📊 Analyzing NVDA
   Price: $182.81
   Total Score: 5/12

   Fundamental: C=2 A=2 I=1 S=0
   Technical:   N=0 L=0 S=0

   Recommendation: NO_BUY
   Reason: Score too low (5/12). Need >= 7.
```

## Strategies

### MomentumStrategy
- Uses MA crossovers + RSI
- 8% trailing stop
- Three variants: Standard, Aggressive, Conservative

### CANSLIMStrategy
- Full CANSLIM with fundamentals
- Requires `set_symbol()` before running
- Uses market regime gate

### CANSLIMLite
- Technical factors only (N, L, S, M)
- No fundamental data needed
- Faster backtesting

## API Keys

Alpaca keys stored at: `~/Developer/cortana-external/backtester/alpaca_keys.json`

```json
{
  "key_id": "YOUR_KEY",
  "secret_key": "YOUR_SECRET",
  "base_url": "https://paper-api.alpaca.markets/v2",
  "data_url": "https://data.alpaca.markets"
}
```

## FRED HY Spread Reliability (Dip Buyer)

Dip Buyer reads HY spreads from FRED (`BAMLH0A0HYM2`).

Recommended env vars:

```bash
export FRED_API_KEY=your_key_here            # recommended (reduces unauthenticated limits)
export RISK_FRED_RETRIES=3                   # default: 3
export RISK_FRED_TIMEOUT_SECONDS=12          # default: 12
export RISK_FRED_BACKOFF_SECONDS=1.5         # default: 1.5
```

If FRED fails after retries, the system now reports fallback explicitly:
- HY source becomes `fallback_default_450`
- alert includes fallback impact note (`neutral-credit assumption`)
- credit gate behavior remains strict; this only prevents silent ambiguity.

## Dependencies

```bash
pip install -r requirements.txt
```

Key packages:
- `pandas` — Data manipulation
- `numpy` — Numerical operations
- `yfinance` — Yahoo Finance data
- `requests` — HTTP for Alpaca API

## Development

```bash
# Activate venv
source venv/bin/activate

# Run tests
python data/fundamentals.py
python data/market_regime.py
python strategies/canslim.py

# Full backtest
python main.py --symbol AAPL --years 2 --strategy momentum
```

## Phase Status (per PRD)

- [x] Phase 1: Portfolio Intelligence (Alpaca read access)
- [x] Phase 2: Strategy Engine + Backtesting
  - [x] Backtesting framework
  - [x] Momentum strategies
  - [x] CANSLIM implementation
  - [x] Universe screening
  - [x] Market regime detection (M factor)
  - [x] Fundamental data (yfinance)
  - [ ] Genetic optimization (TODO)
- [ ] Phase 3: Trade Recommendations (in progress)
  - [x] Trade signal generation
  - [x] Position sizing based on regime
  - [x] Telegram alerts integration (via `canslim_alert.py` + OpenClaw cron)
  - [ ] Trade tracking (/executed, /declined)
- [ ] Phase 4: Automated Execution (future, optional)

---

*Built by Cortana for Hamel*
