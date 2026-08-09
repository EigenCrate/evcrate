# Phase 05 — Integration, Safety, and Release Gates

## Context

- [Plan](./plan.md)
- [Phase 04](./phase-04-hooks-and-settings.md)

## Overview

- **Priority:** P1
- **Status:** DONE (isolated validation 260809) — live cutover remains excluded.
- **Goal:** prove native Pi behavior and distribution safety end to end before touching the user's live Pi configuration.
- **Effort:** 6–10h

## Validation matrix

### Deterministic build

- Fresh build from empty same-volume stage.
- Second build produces no source/output hash change.
- Check mode performs no writes and detects command/agent/skill/hook/extension drift.
- Existing Claude/Codex/agents/Gemini/Antigravity artifact hashes remain stable except intentional shared source compatibility edits.

### Temporary HOME publication

Use two separate fixtures: (1) publish into isolated `EVCRATE_HOME`/`EVCRATE_STATE_HOME`/`HOME` and run Pi at default `~/.pi/agent`; (2) for runtime only, copy the verified generated agent resources and `.evcrate.json` into an unrelated agentDir/parent and set `PI_CODING_AGENT_DIR`. The publisher never treats `PI_CODING_AGENT_DIR` as a HOME destination.

- Empty HOME settings creation.
- Populated settings preservation with unrelated package objects and unknown keys.
- Dry-run accuracy and no mutation.
- Idempotent second publish.
- Stale managed Pi file deletion without deleting user files.
- Symlinked root/ancestor/settings rejection.
- Concurrent HOME/session/package mutation after candidate creation aborts before promotion.
- Interrupted publication rollback and recovery marker correctness.
- `pi-code` conflict reporting.

### Native runtime

- Start exact Pi 0.84.1 with the generated `.pi` root and verified exact package pins/cache in an isolated HOME; report wider 0.84.x compatibility separately.
- Confirm command catalog includes representative root/nested commands (`/plan`, `/fix:fast`, `/cook:auto:fast`).
- Confirm generated `.pi` skills load when invoked with `--no-skills --skill <pi-skills>`.
- Confirm generated agents are discoverable by `pi-subagents`.
- Mock/record OpenAI role routing and unknown-provider parent inheritance without paid model calls where possible.
- Prove `evcrate_subagent` structured requests reach terminal execution responses against `pi-subagents@0.44.0`; prove legacy package direct execution is rejected and parent-owned result/test/review acceptance remains a separate gate.
- Exercise privacy block, broad-search block, prompt reminder, post-write modularization, and compact/session context.
- Confirm no `pi-code`, Claude model ID, hook package, or dynamic-workflow package is loaded.

## Related files

### Create/modify

- `tests/test_distribution_pi.py` — end-to-end build/check/publish fixtures.
- `tests/test_distribution_cli.py` — Pi target/dry-run/conflict JSON output assertions.
- `.evcrate/targets/pi/tests/runtime-integration.test.mjs` — package/extension mock integration where deterministic.
- `package.json` — final `test:python`, `test:pi`, aggregate test scripts, Node `>=22.19`, and package `files` entries for `distribution/`, Pi target, migrator, adapter helpers, and required sources.
- CI/release workflow — align Node with the Pi runtime baseline if needed.

## Implementation steps

1. Add a fixture builder for canonical mini-trees and populated Pi settings.
2. Add end-to-end target generation/inventory assertions against the real canonical tree.
3. Add shared-settings publish/recovery scenarios to the standard distribution test suite.
4. Update package inclusion before runtime validation; run `npm pack --dry-run` to inspect the file list, then `npm pack --pack-destination <tmp>` and install/test that actual tarball in isolation. Verify pinned dependency tarball/integrity metadata.
5. Run Node extension tests under Node >=22.19 and exact Pi 0.84.1.
6. Run native Pi startup first with default agent root, then with an unrelated `PI_CODING_AGENT_DIR`; capture command/agent/hook diagnostics without exposing credentials.
7. Run full Python/Node/tarball gates, build, check, temporary-HOME dry-run, publish, second publish, and check again.
8. Request code review focused on shared settings ownership, path containment, shell execution, event correlation, model/provider boundaries, hooks, and rollback.
9. Fix all blocking findings and rerun the complete gate before Phase 06.

## Required commands

```bash
python3 -m unittest discover -s tests -p 'test_*.py'
npm run test:pi
npm pack --dry-run
npm pack --pack-destination "$tmp_pack"
python3 distribute.py --build
python3 distribute.py --check
EVCRATE_HOME=<tmp-home> EVCRATE_STATE_HOME=<tmp-state> python3 distribute.py --publish --dry-run --json
EVCRATE_HOME=<tmp-home> EVCRATE_STATE_HOME=<tmp-state> python3 distribute.py --publish
EVCRATE_HOME=<tmp-home> EVCRATE_STATE_HOME=<tmp-state> python3 distribute.py --publish --dry-run --json
```

Run native smoke twice: default `HOME/.pi/agent`, then a runtime-only copied `PI_CODING_AGENT_DIR=<other-agent-dir>` with `.evcrate.json` in its parent. Use `--no-skills --skill <agent-dir>/skills`, offline mode after cache preparation, and never point either run at live `~/.pi`.

## Success criteria

- All deterministic and safety gates pass with evidence.
- No live HOME mutation occurred.
- Dry-run accurately distinguishes managed file changes from shared settings merges/conflicts; a simulated concurrent session write aborts rather than being overwritten.
- Native Pi loads representative resources, nested command dispatch, structured delegation, and safety hooks under both config-root modes.
- The npm tarball contains every distribution/adapter/target/runtime file required to reproduce the build.
- Code review has no unresolved high/critical findings.

## Risks and controls

- **Network/package flakiness:** unit and publication gates are offline; package installation smoke is isolated and separately reported.
- **Credential leakage:** do not dump environment/settings; use provider-free mocks or existing authenticated registry metadata only.
- **False completion:** retain command outputs and review report under this plan's `reports/` directory.
