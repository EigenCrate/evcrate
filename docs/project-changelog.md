# Project Changelog

## Unreleased

**Updated:** 2026-09-16
**Status:** Hook Materialization Scope Distribution complete through Phase 09; Windows release qualification complete through Phase 10 (10/10 phases, 100%; completed 2026-09-15). Package version: `2.1.0`.
Older phase records remain in the linked archive.

### 2026-09-15 — docs(release): complete Windows qualification and bounded support cutover (Phases 09–10)

**Status:** Phases 09–10 DONE (10/10 Windows qualification phases; 100%; completed 2026-09-15).  
**Plan:** [Windows qualification master plan](../plans/260914-0636-windows-release-qualification/plan.md)  
**Evidence:** [Phase 09 integrated qualification](../plans/reports/tester-260915-1119-phase-09-integrated-qualification.md), [Phase 09 suite validation](../plans/reports/tester-260915-1119-phase-09-suite-validation.md), and [Phase 10 support cutover](../plans/260914-0636-windows-release-qualification/phase-10-post-proof-documentation-and-support-cutover.md)

- Completed the hosted `windows-2025` x64 matrix for PowerShell 5.1/7 and Node
  `22.19.0`/`24.21.0`, with standalone installer lifecycle (`install`,
  repeat-install, `repair`, upgrade, `rollback`, `uninstall`) and `version --json`
  qualification.
- Bounded support now covers the standalone installer and version reporting only.
  `publish`, `health`, advisor execution, live vendor qualification, and production
  HOME publication remain Linux-only or operator-gated.
- Reconciled README and architecture, standards, PDR, and roadmap documentation with
  package version `2.1.0`, Windows defaults, user PATH behavior, and project
  publication state.

### 2026-09-15 — feat(ci): unprivileged Windows PR smoke and qualified asset labels (Phase 08)

**Status:** Phase 08 DONE (2026-09-15; 100%).  
**Plan:** [Phase 08 plan](../plans/260914-0636-windows-release-qualification/phase-08-unprivileged-windows-pr-smoke-and-labels.md)  
**Evidence:** `tests/distribution/release-orchestration.test.mjs` (WRQ-042–044).

- Added `.github/workflows/windows-smoke.yml`: `pull_request`/manual-only, read-only
  `contents`, canceling concurrency, `windows-2025` x64, Node `22.19.0`, pinned
  v4 actions, `npm ci`, checked-in version/SHA fixture build, exact-seven verify,
  and explicit `pwsh.exe` smoke harness.
- Fixture identity uses `--allow-fixture-identity` and is diagnostic only: no
  secrets, write scope, upload, semantic-release, or privileged follow-up/handoff.
- `.releaserc.json` now labels the Windows ZIP `Windows x64 Archive` and
  `install.ps1` `Windows Installer Entrypoint (install.ps1)`; other labels,
  paths/order, and prepare command remain unchanged.
- WRQ-042 covers workflow isolation, WRQ-043 fixture/exact-seven/smoke wiring,
  and WRQ-044 exact labels plus preserved asset configuration. Native matrix,
  publication, and final byte proof remain Phase 09/operator gates.

### 2026-09-15 — feat(ci): split release workflow into producer, matrix, and publisher (Phase 07)

**Status:** Phase 07 DONE (2026-09-15; 100%); Cycle 2 review approved 10/10.  
**Plan:** [Phase 07 plan](../plans/260914-0636-windows-release-qualification/phase-07-release-workflow-producer-matrix-publisher.md)  
**Evidence:** [Cycle 2 review](../plans/reports/code-review-260915-0155-phase-07-cycle-2.md)

- Replaced the monolithic release job with an unprivileged Ubuntu producer, a
  four-row `windows-2025` x64 qualification matrix, and a success-only publisher.
- Producer gates remain ordered; release handoff uses one immutable artifact ID,
  receipt, and producer hashes. Matrix rows consume the artifact without checkout/npm.
- Publisher is the sole writer, copies exactly seven assets, and runs semantic-release
  in verify mode. All eight action uses are pinned to full v4 SHAs.
- Static YAML/permissions/action-pin/expression checks passed; release orchestration
  passed 12/12. Native Windows execution and live publication remain Phase 09/operator gates.

### 2026-09-14 — feat(release): canonical semantic-release candidate, receipt, and publisher (Windows qualification Phase 06)

**Status:** Phase 06 DONE (2026-09-14; 100%); Cycle 2 code review approved 10/10.
**Plan:** [Phase 06 plan](../plans/260914-0636-windows-release-qualification/phase-06-semantic-release-candidate-receipt-and-publisher.md)
**Evidence:** [Cycle 2 review](../plans/reports/code-review-260914-2236-phase-06-cycle-2-release-orchestration.md)

- Added the canonical candidate runner with strict `.releaserc.json` loading,
  disposable bare-mirror semantic-release execution, GitHub-plugin removal only,
  build-mode asset preparation, release-token stripping, clean checkout/source
  identity checks, exact seven/four staging, canonical `candidate.json`, atomic
  promotion, and exactly nine safe GitHub output scalars.
- Added the verify-only publisher wrapper: receipt and hash preflight, exact
  assets-only `dist/release` copy, forced `EVCRATE_RELEASE_ASSET_MODE=verify`,
  canonical semantic-release invocation, and version/tag/source equality checks.
- Bound `semantic-release`, `release:candidate`, `release:verify-assets`,
  `test:release`, and `test:installer:windows` in `package.json`; no new
  dependency or orchestration-only lockfile edit.
- `release-orchestration.test.mjs` passes 12/12; `npm run test:release` passes
  29/29; build and CLI help checks pass. Native Windows execution and live
  npm/GitHub publication remain downstream gates.



### 2026-09-14 — feat(test): self-contained Windows qualification harness (Phase 05)

**Status:** Phase 05 DONE (2026-09-14; 100%); Cycle 2 review approved 10/10.
**Plan:** [Phase 05 plan](../plans/260914-0636-windows-release-qualification/phase-05-self-contained-windows-qualification-harness.md)
**Evidence:** [Cycle 2 review](../plans/reports/code-review-260914-2030-phase-05-self-contained-windows-qualification-harness-cycle-2.md)

- Delivered the Node-builtins-only qualification CLI with strict host,
  receipt, and exact-byte preflight; safe PowerShell/`cmd.exe` runners;
  smoke/full lifecycle controllers; immutable-state and PATH observers; and
  isolated negative scenarios.
- Scoped checks passed 60/60: distribution/harness 28/28, release artifacts
  17/17, and Linux installer wildcard 15/15. Direct `--help` invocation
  exited 0, confirming the standalone entrypoint.
- Native Windows smoke/full execution remains an explicit downstream Phase 09
  evidence gate; Phase 07 workflow wiring is complete but does not execute hosted
  rows. This deterministic host-independent evidence makes no runtime support claim.
- Handoff advanced to Phase 06 — semantic-release candidate, receipt, and
  publisher.

### 2026-09-14 — feat(release): deterministic Windows fixture and predecessor resolver (Phase 04)

**Status:** Phase 04 DONE (2026-09-14; 100%); Cycle 2 review approved 10/10.
**Plan:** [Phase 04 plan](../plans/260914-0636-windows-release-qualification/phase-04-deterministic-windows-fixture-and-predecessor.md)
**Evidence:** [Cycle 2 tests](../plans/reports/tester-260914-1803-phase-04-deterministic-windows-fixture-predecessor-cycle-2.md)
and [Cycle 2 review](../plans/reports/code-review-260914-1805-phase-04-deterministic-windows-fixture-predecessor-cycle-2.md).

- Factored shared fixture record ordering, controller/build-manifest digests, real
  installer bytes, and fixed timestamp metadata; `buildWindowsTestReleaseSet`
  now uses `buildReleaseArchives` and emits exactly four Windows assets.
- Added bounded stable-release enumeration and exact-label/canonical-name
  predecessor resolution. Bootstrap uses verified `1.0.0`/`v1.0.0` bytes with
  lowercase `a`×40 identity only before qualification history; latest stable is
  mandatory afterward, with no older/bootstrap fallback.
- Added private staged streaming downloads with cross-origin token stripping,
  bounded error/stream bytes, pre/post-promotion exact-four verification, strict
  CLI flags, and cleanup of partial output on failure.
- Focused Phase 04, release, and Linux installer suites pass 39/39 (100%).
  This deterministic Linux evidence does not qualify native Windows runtime.

### 2026-09-13 — docs(distribution): post-verification operator and architecture documentation (Phase 09)

**Status:** Phase 09 DONE (2026-09-13; 100%). Live operator and architecture documentation updated after full implementation proof, release gate verification, 14-suite `npm test` success (512/512), exact 29-file closure verification, and installed Linux release proof.
**Plan:** [Phase 09 plan](../plans/260912-0051-hook-materialization-scope-distribution/phase-09-post-verification-operator-documentation.md) and [master plan](../plans/260912-0051-hook-materialization-scope-distribution/plan.md)

- Reconciled code and design contracts against Phase 08 evidence.
- Updated `README.md` with operator CLI examples (`--scope home|project`, `--home`, `--project-root`, `--target`, recovery), the seven-target destination matrix, shared controller HOME invariant, partial failure semantics (`PUBLICATION_FAILED`/`ROLLBACK_FAILED`, exit 5), quiescence runbook, and the explicit distinction between standalone installer rollback (`install.sh rollback`) and harness publication recovery.
- Updated `docs/system-architecture.md` with the updated build-to-publication dataflow diagram, two-phase transaction execution, HOME-then-project lock ordering, preflight-before-mutation checks, schema-2 state roots, and scope-isolated recovery.
- Updated `docs/project-overview-pdr.md` with observable functional requirements for scope-aware publication (FR-10), partial exit codes, and Linux-only qualification status.
- Updated `docs/code-standards.md` with enforceable architectural bans (no project controller, no reverse lock acquisition, no arbitrary wrapper body rewriting, no ancestor project searches, no cross-volume atomicity fiction, no hand-editing generated files, no cross-scope recovery) and two-phase transaction standards.
- Updated `docs/codebase-summary.md` with exact current symbols, test suites, descriptor types, and the comprehensive scope distribution architecture summary.
- Updated `docs/pi-native-migration.md` with scope-aware publication commands, extension-derived EVCrate root derivation, and `PI_CODING_AGENT_DIR` runtime variable semantics.
- Updated `docs/project-roadmap.md` and `docs/project-changelog.md` with complete evidence traceability for Phases 01 through 09.
- Verification: [Cycle 2 validation](../plans/reports/tester-260913-1742-phase-09-cycle-2-test-suite-validation.md) records `npm run build`, `npm run distribute:check`, and `npm test` passing; [Cycle 2 review](../plans/reports/code-review-260913-1758-phase-09-operator-docs-cycle-2.md) approved the documentation set at 10/10.

### 2026-09-13 — feat(distribution): installed Linux release fixtures and regeneration (Phase 08)

**Status:** Phase 08 DONE (2026-09-13; 100%). Installed Linux fixtures and checked-in regeneration verified.
**Plan:** [Phase 08 plan](../plans/260912-0051-hook-materialization-scope-distribution/phase-08-installed-release-fixtures-and-regeneration.md) and [master plan](../plans/260912-0051-hook-materialization-scope-distribution/plan.md)

- Extended `verifyInstalledLauncherAndInvariance` to prove HOME non-mutation on install, all-seven HOME publication with shared controller, project publication to separate project directory without project controller, runtime entrypoint execution across all seven targets from third workspace, partial failure rollback and recovery isolation, and package snapshot byte invariance throughout.
- Modularized installed assertions into `scripts/release/installed-lifecycle-assertions.cjs` (< 200 LOC).
- All release gates passed sequentially: `npm run distribute:build`, `npm run generate:registry`, `npm run generate:manifests`, `npm run distribute:check`, `npm run test:release` (10/10), `npm run test:installer:linux` (15/15), `npm run test:validation-rollout` (6/6), `npm run test:distribution:rollout` (5/5), and full test suite (512/512).
- Terminal code review approved (Verdict: PASS) with zero blockers and full A43–A49 compliance.

### 2026-09-13 — feat(distribution): focused contract and runtime proof for scope distribution (Phase 07)

**Status:** Phase 07 DONE (2026-09-13; 100%). Focused proof gate passed across all protocol, adapter, publication, and recovery suites.
**Plan:** [Phase 07 plan](../plans/260912-0051-hook-materialization-scope-distribution/phase-07-focused-contract-and-runtime-proof.md) and [master plan](../plans/260912-0051-hook-materialization-scope-distribution/plan.md)

- Focused gates passed: build; protocol 21/21; CLI/context 47/47; primitives 31/31; adapters 26/26; publication 77/77; integration 14/14; cutover 7/7; and direct `distribute:check` returned `status: "ok"`.
- Tester passed five targeted checks; terminal code review approved with no findings; advisor reconciliation approved finalization.
- Canonical regeneration ran through `distribute:build`, `generate:registry`, and `generate:manifests` to restore controller-manifest hash integrity.
### 2026-09-13 — feat(distribution): schema-2 state migration and scope-isolated recovery (Phase 06)

**Status:** Phase 06 DONE (2026-09-13; 100%). Blocking review corrections resolved and implementation approved. Generated `.evcrate` artifacts remain Phase 08-owned; `docs/system-architecture.md` remains Phase 09-owned.
**Plan:** [Phase 06 plan](../plans/260912-0051-hook-materialization-scope-distribution/phase-06-state-migration-recovery-and-partial-orchestration.md) and [master plan](../plans/260912-0051-hook-materialization-scope-distribution/plan.md)

- Schema 2 separates shared controller state from HOME harness state. Valid schema-1 in-progress state is recovered first under the HOME lock; valid terminal state migrates atomically, while ambiguous ownership remains untouched and fails closed.
- Recovery is scope-isolated: HOME recovery reads only HOME state; project recovery validates the canonical project identity and reads only its identity-keyed project state. Project publication commits shared HOME first, then applies harness independently; harness failure rolls back only project work and returns a top-level `partial` (exit category 5), using `PUBLICATION_FAILED` after successful rollback or preserving the journal with `ROLLBACK_FAILED` when rollback fails.
- Blocking review corrections covered schema-2 binding/phase validation, project-root binding before HOME mutation, locked replanning after HOME recovery, durable ownership-pinned legacy cleanup retry, and same-volume preflight. Existing modes, hashes, CAS, ownership, and unmanaged-data protections remain fail-closed.
- **Direct local evidence:** `npm run build` passed; `node --test tests/distribution/publication-recovery.test.mjs` passed 19/19; `node --test tests/distribution/publication-apply.test.mjs` passed 12/12; `node --test tests/distribution/publication-plan.test.mjs` passed 6/6; `node --test tests/cli/publication.test.mjs` passed 6/6.
- The mandatory tester agent could not execute because its provider returned HTTP 429 before commands; no tester-agent execution is claimed. These local checks do not qualify live vendors/operators or authorize HOME publication.


### 2026-09-13 — feat(distribution): generic transaction engine and locking (Phase 05)

**Status:** Phase 05 DONE (2026-09-13; 100%). Generic transaction descriptor and execution engine implemented.
**Plan:** [Phase 05 plan](../plans/260912-0051-hook-materialization-scope-distribution/phase-05-generic-transaction-engine.md) and [master plan](../plans/260912-0051-hook-materialization-scope-distribution/plan.md)

- Generic immutable transaction descriptor/engine covering HOME and project publication with preflight-before-mutation, HOME-then-project locking, durable journal-before-workspace ordering, workspace identity/containment and same-volume checks, fsync/marker ordering, bounded HOME retention with project no-retention cleanup, and distinct recovery/error outcomes.
- Existing schema-1 HOME recovery compatibility preserved.
- Direct evidence: `npm run build` passed; `npm run test:publication` passed 66/66; `npm run test:integration` passed 14/14; focused recovery and oversized-result regressions passed.
### 2026-09-12 — feat(distribution): one-snapshot shared and harness phase planning (Phase 04)

**Status:** Phase 04 DONE (2026-09-12; 100%). Final authorized-scope review approved with no findings. Live operator documentation (`docs/system-architecture.md`) remains unchanged until Phase 09; generated outputs remain Phase 08-owned.
**Plan:** [Phase 04 plan](../plans/260912-0051-hook-materialization-scope-distribution/phase-04-one-snapshot-phase-planning.md) and [master plan](../plans/260912-0051-hook-materialization-scope-distribution/plan.md)

- Resolved one aggregate schema-2 `VerifiedCurrentBuild` and digest once, then passed the immutable snapshot to ordered shared and harness planning. Shared controller materialization remains fixed beneath `<home>/.evcrate/bin`; HOME uses strict target mappings/order, with only valid Gemini `.gemini` → Antigravity `.gemini/config` nesting; project roots/documents remain neutral and contained.
- Preserved selected-target ownership and stale cleanup bounds, shared JSON merges and user-owned bytes, hashes, modes, CAS snapshots, immutable defensive operation bytes, transformed/merged file-size bounds, and duplicate planned-destination rejection. Full overlap/path preflight runs before destination reads.
- Advisor correction state completed after user-approved bounded corrections. Final blocking code review verdict: approve with no findings.
- **Direct repository evidence:** `npm run build` passed; `node --test tests/distribution/publication-plan.test.mjs tests/distribution/publication-parity.test.mjs` passed 8/8; `npm run test:publication` passed 57/57; `npm run test:adapters` passed 24/24; `npm run distribute:check` returned `status: "ok"`.
- The tester subagent could not execute because its external Cloud Code Assist backend returned HTTP 429; the direct commands above are the evidence. These deterministic repository checks do not qualify live vendors/operators or authorize HOME publication.
- Handoff: Phase 05 generic transaction engine; Phase 06 schema-2 state/recovery/partial orchestration; Phase 07 focused contract/runtime proof.
### 2026-09-12 — feat(distribution): neutral seven-target runtime closures and structured HOME rules (Phase 03)

**Status:** Phase 03 DONE (2026-09-12; 100%).  
**Plan:** [Phase 03 plan](../plans/260912-0051-hook-materialization-scope-distribution/phase-03-neutral-seven-target-runtime-closures.md)

- Completed installation-relative neutral runtime closures for all seven targets, structured HOME transforms, workspace `cwd`/environment separation, and fail-closed child validation.
- Evidence: `npm run build`, adapters 24/24, source-derived publication 54/54, integration 14/14, and the source-derived full suite passed. Checked-in generated outputs remained Phase 08-owned.


### 2026-09-12 — feat(distribution): context and manifest project bindings (Phase 02)

**Status:** Phase 02 DONE (2026-09-12; 100%). Live operator documentation (`docs/system-architecture.md`) remains unchanged until final proof in Phase 09 per design contracts and acceptance matrix A47/A50.  
**Plan:** [Phase 02 plan](../plans/260912-0051-hook-materialization-scope-distribution/phase-02-context-and-manifest-project-bindings.md)  
**Evidence:** [Advisor review](../plans/reports/advisor-260912-1035-phase02-context-and-manifest-project-bindings.md) and [context tests](../tests/context/invocation-context.test.mjs)

- Normalized project destinations: Added immutable `ProjectDirectoryDescriptor` and `ProjectDocumentDescriptor` unions to `SelectedTargetContext` and `InvocationContext` (`src/manifests/types.ts`, `src/context/invocation-context.ts`), derived strictly from manifest `outputRoots` and `projectDocs` in declaration order without filesystem ancestor traversal.
- Retained file/directory distinction: Root documents (Codex `AGENTS.md`, Gemini `GEMINI.md`) are explicitly represented as document descriptors, never traversed as directory bindings.
- Intra- and cross-target overlap validation: Added strict overlap rejection via `pathOverlaps` and `assertNoDescriptorOverlap` (`src/manifests/manifest.ts`, `src/manifests/registry.ts`, `src/context/invocation-context.ts`) that rejects equal, nested (ancestor/descendant), duplicate document, and root/document collisions before any destination inventory reads.
- Canonical project root and owner-controlled identity: Implemented `canonicalProjectRoot` in `src/scopes/identity.ts` enforcing real directory existence, non-symlink ancestry, owner control (`process.getuid()` or root), and native `realpath` canonicalization. Computed lowercase 64-hex SHA-256 `projectIdentity` over the validated canonical absolute path.
- Non-publication safety: Added `resolvePublicationProjectContext` for publication-boundary mutation checks while preserving lexical project root resolution and independent `projectId` for general `resolveInvocationContext` commands.
- Projection neutrality: Maintained exact byte-for-byte shape compatibility for `ProjectionBuildContext` in `src/adapters/types.ts`; adapters receive no scope or transaction context.
- Verification: 174/174 tests passing across primitives, CLI, adapters, publication, and protocol test suites (`npm run test:primitives`, `npm run test:cli`); `npm run distribute:check` status ok with zero drift.
### 2026-09-12 — feat(distribution): freeze scope publication protocol (Phase 01)

**Status:** Phase 01 DONE (2026-09-12; 100%).  
**Plan:** [Phase 01 plan](../plans/260912-0051-hook-materialization-scope-distribution/phase-01-cli-and-protocol-contract.md)

- Froze scalar `--scope home|project` parsing/defaults, exact publication/recovery wire shapes, ordered shared/harness phase correlation, partial results, and exit category 5.
- Evidence: protocol 21/21, CLI 42/42, integration 14/14, publication 53/53, and `npm run build` passed.


### 2026-09-11 — fix(advisor): resolve V2 evidence.files schema ambiguity and improve input diagnostics

- Resolved `PROTOCOL_INVALID` failure on caller-provided string `evidence.files` by differentiating client request validation from downstream adapter protocol errors.
- Parameterized `validateCheckpointV2(value, code = 'PROTOCOL_INVALID')`; request boundaries in `state-contract.cjs` and `task-state.cjs` pass `REQUEST_INVALID`.
- Updated `REQUEST_INVALID` in `errors.cjs` to provide version-neutral, actionable instructions indicating that V2 `evidence.files` requires `{ path, excerpt, digest }` objects and `intended_changed_paths` are strings. Preserved exact four-key error envelope.
- Populated empty `evidence.files` examples in canonical `advisor-mentoring.md` and `brief-contract.md` with schema-valid `{ path, excerpt, digest }` fixtures while maintaining exactly 10 extractable JSON blocks.
- Clarified agent instructions across all seven target projections (`advisor.md`, `SKILL.md`).
- Validated zero projection drift across all seven harnesses via `distribute:check` and 100% test pass rate across 230 tests (`test:advisor-controller` 207/207, `test:adapters` 23/23).
- Independent code review (9.5/10 Approved) and mentor review (`review:hard-fix` with GPT-5.6 Sol high effort: Approved).

## [2.0.0] - 2026-09-09

**Release commit:** `628183eb` (`chore(release): 2.0.0 [skip ci]`)  
**Status:** Phase 10 deterministic acceptance complete.

- Aligns the v2.0.0 release with the pure TypeScript control plane, seven-target
  projections, schema-2 manifests, and v2 advisor routing/retry orchestration.
- Deterministic acceptance: 272/272 tests, 29/29 controller-closure files, and
  9/9 sanitized mentoring baseline cases passed.
- Live vendor qualification and production `$HOME/.evcrate/` publication remain
  operator-gated; no live quality or rollout claim is made.


### 2026-09-08 — test(advisor): verify deterministic Phase 10 acceptance and establish synthetic improvement baseline (phase-10)

**Status:** Phase 10 DONE for deterministic acceptance (272/272; 100%). Live
vendor qualification, empirical paired baseline, and real HOME publication
remain explicit operator gates.  
**Plan:** [Phase 10 plan](../plans/260907-1208-advisor-mentoring-recovery-audit/phase-10-acceptance-qualification-and-improvement-evaluation.md)  
**Evidence:** [QA acceptance report](../plans/reports/qa-260908-1915-phase10-acceptance.md) and
[acceptance matrix](../plans/260907-1208-advisor-mentoring-recovery-audit/acceptance-matrix.md)

- Added disposable-HOME end-to-end fixtures for controller, state/history, human-gate,
  capability, command, and mentoring-evaluation behavior.
- `tests/distribution/phase10-test-helpers.mjs` creates owner-only temporary roots,
  fake Codex/OMP routes, a Git baseline, bounded subprocess invocation, and a
  strict child-environment allowlist with token/PAT scrubbing.
- `tests/fixtures/mentoring-evaluation/corpus.json` defines nine sanitized cases
  (one positive control and eight failure-oriented cases) over five rubric
  dimensions: direction accuracy, scope discipline, safety invariants,
  actionability, and evidence grounding. Passing threshold: average score `4.0`.
- `evaluator.mjs` supplies deterministic scoring, generic-filler rejection,
  decision-alignment checks, evidence grounding, and destructive-command safety
  probes. The corpus is a synthetic baseline, not a live model-quality benchmark.

#### Dedicated acceptance suites

| Suite | Cases | Observable coverage |
|---|---:|---|
| `phase10-controller-scenarios.test.mjs` | 7 | Primary success, fatal/malformed input, stream handling, unsupported route, cancellation, and child credential scrubbing |
| `phase10-state-and-history.test.mjs` | 3 | Stale evidence, idempotent replay/history inspection, and dirty-user-baseline preservation |
| `phase10-human-gate.test.mjs` | 1 | Three failed corrections enter `needs_human`; fourth remediation is denied |
| `phase10-commands-and-evaluation.test.mjs` | 4 | Seven-target declarations, V2/`--advice` command contract, corpus pass, and adversarial counsel rejection |
| **Dedicated total** | **15** | **15/15 passed** |

#### Deterministic evidence

| Command or surface | Result |
|---|---:|
| `node --test tests/distribution/phase10-*.test.mjs` | 15/15 |
| `node tests/advisor-controller/smoke-30s.cjs` | 1/1; 31.28s silent generation, one launch |
| `npm run test:advisor-controller` | 204/204 |
| `npm run test:adapters` | 24/24 |
| `npm run release:check` | 29/29 controller files; closure verified |
| `npm run test:installer:linux` | 15/15 |
| `npm run test:cutover && npm run test:validation-rollout` | 13/13 |
| **Deterministic total** | **272/272; 100%** |

#### Explicit boundary

- Deterministic tests verify repository contracts, state transitions, process
  behavior, capability declarations, sanitized evaluation, packaging, and
  disposable-HOME preservation. Fake CLIs do not authenticate vendors or prove
  paid model quality.
- All seven targets declare mentoring support with `writeChecks: advisory-only`;
  generated markers do not establish live host enforcement or a universal
  pre-edit hard block.
- No real credentials, external vendor APIs, or empirical paired executor runs
  were used. Live route/auth/model/effort/no-tool qualification and the paired
  improvement baseline remain **UNVERIFIED (GATED)**.
- Tests use disposable HOME only; production `$HOME/.evcrate/` was not modified.
  HOME publication requires an operator-selected route and explicit authorization
  before `npm run distribute:all` or an equivalent staged publish/apply action.

This evidence closes the deterministic Phase 10 acceptance surface without
claiming live qualification, measured quality improvement, or authorized rollout.

### 2026-09-08 — feat(distribution): generate projections, synchronize build manifests, and stage coherent cutover (phase-09)

**Status:** Phase 09 DONE (2026-09-08; 100%); superseded by the Phase 10
deterministic acceptance entry above; the v2.0.0 milestone is recorded above
**Plan:** [Phase 09 plan](../plans/260907-1208-advisor-mentoring-recovery-audit/phase-09-projection-publication-and-documentation-cutover.md)  
**Evidence:** Full controller closure parity (29 files), 24/24 adapter projection tests, 7/7 cutover tests, 11/11 publication recovery tests, 15/15 installer tests, 5/5 private unpack rollout tests, passing `npm run distribute:check` and `npm run release:check`

- Synchronized all seven target projections (`claude`, `codex`, `gemini`, `antigravity`,
  `pi`, `omp`, `copilot`) from canonical `.claude/` sources via `npm run distribute:build`
  and verified parity with `distribute:check`.
- Added `"generate:registry"` script to `package.json` and synchronized `.evcrate/registry.json`
  and `.evcrate/build-manifest-*.json` via `npm run generate:all`.
- Synchronized **ADVISOR_CONTROLLER_FILES** across `install.sh`, `install.ps1`,
  `scripts/generate-controller-inventory.mjs`, and `src/manifests/controller.ts`, establishing
  strict 29-file closure parity and closing controller closure digest mismatches.
- Verified standalone unpack installers under Linux network namespace isolation
  (`tests/distribution/private-unpack-rollout.test.mjs`) and subprocess tests
  (`tests/installers/*.test.mjs`): package hash invariance, controller closure verification,
  clean-new/whole-old-backup mutable state semantics, atomic locking, and published target preservation.
- Verified publication atomic promotion, CAS conflict protection, and crash recovery in
  disposable HOME (`tests/distribution/publication-apply.test.mjs`,
  `tests/distribution/publication-recovery.test.mjs`), with reviewer smoke tests confirming
  active/incomplete task state and history sentinels remain isolated and intact.
- Documented operator cutover sequence, quiescence, settings workflow, and rollback runbooks
  across system architecture, codebase summary, and roadmap.
- Recovery semantics are explicit: `recover` rolls back a valid interrupted
  `staged`/`promoting` transaction, finalizes a `committed` cleanup window, and
  returns `none` when idle; it never rolls back a completed release. A completed
  release rollback uses installer `rollback` to select a prior snapshot, followed
  by publication `apply` from that snapshot. Post-first-promotion collisions
  retain the journal and fail closed until the external path is reconciled.
- The cutover runbook records the exact V2 policy shape and V1 transport boundary,
  explicit `get -> prepare v2 -> preview -> apply` migration, non-clobbering backup,
  and quiescence inspection from the original project root/HOME. Live pending
  processes or unknown inspection status block deployment; HOME apply remains a
  Phase 10 operator gate.

### 2026-09-08 — feat(advisor): integrate cooperative V2 mentoring gates across commands and harnesses (phase-08)

**Status:** Complete (100%); Lead Mentor approval: 10/10; user approved  
**Plan:** [Phase 08 plan](../plans/260907-1208-advisor-mentoring-recovery-audit/phase-08-workflow-and-harness-gate-integration.md)  
**Evidence:** [Phase 08 integration tests](../tests/adapters/phase08-mentoring-integration.test.mjs)

- Added one canonical `evcrate-advisor-checkpoint/v2` dispatcher and state
  lifecycle for all 16 canonical code/cook/bootstrap/fix consumers:
  `init` -> checkpoint reserve -> controller claim/attach -> state get ->
  disposition -> outcome -> complete, with an explicit human-decision branch.
  Generated projections and manifests retain the canonical source authority.
- Replaced implicit executor behavior with four explicit dispositions:
  `accept`, `reject-with-evidence`, `need-evidence`, and `reconcile`, bounded by
  authorized scope, fresh evidence, and actual changed-path review.
- Separated the three-cycle executor review cap from durable correction exhaustion.
  Failed correction outcomes persist exact one-indexed ordinals 1, 2, and 3;
  the third failure enters `needs_human`, and conversational approval cannot
  bypass the durable state gate.
- Preserved the user's baseline and unrelated edits through pre-write baseline
  checks and post-change actual-path attribution. Concern-free advice supports a
  validated no-change outcome and completion without invented edits.
- Added **TARGET_MENTORING_CAPABILITIES** and target projection rendering. The
  seven-target capability matrix is:

  | Target | Mentoring | Write checks |
  |---|---|---|
  | Claude | supported | advisory-only |
  | Codex | supported | advisory-only |
  | OMP | supported | advisory-only |
  | Antigravity | supported | advisory-only |
  | Gemini | supported | advisory-only |
  | Copilot | supported | advisory-only |
  | Pi | supported | advisory-only |

- Real disposable-HOME CLI integration covers bounded correction (Path A),
  concern-free/no-change completion (Path B), exact 1/2/3 correction ordinals,
  durable `needs_human` blocking, all 10 workflow JSON examples, all 16
  dispatcher references, and all seven projections. Aggregate evidence is
  279/279 tests; this proves fixture-backed lifecycle and projection behavior,
  not paid inference, live vendor qualification, hostile-process containment,
  or HOME publication.


### 2026-09-08 — feat(advisor): add sanitized audit history and outcome review tools (phase-07)

**Status:** Complete (100%); Phase Lead/Senior Mentor sign-off: unconditional
approval, 10/10  
**Plan:** [Phase plan](../plans/260907-1208-advisor-mentoring-recovery-audit/phase-07-audit-history-and-outcome-review.md)  
**Evidence:** [Phase 07 QA verification](../plans/reports/tester-260908-1344-phase07-final-verification.md)

- Added strict version-1 execution and outcome history contracts with bounded
  `execution.json` (128 KiB) and `outcome.json` (64 KiB) records under the
  owner-only `$HOME/.evcrate/advisor-history/<project-id>/<task-run-id>/<consultation-id>/`
  hierarchy.
- The controller persists a started snapshot before model launch, updates
  bounded attempt facts, and settles terminal <code>ADVICE_READY</code>/<code>FAILED</code> execution
  through compare-and-set (CAS) identity checks. Linked outcomes retain
  disposition, evidence revision, actual changed paths, validation, result, and
  correction number.
- History writes are optional rich audit: storage failure exposes
  `audit_status: "degraded"` without failing usable inference, launching another
  model, or resetting required task state. Sanitization excludes credentials,
  raw stderr, hidden reasoning, and raw vendor logs.
- Added managed `evcrate-advisor history list|show|export|prune` operations:
  metadata-only scoped pagination, sanitized inspection, explicit safe
  non-existing-destination export with redaction review, and dry-run/apply
  retention/quota pruning that protects active records and unrelated projects.
- Registered the four history modules in the generated advisor closure, expanding
  the inventory from 25 to 29 production files.
- Verification: 204/204 advisor-controller tests passed across 16 files; the
  targeted Phase 07 history suites passed 19/19. The final mentor review resolved
  all seven implementation items and approved Phase 07 unconditionally at 10/10.

### 2026-09-08 — feat(advisor): add durable task and correction gates (phase-06)

**Status:** Complete (100%); user-approved 2026-09-08 after two review cycles
and a senior mentor challenge.
**Plan:** [Phase plan](../plans/260907-1208-advisor-mentoring-recovery-audit/phase-06-task-state-scope-and-human-handoff.md)

- Added owner-only 64 KiB task state, selected-file/Git baseline identity,
  short process-identity locks, atomic CAS writes and bounded replay protection.
- V2 CLI inference requires a matching reserved checkpoint; terminal linkage
  persists before advice is emitted. Missing/unsafe state blocks dependent work
  without relaunching inference or resetting unresolved episodes.
- Added explicit disposition/outcome/scope/recovery operations. Three failed
  advised corrections block the next correction; observed continuation permits
  exactly one additional correction without resetting the counter.
- Local terminal confirmation is cooperative, not protection against same-user
  terminal automation. Windows state and authentic per-host event linkage remain
  unqualified; no host-wide enforcement claim.
- Verification: 185/185 advisor-controller tests; `npm run build` and
  `npm run release:check` passed against the generated 25-file controller
  closure. Disposable-HOME actual CLI smoke ran real syntax validation through
  three failures, rejected a fourth correction, exercised an automated PTY
  confirmation, then resolved/completed with sentinel preserved.
  Cycle 2 resolved C1 (no-correction completion), C2 (ledger capacity headroom),
  C3 (preflight human decision replay and cancellation), and C4 (compound Git
  staged rename identity and index metadata attribution). Fixture backend
  only; no paid inference or real user-authorization claim from the smoke.

### 2026-09-08 — feat(advisor): add bounded primary retry and one-shot backup orchestration (phase-05)

**Status:** Complete (100%)  
**Plan:** [Phase plan](../plans/260907-1208-advisor-mentoring-recovery-audit/phase-05-primary-retry-and-backup-orchestration.md)

- Added an explicit sequential consultation state machine with up to four
  primary model launches. Positively classified transient failures use
  cancellable 10/20/30-second backoff and stop on the first success.
- After four primary transient failures, or a route-local preflight skip before
  any primary model launch, the configured backup is qualified and invoked once.
  Backup failures are terminal and never retried. Trusted provider cooldowns use
  the larger of configured backoff and cooldown; excessive cooldowns fail closed.
- Qualification-to-spawn identity binding rechecks the invocation executable and
  resolved path before each launch. Drift fails closed without counting a model
  launch; attempt records retain route, slot, model-started, classification,
  retry-delay, and cleanup facts.
- Evidence: 140/140 advisor-controller tests passed; `npm run release:check`
  exited 0. Astra review sign-off is 8/10, and Sol mentor counsel is recorded.
- No provider substitution, parallel hedge, backup retry, or paid
  mentoring-quality claim is made.

### 2026-09-08 — feat(advisor): package canonical mentoring brief and preserve structured V2 advice (phase-04)

**Status:** Complete (100%)  
**Plan:** [Phase plan](../plans/260907-1208-advisor-mentoring-recovery-audit/phase-04-mentor-brief-evidence-and-results.md)

- Established
  `.evcrate/source/.claude/skills/advisor-strategy/references/brief-contract.md`
  as the single source for runtime mentor instructions. The
  `brief-contract.md` → `scripts/generate-runtime-brief.mjs` →
  `runtime-brief.generated.cjs` chain emits the standalone closure artifact
  with a digest and `evcrate-advisor-v2-*` build identity; the generated file is
  never hand-edited.
- `checkpoint-contract.cjs` owns `formatMentorPrompt`: one generated brief is
  followed by explicitly quoted v2 checkpoint data. Claude, Codex, OMP
  (`omp-parser`), and Pi receive the same packaged prompt; each adapter only
  performs transport parsing and sends raw assistant text to the shared parser.
- `contracts-v2.cjs` strictly parses exactly seven advice-body fields:
  `recommendation`, `rationale`, `must_fix`, `cautions`, `assumptions`,
  `success_checks`, and `unresolved_questions`. A body must be one JSON object:
  markdown fences and leading/trailing prose are rejected, as are unknown or
  missing fields, malformed lists, control characters, sensitive material, and
  raw stack frames from Node, Python, Go, or Rust. Ordinary prose that is not a
  raw frame remains accepted.
- Public `validateEnvelopeV2` recomputes the checkpoint digest with
  `computeCheckpointDigestV2`, checks task/checkpoint identity and revisions,
  requires `expected_build_identity` to equal `receipt.build_identity`, and
  requires a successful attempt's route effort to equal `receipt.effort`.
  `receiptV2` and the V2 builders enforce equality with the generated
  **ADVISOR_BUILD_IDENTITY**.
- V2 controller envelopes preserve correlation/task/checkpoint identity,
  revisions, checkpoint digest, receipt/build identity, attempt summaries, and
  sanitized failures. V1 remains an explicit compatibility path; Phase 04
  adds no retry or provider-switch behavior.
- Evidence: 118/118 advisor-controller tests passed in approximately 7.3
  seconds; `npm run build` and `npm run release:check` exited 0. Astra's
  post-fix sign-off is 8/10; all four critical correspondence/RAW_STACK
  issues are resolved. Sol mentor counsel records the Phase 05 preconditions.
  No paid mentoring-quality claim is made.

### 2026-09-08 — feat(advisor): qualify adapters, enforce strict terminal parsing, and adapt generation limits (phase-03)

**Status:** Complete (100%)  
**Plan:** [Phase plan](../plans/260907-1208-advisor-mentoring-recovery-audit/phase-03-adapter-qualification-and-terminal-parsing.md)

- Qualified the fixed Claude, Pi, OMP, and Codex adapter contracts for exact
  model/effort routes, noninteractive isolated sessions, read-only/no-tool
  controls, bounded machine-readable output, and typed failures. Antigravity
  remains an explicit unavailable candidate rather than an inferred backend.
- Claude now rejects nonempty `permission_denials`, tool/nonterminal stop reasons,
  model drift, malformed result envelopes, and over-limit output.
- Pi now requires strict user-then-assistant message sequencing, exact route and
  workspace attestation, a settled terminal lifecycle, and
  `stopReason: "stop"` before returning advice.
- OMP now requires affirmative redacted usage readiness: a matching usable
  report plus positive provider capacity. Its strict parser rejects tool
  results, retries, unknown events, and undocumented `advisor_yielded`.
- Codex now validates exact auth/model/effort capability probes and a complete
  terminal JSONL thread/item lifecycle with no disallowed tool or side-effect
  items.
- All enabled adapters use `resolveInvocationLimits`; generation mode removes
  `timeoutMs` while retaining bounded streams, output, termination, and warning
  controls. Probes keep finite deadlines.
- Focused Claude, Pi, OMP, fixture, runner, and controller coverage records the
  rejection and generation-limit contracts without claiming live vendor or paid
  route qualification.

## Historical entries

Older phase detail is preserved in the [project changelog archive](./project-changelog-archive.md).
The current changelog remains the maintained phase mirror for the active milestone.
