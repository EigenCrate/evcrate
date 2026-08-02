#!/usr/bin/env python3
"""Command entrypoint for local build and HOME publication gates."""

from __future__ import annotations

import argparse
import sys

from distribution.context import create_context
from distribution.contracts import DistributionAction, DistributionError
from distribution.gates import run_all, run_home_publish, run_local_build, run_local_check, verified_local_artifact


def parse_args(argv: list[str]) -> DistributionAction:
    parser = argparse.ArgumentParser(description="Build and publish DevKit artifacts.")
    actions = parser.add_mutually_exclusive_group()
    actions.add_argument("--build", action="store_true", help="Generate local artifacts only.")
    actions.add_argument("--check", action="store_true", help="Verify local artifacts without writing.")
    actions.add_argument("--publish", action="store_true", help="Publish existing local artifacts to HOME.")
    actions.add_argument("--all", action="store_true", help="Build local artifacts, then publish them.")
    args = parser.parse_args(argv)
    if args.build:
        return DistributionAction.BUILD
    if args.check:
        return DistributionAction.CHECK
    if args.publish:
        return DistributionAction.PUBLISH
    if args.all:
        return DistributionAction.ALL
    print("WARNING: bare distribute.py is deprecated; use --all.", file=sys.stderr)
    return DistributionAction.ALL


def main(argv: list[str] | None = None) -> int:
    action = parse_args(sys.argv[1:] if argv is None else argv)
    try:
        if action is DistributionAction.BUILD:
            run_local_build()
        elif action is DistributionAction.CHECK:
            run_local_check()
        elif action is DistributionAction.PUBLISH:
            context = create_context(action)
            run_home_publish(context, verified_local_artifact(context))
        else:
            run_all()
    except DistributionError as error:
        print(f"Distribution failed: {error}", file=sys.stderr)
        return error.exit_code
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
