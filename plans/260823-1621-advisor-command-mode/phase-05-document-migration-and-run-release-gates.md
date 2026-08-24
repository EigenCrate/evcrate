# Phase 05: Document Migration and Run Release Gates

## Context Links

- [Plan](./plan.md)
- [Phase 04 target rollout](./phase-04-roll-out-advisory-capabilities-to-generated-targets.md)
- [System architecture](../../docs/system-architecture.md)
- [Advisor distribution architecture](../../docs/advisor-distribution-architecture.md)
- [Commands guide](../../guide/COMMANDS.md)
- [Package scripts](../../package.json)

## Overview

- **Date:** 2026-08-23
- **Description:** Publish the breaking syntax/capability guide, synchronize architecture/help, and run focused plus full deterministic release gates.
- **Priority:** P1
- **Implementation status:** Completed — 2026-08-24
- **Review status:** Completed — 9.5/10; no critical issues
- **Estimate:** 3h

## Key Insights

- `@advisor` removal is a public command-input break even though it was recently shipped. Help, release notes, and examples must change together.
- Capability documentation must distinguish checkpoint counsel, inline interview, and Claude-only relay. “Generated file exists” is not support evidence.
- Full build/check is the only valid way to finalize generated targets; focused tests alone cannot prove parity or ownership.

## Requirements

1. State migration plainly: replace final `@advisor` with final `--advice`; old token is ordinary task/file text and never activates counsel. No deprecation alias/window.
2. Document `/advise` inline journey, exact final `--agent`, one-question flow, reframe confirmation, report location, cancellation/failure behavior, and Claude-only relay state retention.
3. Publish the target matrix with exact unsupported codes for Codex, Pi, Gemini, and Antigravity. Document first-class Codex checkpoint/inline support and frontier/high mapping.
4. Update examples for all scoped implementation commands and cross-command handoffs. Remove active `@advisor` examples while preserving historical Phase 01 records.
5. Document runtime state as temporary, sanitized, bounded, owner-only, untracked, seven-day pause/failure retention, and 24-hour completion tombstone.
6. Preserve the no-broker/MCP/launcher/provider-selector/quota/ledger/audit/approval-bypass boundary and generated-files-never-hand-edited guidance.

## Architecture

Documentation follows the same ownership path as code: architecture/PDR define contracts; migration/commands guide explains user behavior; help exposes discoverable syntax; changelog records the breaking change. Release gates validate canonical content, adapters, generated trees, and runtime tests in dependency order.

## Related Code Files

### Documentation/help modifications

- `/mnt/data/ws/sharing/evcrate/docs/system-architecture.md` and `/mnt/data/ws/sharing/evcrate/docs/advisor-distribution-architecture.md` — promote planned revision to active architecture and capability matrix.
- `/mnt/data/ws/sharing/evcrate/docs/advisor-supervision-migration.md` — create breaking syntax, interview, state, target behavior, rollback/troubleshooting guide.
- `/mnt/data/ws/sharing/evcrate/docs/codebase-summary.md` and `/mnt/data/ws/sharing/evcrate/docs/project-overview-pdr.md` — update shipped feature and requirements; `/mnt/data/ws/sharing/evcrate/docs/code-standards.md` only if adapter/source ownership rules need clarification.
- `/mnt/data/ws/sharing/evcrate/guide/COMMANDS.md`, `/mnt/data/ws/sharing/evcrate/README.md`, and `/mnt/data/ws/sharing/evcrate/CHANGELOG.md` — user syntax, examples, capability caveats, breaking release note.
- `/mnt/data/ws/sharing/evcrate/.evcrate/source/.claude/scripts/ev-help.py`, `scripts/test-evcrate-help.py`, and `commands/evcrate-help.md` — discoverable `/advise`, `--advice`, `--agent`, and old-token migration.

### Validation surfaces

- `/mnt/data/ws/sharing/evcrate/package.json` — reuse existing `test:python`, `test:pi`, `lint`, `distribute:build`, and `distribute:check`; add no new script unless repeated manual invocation proves necessary.
- `/mnt/data/ws/sharing/evcrate/tests/test_advisor_skill_distribution.py` and target-specific suites from Phases 02-04 — migration/help/docs/capability negative assertions.
- Generated `/mnt/data/ws/sharing/evcrate/.evcrate/source/{.codex,.agents,.pi,.gemini,.antigravity}/**` — inspect/test only after build; never hand-edit.

## Implementation Steps

1. Update architecture/PDR first from the accepted design and actual Phase 04 capability evidence. Remove stale claims that `@advisor` is active or that projection equals relay support.
2. Add one focused migration guide; update README, command guide, changelog, and help from it. Avoid duplicating full protocol internals on user surfaces.
3. Run state/canonical tests, adapter tests, Pi runtime tests, then full npm suites. Fix canonical/adapters/tests only.
4. Run `python3 distribute.py --build` twice, compare finalized trees/manifests, then `python3 distribute.py --check`.
5. Search authored and generated active surfaces for stale `@advisor`, silent `--agent` downgrade, unrendered capability markers, false support, and forbidden runtime markers. Historical plan/release migration mentions are allowed.
6. Run lint/whitespace checks and complete human/code review. Record exact commands/results; do not publish HOME or release without separate user authorization.

## Todo List

- [x] Active architecture and PDR match implemented capability evidence.
- [x] Migration guide, command guide, README, changelog, and help agree.
- [x] Old-token active examples removed; historical/migration references remain intentional.
- [x] Focused and full Python/Pi suites pass.
- [x] Repeated build is byte-identical; distribution check and forbidden-marker scans pass.
- [x] Final review confirms no generated hand edits, false capability claims, or scope expansion.

## Success Criteria

- A user can distinguish `--advice`, `/advise`, and `/advise --agent`; migrate from `@advisor`; find report/state behavior; and understand each harness capability from one guide/help query.
- Search finds no active alias or stale `[@advisor]` hint in canonical/generated implementation commands. Exact final old token is tested as ordinary work input.
- `node --test .evcrate/source/.claude/scripts/__tests__/advise-state.test.cjs` exits 0.
- Focused Python/Pi commands from Phase 04 exit 0; `npm run test:python`, `npm run test:pi`, and `npm run lint` exit 0.
- Two `python3 distribute.py --build` runs are byte-identical; `python3 distribute.py --check` exits 0.
- `git diff --check` exits 0; reviewer approves architecture, security, compatibility, and target capability claims.

## Risk Assessment

| Risk | Impact | Mitigation |
|---|---|---|
| Docs mix old/new semantics | Incorrect invocation | One migration source; tests/search all active surfaces |
| Full build rewrites unrelated targets | Large drift | Inspect manifest-owned diff; never patch generated outputs |
| Runtime tests pass but capability docs overclaim | Trust failure | Capability matrix derives only from Phase 04 gates |
| HOME publication changes user config | External state mutation | Build/check only; no publish without separate authorization |

## Security Considerations

- Migration/help examples contain no real state paths, secrets, credentials, or model reasoning.
- Validation runs without provider credentials/network model calls where existing suites support isolation.
- Do not publish to HOME, start provider services, or make release/PR/commit changes under this plan without explicit user authorization.
- Retain forbidden marker checks for `advisor_consult`, advisor MCP/broker/admission/launcher, provider selector, quota, ledger/audit, and approval bypass behavior.

## Next Steps

After all gates and code review pass, mark Phases 02-05 completed and update overall plan status. Release/publish/commit remains a separate user-authorized workflow.

## Unresolved Questions

None.
