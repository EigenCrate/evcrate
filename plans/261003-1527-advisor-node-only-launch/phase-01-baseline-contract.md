# Phase 01 — Baseline and launch contract

## Context Links

- [Launch architecture contract](./architecture-contract.md) — common invocation authority.
- [Darwin runtime contract](./darwin-runtime-contract.md) — approved internal native build-only boundary.
- [Repository baseline](./research/repository-baseline.md) and [corrected caller inventory](./research/caller-inventory.md).
- [Platform qualification research](./research/platform-qualification.md).
- [Acceptance matrix](./acceptance-matrix.md): N01/N09 caller contract; P02 target authority; later runtime/platform rows remain future gates.
- [Architecture authority](../../docs/system-architecture.md), [code standards](../../docs/code-standards.md).
- [Canonical development rules](../../.evcrate/source/.claude/workflows/development-rules.md).

## Overview

- Date: 2026-10-03. Priority: P1. Implementation: complete. Review: pending parent approval.
- Dependency: none; owner approval of coherent source snapshot is an implementation entry gate.
- Outcome: an approved source identity, exact migration inventory, and architecture-first proposed contract. No runtime cutover in this phase.
- Planning does not initialize controller state, publish, build, test, format, or commit. All commands below are future implementation steps.

## Key Insights

- Recorded dirty baseline: 48 modified / 32 untracked entries, including user-owned registry, target and VSCode work. Counts are historical observations, not a freshness check.
- Current `.evcrate/targets/manifest.json` declares **eight** targets: antigravity, claude, codex, copilot, gemini, omp, pi, vscode. Existing seven-target prose cannot override this manifest.
- `src/cli/health.ts` already uses a Node executable and script argv under the supported Node CLI. Diagnostic cwd is deliberately package root.
- Two overlooked canonical instructions require migration: advisor-strategy `SKILL.md:31` and `references/brief-contract.md:25`. The latter changes the generated mentor brief/build identity.
- Both consult scripts retain runnable transports: four direct calls each, including E02 state-get. Historical payloads and sealed snapshots remain unchanged.
- Explicit Node transport does not remove OS-specific filesystem/process internals or enable Darwin by itself.

## Requirements

- Approve a coherent copy of needed tracked **and untracked** source; preserve unrelated dirty work. No reset, stash, staging, cleanup, or commit of user work.
- Record branch/commit plus canonical relative-path file kind, size and SHA-256 inventory; commit alone cannot identify uncommitted source.
- Define maintained callers and canonical authoring roots before edits. Record generated outputs separately from handwritten source.
- Keep entrypoint name, Node shebang, npm bin mapping, controller protocols, routing/retry policy and shared execute-bit policy.
- One Node launch everywhere. No direct-exec retry, shell fallback, `.cmd` advisor shim, outer invoker, `--file` API, rename or generic platform framework.
- Declare future evidence labels: Linux launch proof, later final Linux bundle proof, native Windows proof, macOS implementation-present only with real assets/integration and always untested/unqualified.

## Architecture

Invocation tuple:

```text
executable: supported Node (package engine >=22.19.0)
argv: [absolute HOME-owned .evcrate/bin/evcrate-advisor, ...operationArgs]
stdin: exact UTF-8 request JSON, then EOF
cwd: canonical project for state/history/inference; packageRoot for health diagnostics
```

- Known Node-parent caller: `process.execPath`. Shell/harness caller: configured or available supported `node`, selected once; no alternate executable after failure.
- Bun-hosted harness: `process.execPath` may be Bun; select actual Node explicitly. Do not add Bun support to the Node-only control-plane CLI.
- Explicit HOME present but empty/relative/unsafe fails existing policy. Never use `HOME || os.homedir()`; Windows native-profile fallback is allowed only when HOME is absent. Do not widen POSIX missing-HOME behavior.
- Use native absolute paths and argv arrays with `shell: false`; no unexpanded `~`, JSON argv, or `node -e` interpolation. Shell examples use their actual Bash/PowerShell syntax and correct quoting.
- Preserve stdout framing, strict UTF-8, byte limits, close/error handling, envelope correlation/revisions and expected exit status. Launch failure is transport failure, not fabricated controller counsel.
- Proposed architecture update must precede code: label intended behavior separately from verified/current behavior in `docs/system-architecture.md`; final evidence-based reconciliation belongs to Phase 08.

Parallel units after snapshot approval:

| Unit | Exclusive scope | Handoff |
|---|---|---|
| Baseline/inventory recorder | Future baseline report; inspect manifests/callers, no production edits | Approved file identity, dirty provenance, exact target set |
| Architecture author | `docs/system-architecture.md`, narrow `docs/code-standards.md` clarification | Proposed Node tuple and support/evidence boundaries |
| Parent integration owner | Snapshot authorization, shared-file decisions, phase review/receipts | One approved Phase 02 input; workers skip gates/formatters |

## Related Code Files

Paths below are repository-relative; generated families are outputs, not authoring surfaces.

| Classification | Exact paths / purpose |
|---|---|
| Modify | `docs/system-architecture.md` sections 1, 4, 5, 6, 7: approved proposed launcher/runtime boundary; preserve dated evidence |
| Modify if needed | `docs/code-standards.md`: explicit Node caller invariant without changing other CLI execute rules |
| Create, proposed evidence | `plans/261003-1527-advisor-node-only-launch/reports/phase-01-baseline.md`: owner approval, provenance, inventory and decisions |
| Verify-only | `.evcrate/targets/manifest.json`, `package.json`, `src/cli/evcrate.ts`, `src/cli/health.ts`, `src/cli/types.ts`, `src/cli/process-runner.ts` |
| Verify-only migration inventory | `.evcrate/source/.claude/workflows/advisor-mentoring.md`, `.evcrate/source/.claude/skills/advisor-strategy/SKILL.md`, `.evcrate/source/.claude/skills/advisor-strategy/references/brief-contract.md`, `README.md` |
| Verify-only script inventory | `scripts/consult-advisor-phase-e02.mjs`, `scripts/consult-advisor-phase-e03.mjs` |
| Verify-only direct-test inventory | `tests/advisor-controller/controller.test.cjs`, `tests/advisor-controller/mentor-brief.test.cjs`, `tests/advisor-controller/retry-orchestration.test.cjs`, `tests/advisor-controller/smoke-30s.cjs` |
| Verify-only Node lifecycle references | `tests/adapters/phase08-mentoring-integration.test.mjs`, `tests/advisor-controller/verification-lifecycle.test.cjs`, `tests/cli/health.test.mjs` |
| Verify-only metadata | `.evcrate/source/.evcrate/bin/evcrate-advisor`, `scripts/generate-runtime-brief.mjs`, `scripts/generate-controller-inventory.mjs`, `install.sh`, `install.ps1` |
| Generated; no Phase 01 regeneration | `.evcrate/source/.evcrate/bin/lib/advisor/runtime-brief.generated.cjs`, `src/manifests/controller-inventory.generated.ts`, manifest-declared projection roots under `.evcrate/source/`, `.evcrate/build-manifest*.json`; `.evcrate/targets/*/files/` are overlay inputs, not generated projection roots |

## Implementation Steps

1. Parent establishes authorization/provenance before writes. Future read-only commands: `git status --short --branch`, `git branch --show-current`, `git rev-parse HEAD`, `git diff --name-status`, `git diff --cached --name-status`. Record output once; do not repeatedly audit or repair unexplained index drift.
2. Identify ownership for every dirty file an implementation generator may overwrite. Include necessary untracked VSCode/registry files in the approved isolated snapshot; preserve original worktree bytes. Never silently exclude target work to obtain an easier seven-target pass.
3. Produce the snapshot inventory with the existing candidate identity approach (relative path/kind/size/SHA-256); the recorder must account for untracked input and symlinks. No guessed snapshot command: select an existing repository helper only after reading its actual API; otherwise parent records an explicit one-time inventory procedure.
4. Read `package.json` and `.evcrate/targets/manifest.json` from that snapshot. Record current scripts, Node floor, target manifest paths, canonical roots, closure count and generated output ownership. The observed eight targets are expected input, not a new hardcoded count.
5. Reconcile the corrected caller inventory. Required canonical edits: workflow plus both skill clauses; eight consult calls; four direct-test files. Already-Node health/state/history/lifecycle launches remain verify-only unless concrete defects emerge. Inspect all 16 canonical checkpoint consumers listed in the inventory; preserve pointers/tool-less agents.
6. Audit maintained README/docs examples for launcher syntax, excluding sealed plans and dated evidence. README currently has policy/advice examples, not a direct advisor command; record that distinction instead of inventing an existing example.
7. Architecture author records the tuple and HOME/cwd/Node-selection/error rules as **approved proposed** behavior. Preserve shebang/bin/installer metadata and state/history schemas. Describe native Darwin addon internally, with build-only arm64/x64 packaging authorized but execution/tests forbidden.
8. Parent reviews source identity and design conflicts, approves inventory/parallel ownership, then closes the phase. No build/test is necessary for this contract-only phase; record review as review, not runtime qualification.
9. Hand the approved snapshot and inventory to Phase 02. If advice-controlled implementation is later requested, parent alone applies writer barriers and outside-baseline receipts; captured plan statuses remain historical. Do not mutate sealed artifacts to reflect progress.

## Todo List

- [x] Obtain owner-approved coherent snapshot and dirty provenance.
- [x] Record actual targets, package scripts, Node requirement and generated owners.
- [x] Reconcile every canonical/script/test caller and existing-Node exception.
- [x] Record proposed architecture before implementation; retain packaging metadata.
- [ ] Parent approve contract and Phase 02 interfaces.

## Success Criteria

- Approved snapshot identity includes required untracked/dirty source and identifies original-user versus plan-owned changes.
- Exact maintained migration set is complete; eight targets and eight consult calls explicitly accounted for.
- Actual Node selection, explicit-HOME failure, project/diagnostic cwd scopes and no-fallback behavior are unambiguous.
- Architecture authority separates proposed changes from historic qualification; no macOS runtime/test claim, wrapper or protocol expansion.
- Future gates and generation boundaries are identified without claiming any executed checks.

## Risk Assessment

- Generator overwrites user work: isolate approved snapshot and require parent-owned integration.
- Drift between report and source: re-read actual snapshot at phase entry; update current inventory, never old sealed plans.
- Bun executable confused with Node: distinguish known Node parents from harness runtime, without expanding CLI support.
- Node-only mistaken for OS neutrality: Darwin native prerequisites remain substantive dependencies for Phases 04–05.

## Security Considerations

- Do not record credentials, actual routing secrets or broad environment dumps in baseline evidence.
- Absolute HOME/controller resolution must not search project roots or accept invalid explicit HOME.
- Inventory must reject unexpected node kinds/symlinks according to existing closure policy; do not introduce permission-based evidence digests.
- All subsequent controller testing uses disposable HOME, project and temp roots; production HOME is outside authorization.

## Next Steps

Proceed to [Phase 02 — Node-only callers](./phase-02-node-only-callers.md) only after snapshot and contract review. Missing Apple builder or Windows host gates later implementation, not this plan's authoring.

## Unresolved Questions

- Which owner-approved isolated snapshot incorporates the current VSCode/registry work? Resolve before implementation writes.
- Native Apple build producer and Windows host/pins remain later-phase prerequisites; no caller design question remains.
