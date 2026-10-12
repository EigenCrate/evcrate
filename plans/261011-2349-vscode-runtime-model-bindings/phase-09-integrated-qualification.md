# Phase 09 — Integrated contract and native qualification

## Context links
- [Plan](./plan.md); [verification matrix](./verification-matrix.md); [design contracts](./design-contracts.md); all prior phase evidence.
- Dependencies: Phases 03–08 complete and writers settled. No partial/static fallback candidate.

## Overview
- Date: 2026-10-11; priority P1; implementation Pending (0%); implementation review Pending; design-summary review: [Advisor](./reports/advisor-review.md).
- Prove final packaged extension/CLI behavior, not earlier spike or source-only tests.

## Key Insights
- Historical native receipts do not qualify new templates/provider/VSIX bytes.
- Full suite and compiled output are necessary regression gates but do not establish actual model/hook selection.
- Every named acceptance row (as reconciled by confirmed validation decisions) needs pass evidence or explicit blocker; no unapproved scope reduction.

## Requirements
- Candidate-bound receipts: source revision, intent/template hashes, VSIX digest, core build digest, host versions, local profile/authority/trust, and prior explicit per-session user approval naming the exact isolated profile/workspace, selected models and live invocation scope (separate from install or proposal-enablement consent).
- Actual direct/subagent metadata, cross-scope precedence (`root actor > user actor > root tier > user tier`), in-flight immutability, cached-selection race evidence plus explicit reselection/reload recovery, restrictions/hooks/reference paths and unchanged runtime publication hashes.
- Local project/HOME coexistence, multi-root, isolated local profiles, unsupported-remote rejection (SSH/dev-container/WSL out of this deliverable and verified not to fall back to local HOME/editor), refusal/disabled/profile/exit-`5` requested install failure and proposal states covered.

## Architecture
- Same offline candidate bytes feed contract tests, packed consumer and isolated native host qualification.
- Core publication and extension installation evidence recorded separately; no real user profile alteration without approval.
- Reconciled acceptance matrix is authoritative; unknown required local rows stay blocking even when automated tests green.

## Related code files
- Run/update real behavior suites in `tests/adapters/`, `tests/vscode-companion/`, `tests/cli/`, `tests/distribution/`, `tests/integration/vscode-installed-runtime.test.mjs`.
- Read/fix owning modules only for discovered regression; do not add test-only fallback implementation.
- Generate through existing scripts: registry/projections/aggregate and seven target manifests; no manual generated writes.
- Create evidence during implementation: this plan's `reports/integrated-qualification.md`, `reports/native-qualification.md`, finalized support matrix.
- Delete: temporary smoke/spike scripts after proof; obsolete wording/source-text tests rather than repinning.

## Implementation Steps
1. Compile core and dedicated extension; run new focused behavior suites and affected existing adapter/CLI/publication/package suites once after writers settle. Fix actual failures, then rerun changed-path proof.
2. Regenerate via `npm run generate:all`; execute `npm run distribute:check`. Prove all eight manifests promoted atomically and current output owners/hash sets valid. Exercise serial/worker parity on same companion input.
3. Run package closure (`npm run release:check` plus companion verifier), existing full `npm test` and dedicated extension test command wired in Phase 07. Do not cite echo-only lint as proof.
4. Package/extract Linux and Windows archives; verify embedded VSIX descriptor/hash/closure and exact seven external assets. Existing Windows installer/version subset does not qualify new Windows editor surface; separate native editor row required for a support claim.
5. In authorized isolated local native profile install exact candidate; prove proposal-disabled state, explicit launch/activation and no duplicate picker/custom-subagent actors. Configure each tier, cross-scope actor/tier overrides (`root actor > user actor > root tier > user tier`) and inherit/reset through actual commands. Before Steps 6–8, obtain explicit per-session user approval naming the exact isolated profile/workspace, all prior and rebound models that may be invoked (including during cached-selection race checks), and the full live invocation scope.
6. Strictly within the explicitly approved session/workspace/model/invocation scope, invoke representative real direct actor and native child; compare emitted selector/diagnostics with host-observed model. Exercise explicit tool-model precedence, cost restrictions, unavailable identity and duplicate selector; no self-reported model evidence.
7. Within the approved session scope, attempt harmless denied tool/delegation and allowed paths; verify privacy/scout/session hooks, `cmd-*` namespaced skills, sibling links/workflows/scripts. Generated frontmatter alone is not enforcement proof.
8. Within the approved session and model list (covering both prior and rebound models), change binding/template/catalog during a running turn; prove active turn retains its immutable resource/model, provider refresh updates contributed inventory, and any newly discovered actor or any actor invoked after explicit reselection or window reload resolves to the updated model (any wrong model on new discovery or after explicit reselection/window reload, or any failure of trust/source invalidation, tool/delegation restrictions or hooks fails acceptance). Exercise stale already-selected actor/model removal/change, two windows, extension-host restart/restored chat, root switching and bounded generation retention/budget exhaustion (blocking new derivation without deleting uncertain referenced resources, with manual cleanup only after all editor windows/processes are fully closed when automatic reclamation is unproven). Record native race evidence when an already-selected cached agent executes with an approved prior/stale model *before* explicit reselection/reload, and prove recovery via explicit reselection or window reload under the confirmed narrow cached-agent exception.
9. Hash canonical/published roots before/after configuration and republish; prove bindings preserved. Exercise source/trust revocation, two project roots explicit switching, local project/HOME coexistence, local profile/window/root storage isolation and unsupported remote authority rejection (no silent local HOME/editor fallback).
10. Run actual CLI consent refusal/non-TTY skip, profile mismatch/disabled extension, unsupported remote context rejection, timeout/cancel and explicitly requested install failure/manual-setup-required after successful commit. Verify stdout `ResourceResult` stays committed, stderr emits `install-notice-v1`, exit code is `5` for requested post-commit failure/manual setup (with no rollback or blind publication retry), and no unauthorized settings/API changes occur.
   Exercise unsupported-authority guards through local boundary cases, not remote host qualification. Apply Design §6 safe-manual-cleanup requirements: close all editors and retire referencing sessions or establish safe-reopen proof before removing generations.
11. Complete all eleven verification rows with final-byte receipts, installed build identity and automatic-install proof for required local tuples. Missing local GUI/profile/model-access approval stays blocked; manual instructions are not automatic acceptance. Final review settles drift. Phase 10 artifact-affecting guide edits require new hashes/receipts and affected native requalification before final acceptance.

## Todo list
- [ ] Focused contract/full-suite/package gates passed.
- [ ] Atomic regeneration/serial-worker/archive identity proven.
- [ ] Native direct/subagent/restriction/reference/hooks proof complete.
- [ ] In-flight immutability, cached-selection race/reselection recovery and bounded storage retention proven.
- [ ] Per-session live approval, exit-`5` consent/install and local project/HOME/multi-root/profile matrix complete.
- [ ] Final review and candidate-bound receipts accepted.

## Success Criteria
- Every row of verification matrix has real proof tied to final bytes; required unknown/fail rows prevent completion.
- No changes to six other target model policies, canonical authoring, resource protocol/publication/recovery/release trust boundaries.
- No scaffolds, fake native receipts, silent fallback, unbounded storage or unauthorized installation.

## Risk Assessment
- Live access/privacy limits may restrict receipts; retain minimally sufficient native selection metadata, not prompts/secrets.
- Host upgrade changes proposed behavior; new tuple requalifies, never inherits blanket compatibility.

## Security Considerations
- Isolated synthetic workspaces/profiles and explicit per-session live-invocation approval (naming exact profile/workspace, selected models and invocation scope, separate from install or proposal-enablement consent); no broad cleanup of main settings/history.
- Candidate hashes are necessary integrity evidence, not authorization for vendor calls or release deployment.

## Next steps
- Phase 10 documents only supported verified behavior and guarded rollout; no release publication without separate authorization.

## Unresolved questions
- None for completion. Missing native surfaces/model access remain explicit blockers, not deferred acceptance.
