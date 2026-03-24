# Dynamic Stock Discovery (X/Twitter ➜ CANSLIM Universe)

## How the sweep works

`trend_sweep.sh` runs a set of targeted X/Twitter searches with the `bird` CLI:

- `AI stocks` (15 posts)
- `trending stocks` (15 posts)
- `best stock to buy` (10 posts)
- `$NVDA OR $TSLA OR $AMD OR $PLTR OR $SMCI OR $ARM` (10 posts)
- `stock breakout` (10 posts)

Then it:

1. Extracts cashtags with regex (`$TICKER`)
2. Normalizes symbols to uppercase and filters common non-stock noise
3. Counts mentions per ticker
4. Merges with `backtester/data/dynamic_watchlist.json`
   - increments `mentions`
   - preserves `first_seen`
   - updates `last_seen`
5. Prunes symbols not seen in 7 days
6. Sorts tickers by mentions (descending)

Output file:

- `/Users/hd/Developer/cortana-external/backtester/data/dynamic_watchlist.json`

Auth behavior:

- the sweep uses `bird`
- by default it now points at the OpenClaw browser profile:
  - `~/.openclaw/browser/openclaw/user-data/Default`
- if `bird` auth is unavailable, the script now preserves the existing watchlist instead of overwriting it with `0` tickers
- if the saved auth file is stale, `trend_sweep.sh` reruns `sync_bird_auth.sh` automatically and retries once before giving up
- it will automatically source a private env file if present:
  - `~/.config/cortana/x-twitter-bird.env`
- `sync_bird_auth.sh` now prefers the live OpenClaw browser profile, starts OpenClaw if it is closed, validates the cookies with `bird check`, and cleans up stale lock state
- you can still run an explicit repair with:

```bash
cd /Users/hd/Developer/cortana-external
./tools/stock-discovery/sync_bird_auth.sh
```

## Suggested schedule (market hours ET)

Run twice daily:

- **10:00 AM ET**
- **2:00 PM ET**

## Example OpenClaw cron commands

```bash
openclaw cron create \
  --name "stock-trend-sweep-10am" \
  --schedule "0 10 * * 1-5" \
  --command "cd /Users/hd/Developer/cortana-external && ./tools/stock-discovery/trend_sweep.sh"

openclaw cron create \
  --name "stock-trend-sweep-2pm" \
  --schedule "0 14 * * 1-5" \
  --command "cd /Users/hd/Developer/cortana-external && ./tools/stock-discovery/trend_sweep.sh"
```

> If your OpenClaw build uses different cron subcommands/flags, run `openclaw cron --help` and adapt the same schedule/command payload.

## Manual run

```bash
cd /Users/hd/Developer/cortana-external
./tools/stock-discovery/trend_sweep.sh
cat backtester/data/dynamic_watchlist.json
```
