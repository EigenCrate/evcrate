# Phase 02 — Migrate all maintained callers to explicit Node

## Context Links

- [Phase 01 approved baseline/contract](./phase-01-baseline-contract.md).
- [Architecture contract](./architecture-contract.md), [Darwin runtime contract](./darwin-runtime-contract.md).
- [Corrected caller inventory](./research/caller-inventory.md), [baseline research](./research/repository-baseline.md).
- [Acceptance matrix](./acceptance-matrix.md): N01, N02, N09, P02; behavioral proof follows Phase 03.
- [Canonical invocation workflow](../../.evcrate/source/.claude/workflows/advisor-mentoring.md), [code standards](../../docs/code-standards.md).

## Overview

- Date: 2026-10-03. Priority: P1. Implementation: complete. Review: complete.
- Dependency: Phase 01 owner-approved snapshot and architecture proposal.
- Outcome: one launch mechanism across canonical instructions, runnable consult scripts and test helpers, with parent-owned coherent interim regeneration.
- No new invoker or production controller logic required merely to change callers. All gates described here are future work; workers skip build/test/lint/formatters.

## Key Insights

- Canonical authoring is `.evcrate/source/.claude/`, not target projections or root installed harness resources.
- Workflow launch policy, operation table and **ten** runnable Bash lifecycle examples currently prescribe direct execution. Skill line 31 and brief-contract line 25 repeat it.
- Brief-contract migration changes generated mentor instructions/digest/build identity even though request schemas do not change.
- E02 and E03 each launch init, checkpoint, inference, get: **eight direct calls total**. Their historical plugin payloads, replay guards, timeout and evidence snapshots stay intact; do not run either script.
- Health is already Node-driven; no unnecessary production rewrite or Bun feature expansion. Preserve diagnostic package-root cwd.
- README presently documents routing/advice, not a direct advisor invocation. Add a concise Node-only usage note without duplicating the canonical lifecycle payloads.

## Requirements

- Node executable plus absolute installed script argv for every maintained launch, independent of host. Empty inference argv becomes `[controller]`, not omission of the script.
- Retain operation arguments, exact UTF-8 stdin/EOF, inherited environment/cwd where currently intended, byte limits, cancellation and response settlement.
- Keep explicit-HOME failure and native absent-HOME authority; never silently resolve relative/empty HOME through another home or project search.
- No direct POSIX branch, shebang retry, alternative interpreter, `shell: true`, `.cmd` advisor shim, renamed entrypoint, `--file`, provider retry change or generic launcher framework.
- Existing Node-parent tests, controller/shebang/bin metadata, execute-bit rules and tool-less counsel boundary remain intact.
- Permanent tests must exercise behavior, not source text, mocked argv forwarding or echo-only scripts. One-time caller/projection audit is sufficient for instructional wording.

## Architecture

Replace launch selection only:

```js
// Existing known Node-parent caller; bin is validated absolute HOME-owned path.
spawnSync(process.execPath, [bin, ...operationArgs], existingOptions);
```

- State: `[bin, 'state', op]`; history: `[bin, 'history', op]`; inference/diagnostic: `[bin]` with unchanged operation-specific JSON.
- Bash: `node "$controller" ...` with validated absolute HOME-owned path; shell quoting handles spaces/non-ASCII. PowerShell retains quoted path and BOM-free UTF-8 restoration in `finally`.
- Node workflow example applies to **known Node parents on all hosts**, not Windows-only. A Bun-hosted tool must resolve actual supported Node explicitly; its own `process.execPath` is not Node by definition.
- Validate HOME before constructing a purported absolute controller path using existing policy. For development test sources, keep explicit fixture-only repository path; production instructions use HOME.
- No cross-platform launcher selector needed in programmatic Node callers. Platform-specific state/process/human internals stay behind current runtime boundaries.

Parallel ownership within phase:

| Unit | Exclusive edits | Integration contract |
|---|---|---|
| Canonical instructions | Workflow, advisor skill, brief-contract, README | Single instruction author owns these shared texts; schemas/payloads unchanged |
| Retained script transport | Both consult scripts | All eight calls; preserve inherited cwd/env and historical content; never execute |
| Test launch helpers | Controller, mentor-brief, retry-orchestration, smoke-30s | Remove executable-selection branches only; retain legitimate Windows signal/IPC handling |
| Parent integration owner | Generated brief/runtime/inventory/projections/manifests and phase-end gates | Wait for all workers; approve snapshot-owned generator writes; no sibling generation |

## Related Code Files

| Classification | Exact repository paths / change |
|---|---|
| Modify | `.evcrate/source/.claude/workflows/advisor-mentoring.md`: invocation policy/table, ten Bash examples, Node-parent/harness clarification |
| Modify | `.evcrate/source/.claude/skills/advisor-strategy/SKILL.md:31`: Node-only wording, retain tool-less boundary |
| Modify | `.evcrate/source/.claude/skills/advisor-strategy/references/brief-contract.md:25`: Node-only wording, unchanged 14-field checkpoint |
| Modify | `README.md` Advisor checkpoint section: concise explicit-Node note/canonical workflow pointer |
| Modify | `scripts/consult-advisor-phase-e02.mjs`: launches originally at 76/194/207/222 |
| Modify | `scripts/consult-advisor-phase-e03.mjs`: launches originally at 76/207/220/235 |
| Modify | `tests/advisor-controller/controller.test.cjs`: `spawnController` and `run` |
| Modify | `tests/advisor-controller/mentor-brief.test.cjs`: failure/success entrypoint launch selection |
| Modify | `tests/advisor-controller/retry-orchestration.test.cjs`: real-entrypoint smoke launch selection |
| Modify | `tests/advisor-controller/smoke-30s.cjs`: direct controller spawn |
| Verify-only normally | `src/cli/health.ts`, `src/cli/process-runner.ts`, `src/cli/dispatch.ts`, `src/cli/evcrate.ts`, `src/cli/types.ts`, `tests/cli/health.test.mjs` |
| Verify-only launch pattern | `tests/advisor-controller/state-cli.test.cjs`, `tests/advisor-controller/history-cli.test.cjs`, `tests/advisor-controller/verification-lifecycle.test.cjs`, `tests/adapters/phase08-mentoring-integration.test.mjs`, `tests/advisor-metrics/history-metrics.test.mjs` |
| Verify-only metadata | `package.json`, `.evcrate/source/.evcrate/bin/evcrate-advisor`, `install.sh`, `install.ps1`, `scripts/fix-executable-permissions.sh` |
| Verify-only canonical pointers | All 16 `.evcrate/source/.claude/commands/` paths enumerated in [caller inventory](./research/caller-inventory.md); `.evcrate/source/.claude/agents/advisor.md` |
| Generated, parent-only | `.evcrate/source/.evcrate/bin/lib/advisor/runtime-brief.generated.cjs`, `.evcrate/source/.evcrate/bin/lib/advisor/generated/`, `src/manifests/controller-inventory.generated.ts`, `dist/` |
| Generated, parent-only | Manifest-declared projection roots under `.evcrate/source/` and `.evcrate/build-manifest*.json`; actual Phase 01 target manifests govern selection. Target manifests and `.evcrate/targets/*/files/` overlays remain authored inputs, not generator-owned outputs |
| Create, proposed receipt | `plans/261003-1527-advisor-node-only-launch/reports/phase-02-callers.md`: migrated dispositions and interim gate outcomes |

## Implementation Steps

1. Parent supplies the approved isolated snapshot, target set and generator ownership from Phase 01. Resolve any intervening dirty-source changes before edits; do not let generators consume unexplained source drift.
2. Canonical author replaces platform-dependent executable selection with the common Node tuple. Retain shell-specific instructions and PowerShell 5.1 UTF-8 encoding restoration. Preserve invalid-explicit-HOME failure and absent-HOME Windows fallback.
3. Migrate workflow table and all ten Bash examples: init, checkpoint, inference, get, two dispositions, two outcomes, complete and the indented human-decision command. Keep request JSON bodies, UUID examples, expected revisions and operation argv unchanged. Tell Bash users to validate HOME and quote the absolute script; do not make POSIX missing HOME default to a profile.
4. Rewrite `SKILL.md:31` and `brief-contract.md:25`; say Node on every supported host, not direct POSIX versus Node Windows. Retain tool-less skill/counsel ownership and JSON/envelope contract. Update the Node caller section to all known Node parents; explicitly distinguish Bun-hosted harnesses.
5. README author adds one short usage statement such as `node "$HOME/.evcrate/bin/evcrate-advisor" state <operation>` with exact JSON supplied on stdin, valid absolute HOME prerequisite, and canonical workflow link. `<operation>` is explanatory syntax, not a runnable full request. Migrate any additional maintained launch examples found by the one-time audit; dated changelog/archived evidence and sealed plans are excluded.
6. Script worker changes **all four calls in each consult file** to `process.execPath` plus script argv. Retain JSON input, encoding, timeout, result handling and inherited cwd/env. Check valid absolute HOME using existing policy before path construction; do not change historical payloads, fake recorded checks, replay guard or output snapshots. No invocation of these scripts for validation.
7. Test worker makes both controller helpers, mentor-brief launches, retry smoke and 30-second smoke explicitly Node-driven. Preserve Windows-only IPC signal simulation, real POSIX signals, detached provider behavior and timeout expectations; only launcher-selection branches are obsolete.
8. Review already-Node health and test boundaries as verify-only. `runtime.execPath` represents the injected Node executable in this Node CLI; do not redesign it for hypothetical Bun parents. Preserve health `context.packageRoot` cwd, HOME/EVCRATE_HOME/state env, strict response decoding and bounded process runner.
9. One-time source audit checks all maintained launch sites and canonical references, including all 16 command consumers; no permanent string-matching test. Account for fixture-only repository controller paths versus production HOME-owned paths, and confirm no new outer invoker/alias/protocol was introduced.
10. All workers stop edits. **Parent alone** runs the coherent interim generation batch from approved snapshot root:

    ```bash
    npm run build
    npm run distribute:build
    ```

    `build` automatically runs prebuild brief/runtime/inventory generators; do not redundantly run them in workers. `distribute:build` is build-only projection generation, not `distribute`, `distribute:all` or HOME publication. Preserve user work through snapshot isolation.
11. Once the generated batch is coherent, parent runs future `npm run distribute:check` and `npm run release:check` when the approved snapshot's prerequisites expect green. If an unrelated baseline failure blocks them, record exact blocker rather than fixing user work or calling them passed; focused source behavior can still be investigated, but projection/closure acceptance stays pending.
12. Parent records build/check exits, target-specific projection audit, generated brief/build identity and caller dispositions. Do not call pre-generation stale projections a regression in launcher behavior, or call the interim batch the final candidate. Hand source + coherent generated batch to Phase 03; Phase 06 regenerates/checks the final Darwin-integrated bundle.

## Todo List

- [x] Migrate workflow, both skill clauses and maintained README examples.
- [x] Migrate all eight consult calls without running or rewriting historical content.
- [x] Migrate every direct/conditional test launcher; keep valid OS internals.
- [x] Retain already-Node health, bin/shebang and execute metadata.
- [x] Parent regenerate once after worker barrier and record truthful interim outcomes.

## Success Criteria

- N01/N09: every maintained caller/instruction names actual Node plus script; no direct-exec platform branch/fallback, Bun execPath assumption or extra invoker.
- N02 interface: operation argv, request bytes, cwd/HOME and response policy preserved for subsequent behavioral proof.
- All eight consult calls accounted for; no historical payload/snapshot changed or script executed.
- P02: canonical change reaches the manifest-configured eight targets via generator-owned output, including regenerated brief identity; no hand-edited projections.
- Existing health runtime remains Node-driven with diagnostic package-root cwd; unrelated control-plane launch/install policy is intact.
- Parent receipt distinguishes source audit/build/projection evidence from not-yet-run installed runtime qualification.

## Risk Assessment

- Brief text change invalidates digest/build identity: regenerate at parent barrier, then use the coherent identity in all later tests.
- Stale generated projections trigger misleading adapter failures: run generation before phase-end projection checks; label earlier failures accurately.
- Overbroad branch removal damages Windows signals: remove only executable selection, not IPC/console/provider process handling.
- Historical scripts accidentally mutate HOME or revive plugin: transport-only edit, never execute; preserve guards/payloads.

## Security Considerations

- Request JSON stays stdin, never command interpolation; shell-free programmatic argv and shell-appropriate quoting.
- No fallback when selected Node/script fails; launch errors cannot fabricate advice or satisfy gates.
- No project-local controller search, profile fallback for invalid HOME or production-HOME publication during qualification.
- Preserve native process containment/cleanup and existing routing/retry invariants; portability does not justify loosening them.

## Next Steps

Proceed to [Phase 03 — Linux launch verification](./phase-03-linux-launch-verification.md). This phase has not qualified Windows or Darwin; final regeneration/package identity remains Phase 06.

## Unresolved Questions

None for launcher scope. Any snapshot/projection prerequisite failure needs parent-owned disposition before its acceptance gate can close; missing future platform hosts do not narrow the migration.
