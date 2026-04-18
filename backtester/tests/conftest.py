from __future__ import annotations

import sys
from pathlib import Path


# Support the backtester's flat module layout when pytest is launched from the
# repo root as well as from /backtester under uv.
BACKTESTER_ROOT = Path(__file__).resolve().parents[1]
if str(BACKTESTER_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKTESTER_ROOT))
