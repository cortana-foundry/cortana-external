"""Guards for keeping test doubles out of operator artifacts."""

from __future__ import annotations

import json
import re
from typing import Any

MOCK_ARTIFACT_PATTERN = re.compile(r"MagicMock|<MagicMock|\[object MagicMock\]")


def looks_like_mock_artifact(value: Any) -> bool:
    try:
        serialized = json.dumps(value, default=str)
    except (TypeError, ValueError):
        serialized = str(value)
    return bool(MOCK_ARTIFACT_PATTERN.search(serialized))
