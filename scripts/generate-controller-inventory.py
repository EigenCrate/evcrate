"""Generate the packaged TypeScript controller inventory from Python authority."""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from distribution.advisor_controller import ADVISOR_CONTROLLER_FILES, NODE_BUILTINS

OUTPUT = ROOT / "src" / "manifests" / "controller-inventory.generated.ts"


def main() -> None:
    entries = json.dumps(list(ADVISOR_CONTROLLER_FILES), ensure_ascii=False, indent=2)
    builtins = json.dumps(sorted(NODE_BUILTINS), ensure_ascii=False, indent=2)
    OUTPUT.write_text(
        "// Generated from distribution/advisor_controller.py; do not edit.\n"
        f"export const ADVISOR_CONTROLLER_FILES = Object.freeze({entries} as const);\n"
        f"export const ADVISOR_CONTROLLER_NODE_BUILTINS = Object.freeze({builtins} as const);\n",
        encoding="utf-8",
    )


if __name__ == "__main__":
    main()
