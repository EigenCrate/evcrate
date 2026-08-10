#!/usr/bin/env python3
"""Command entrypoint for local build and HOME publication gates."""

from __future__ import annotations

import argparse
import sys
from dataclasses import dataclass

from distribution.context import create_context
from distribution.contracts import DistributionAction, DistributionError
from distribution.gates import run_all, run_home_publish, run_home_recovery, run_local_build, run_local_check, verified_local_artifact
from distribution.manifest import load_target_registry


@dataclass(frozen=True)
class DistributionInvocation:
    action: DistributionAction
    selected_targets: tuple[str, ...]


def parse_invocation(argv: list[str]) -> DistributionInvocation:
    parser = argparse.ArgumentParser(description="Build and publish EVCrate artifacts.")
    actions = parser.add_mutually_exclusive_group()
    actions.add_argument("--build", action="store_true", help="Generate local artifacts only.")
    actions.add_argument("--check", action="store_true", help="Verify local artifacts without writing.")
    actions.add_argument("--publish", action="store_true", help="Publish existing local artifacts to HOME.")
    actions.add_argument("--all", action="store_true", help="Build local artifacts, then publish them.")
    actions.add_argument("--recover", action="store_true", help="Recover an interrupted HOME publication.")
    parser.add_argument("--target", action="append", default=[], help="Build and publish one registered target.")
    parser.add_argument("--dry-run", action="store_true", help="Print the HOME publication diff without writing.")
    parser.add_argument("--json", action="store_true", help="Render dry-run publication output as JSON.")
    args = parser.parse_args(argv)
    if len(args.target) > 1:
        parser.error("--target may be specified only once")
    registry = load_target_registry(create_context(DistributionAction.BUILD).repository / ".evcrate/targets/manifest.json")
    if args.target and args.target[0] not in registry.targets:
        parser.error(f"unknown distribution target: {args.target[0]}")
    if (args.dry_run or args.json) and not args.publish:
        parser.error("--dry-run and --json require --publish")
    if args.json and not args.dry_run:
        parser.error("--json requires --dry-run")
    if args.build:
        action = DistributionAction.BUILD
    elif args.check:
        action = DistributionAction.CHECK
    elif args.publish:
        action = DistributionAction.PUBLISH
    elif args.all:
        action = DistributionAction.ALL
    elif args.recover:
        action = DistributionAction.RECOVER
    else:
        print("WARNING: bare distribute.py is deprecated; use --all.", file=sys.stderr)
        action = DistributionAction.ALL
    return DistributionInvocation(action, tuple(args.target))


def parse_args(argv: list[str]) -> DistributionAction:
    """Compatibility action parser; use ``parse_invocation`` for target selection."""

    return parse_invocation(argv).action


def main(argv: list[str] | None = None) -> int:
    command_args = sys.argv[1:] if argv is None else argv
    try:
        invocation = parse_invocation(command_args)
        action, selected_targets = invocation.action, invocation.selected_targets
        if action is DistributionAction.BUILD:
            run_local_build(selected_targets)
        elif action is DistributionAction.CHECK:
            run_local_check(selected_targets)
        elif action is DistributionAction.PUBLISH:
            context = create_context(action, selected_targets=selected_targets)
            changes = run_home_publish(context, verified_local_artifact(context), dry_run="--dry-run" in command_args)
            if "--dry-run" in command_args:
                if "--json" in command_args:
                    import json
                    print(json.dumps([change.__dict__ for change in changes], sort_keys=True))
                else:
                    for change in changes:
                        print(f"{change.action:8} {change.root}/{change.path}")
        elif action is DistributionAction.RECOVER:
            run_home_recovery(create_context(action, selected_targets=selected_targets))
        else:
            run_all(selected_targets)
    except DistributionError as error:
        print(f"Distribution failed: {error}", file=sys.stderr)
        return error.exit_code
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
