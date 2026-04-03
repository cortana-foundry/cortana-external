from __future__ import annotations

import argparse
import json
from datetime import UTC, datetime
from pathlib import Path

from operator_surfaces.ops_highway import build_ops_highway_plan


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Build the Ops Highway planning artifact.")
    parser.add_argument("--pretty", action="store_true", help="Pretty-print JSON.")
    parser.add_argument("--output", type=Path, help="Optional output path.")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    generated_at = datetime.now(UTC).isoformat()
    payload = build_ops_highway_plan(generated_at=generated_at)
    text = json.dumps(payload, indent=2 if args.pretty else None, sort_keys=args.pretty)
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(text + "\n", encoding="utf-8")
    print(text)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
