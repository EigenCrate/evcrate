---
title: "Hook Materialization Scope Distribution"
description: "Add scope-aware hook publication while keeping shared infrastructure HOME-owned and one neutral verified build authoritative."
status: completed
priority: P2
effort: "not estimated"
branch: main
tags: [feature, distribution, publication, recovery, security]
created: 2026-09-12
updated: 2026-09-13
completed: 2026-09-13
---

# Hook Materialization Scope Distribution

## Current baseline and planned outcome

Publication remains HOME-owned for shared infrastructure: `createPublicationPlan` still combines the shared controller and HOME harness bindings in the current publication path. Phase 03 closes canonical runtime lookup and structured HOME rules in source; generated wrappers/metadata remain a Phase 08 regeneration boundary. `--project-root` supplies invocation context, not a destination, and `docs/system-architecture.md` remains authoritative for publication behavior until the later phases are proven.

Planned outcome: `--scope home|project` selects only harness destination, defaulting to `home`. Shared `.evcrate/bin` always publishes beneath `--home`. One current verified neutral schema-2 snapshot feeds ordered `shared` and `harness` phases. HOME uses one atomic transaction/release; project uses a committed shared HOME release followed by an independent project harness release and reports a structured partial result if only the latter fails.

Future contracts are frozen in [design-contracts.md](./design-contracts.md); requirement-to-proof traceability is in [acceptance-matrix.md](./acceptance-matrix.md).

## Status and dependency roadmap

| Phase | Boundary | Status | Depends on | Unlocks |
|---|---|---|---|---|
| [01](./phase-01-cli-and-protocol-contract.md) | CLI, exact wire, partial result, correlation | **DONE (2026-09-12)** — 100% | Research baseline | 02, 04, 06, 07 |
| [02](./phase-02-context-and-manifest-project-bindings.md) | Normalized project descriptors and identity boundary | **DONE (2026-09-12)** — 100% | 01 wire names | 03, 04, 05 |
| [03](./phase-03-neutral-seven-target-runtime-closures.md) | Seven neutral runtime closures and structured HOME rules | **DONE (2026-09-12)** — 100% | 02 descriptor contract | 04, 07, 08 |
| [04](./phase-04-one-snapshot-phase-planning.md) | One snapshot; shared/HOME/project phase plans | **DONE (2026-09-12) — 100%** | 01–03 | 05, 06, 07 |
| [05](./phase-05-generic-transaction-engine.md) | Generic transaction descriptor, locks, fsync, retention | **DONE (2026-09-13) — 100%** | 02, 04 | 06, 07 |
| [06](./phase-06-state-migration-recovery-and-partial-orchestration.md) | Schema 2, migration, isolated recovery, partial orchestration | **DONE (2026-09-13) — 100%** | 01, 04, 05 | 07, 08 |
| [07](./phase-07-focused-contract-and-runtime-proof.md) | Focused protocol/adapter/publication/recovery proof | **DONE (2026-09-13) — 100%** | 01–06 | 08 |
| [08](./phase-08-installed-release-fixtures-and-regeneration.md) | Installed Linux fixtures and checked-in regeneration | **DONE (2026-09-13) — 100%** | 03, 06, 07 | 09 |
| [09](./phase-09-post-verification-operator-documentation.md) | Live-current operator docs after proof | **DONE (2026-09-13) — 100%** | 08 full verification | Completion |

Critical path remains `01 → 02 → 03 → 04 → 05 → 06 → 07 → 08 → 09`. Phase 04 protocol-facing design may begin after 01–02; Phase 03 materialization rules are now finalized, and subsequent integration depends on Phases 04–07 before Phase 08 regeneration.

## Phase 03 completion record

Phase 03 is complete after approved Claude/Gemini corrections and focused validation. The phase plan records the seven installation-relative runtime closures, structured target-owned HOME rules, Claude manifest association, strict Gemini declared-settings parsing, publication target-order correlation, and regressions in the adapter, publication-plan, and publication-parity suites.

Source-derived temporary validation passed `npm run test:publication` 54/54 and `npm run test:integration` 14/14 after manifest generation in an isolated copy; `npm run build` and `npm run test:adapters` (24/24) also passed. A complete source-derived `npm test` run passed after isolated manifest and release-asset preparation. Direct canonical publication/integration checks may report stale checked-in generated metadata; generated projections, `.evcrate/build-manifest*.json`, `.evcrate/targets/manifest.json`, registry, and release artifacts remain Phase 08-owned and untouched.

## Phase 04 completion record

Phase 04 is complete at 100% after final authorized-scope review approval with no findings. One aggregate schema-2 `VerifiedCurrentBuild` and digest is resolved once and passed immutably to ordered shared and harness phase planners. Shared controller materialization remains fixed beneath `<home>/.evcrate/bin`; HOME uses strict target mappings and declaration order, with only the valid Gemini `.gemini` → Antigravity `.gemini/config` nesting; project directory/document bindings remain neutral and contained under the canonical project root.

Planning preserves selected-target ownership and stale cleanup bounds, shared JSON merges and user-owned bytes, hashes, modes, CAS snapshots, immutable defensive operation bytes, transformed/merged file-size bounds, and duplicate planned-destination rejection. Complete overlap/path preflight occurs before destination reads. Advisor correction state completed after user-approved bounded corrections. The final blocking code review verdict is approve with no findings.

Deterministic repository evidence: `npm run build` passed; focused `node --test tests/distribution/publication-plan.test.mjs tests/distribution/publication-parity.test.mjs` passed 8/8; `npm run test:publication` passed 57/57; `npm run test:adapters` passed 24/24; `npm run distribute:check` returned `status: "ok"`. The tester subagent could not execute because its external Cloud Code Assist backend returned HTTP 429; the direct commands above are the evidence. Live operator/vendor qualification and publication remain deferred; generated outputs remain Phase 08-owned and `docs/system-architecture.md` remains Phase 09-owned.

Handoff proceeds to Phase 05 generic transaction execution, Phase 06 schema-2 state/recovery and partial orchestration, and Phase 07 focused contract/runtime proof.

## Phase 05 completion record

Phase 05 is complete at 100% after the approved blocking review correction and finalization. The generic immutable transaction descriptor/engine now covers HOME and project publication with preflight-before-mutation, HOME-then-project locking, durable journal-before-workspace ordering, workspace identity/containment and same-volume checks, fsync/marker ordering, bounded HOME retention with project no-retention cleanup, and distinct recovery/error outcomes. Existing schema-1 HOME recovery compatibility remains required; schema-2 migration, isolated recovery, and partial orchestration remain Phase 06-owned.

Verified evidence: `npm run build` passed; `npm run test:publication` passed 66/66; `npm run test:integration` passed 14/14; focused recovery and oversized-result regressions passed. The review correction was resolved in the advisor state gate at revision 11, and the user approved finalization. Generated projections, manifests, registries, and live operator architecture docs remain outside Phase 05 and were not hand-edited.

Handoff proceeds to Phase 06 for schema-2 state migration, isolated recovery, and partial orchestration. Phase 07 remains the subsequent focused contract/runtime proof gate.

## Phase 06 completion record

Phase 06 is complete at 100% after the blocking review corrections were applied in the authorized source/tests and approval was granted. The implementation covers schema-2 binding/phase validation, project-root binding before HOME mutation, locked replanning after HOME recovery, durable ownership-pinned legacy cleanup retry, same-volume preflight, and focused regressions.

Verified evidence: `npm run build` passed. Local focused tests passed individually: recovery 19/19, apply 12/12, publication-plan 6/6, and CLI publication 6/6. The mandatory tester agent could not execute because its provider returned HTTP 429 before commands; no tester-agent execution is claimed.

Final blocking review approved; user approved finalization. Handoff proceeds to Phase 07 focused contract/runtime proof.

## Phase 07 completion record

Phase 07 is complete at 100% after the focused proof gate. Focused gates passed: build; protocol 21/21; CLI/context 47/47; primitives 31/31; adapters 26/26; publication 77/77; integration 14/14; cutover 7/7; and direct `distribute:check` returned `status: "ok"`. The mandatory tester passed five targeted checks; terminal code review approved with no findings; advisor reconciliation approved finalization and completed at state revision 11.

Canonical regeneration ran through `distribute:build`, `generate:registry`, and `generate:manifests` to restore controller-manifest hash integrity after user-owned controller edits blocked the focused proof. Canonical `.evcrate/build-manifest-omp.json` digest at handoff: `9f393f60d9e8a7ae3e45deae5a39a304636f9c0aa88f1fcb801744320addc5d3`. Phase 08 remains responsible for installed Linux fixtures, release/installer verification, and any regeneration required by its own changes.

Handoff proceeds to Phase 08 for installed Linux fixtures, release/installer/rollout gates, and full-suite verification. Phase 09 remains pending.

## Phase 08 completion record

Phase 08 is complete at 100%. Installed Linux fixtures and checked-in regeneration are verified:
- Extended `verifyInstalledLauncherAndInvariance` to prove HOME non-mutation on install, all-seven HOME publication with shared controller, project publication to separate project directory without project controller, runtime entrypoint execution across all seven targets from third workspace, partial failure rollback and recovery isolation, and package snapshot byte invariance throughout.
- Modularized installed assertions into `scripts/release/installed-lifecycle-assertions.cjs` (< 200 LOC).
- All release gates passed sequentially: `npm run distribute:build`, `npm run generate:registry`, `npm run generate:manifests`, `npm run distribute:check`, `npm run test:release` (10/10), `npm run test:installer:linux` (15/15), `npm run test:validation-rollout` (6/6), `npm run test:distribution:rollout` (5/5), and full test suite (512/512).
- Terminal code review approved (Verdict: PASS) with zero blockers and full A43–A49 compliance.
- Handoff proceeds to Phase 09 for live operator and architecture documentation.

## Phase 09 completion record

Phase 09 is complete at 100%. Live operator and architecture documentation updated after full implementation proof, release gate verification, and complete test suite pass:
- Reconciled final code against design contracts and Phase 08 evidence.
- Updated `README.md` with operator CLI examples (`--scope home|project`, `--home`, `--project-root`, `--target`, recovery), seven-target destination matrix, shared controller HOME invariant, partial failure semantics (`PUBLICATION_FAILED`/`ROLLBACK_FAILED`, exit 5), quiescence runbook, and explicit distinction between installer rollback and publication recovery.
- Updated `docs/system-architecture.md` with build-to-publication dataflow diagram, two-phase transaction execution, HOME-then-project lock ordering, preflight-before-mutation checks, schema-2 state roots, and scope-isolated recovery.
- Updated `docs/project-overview-pdr.md` with observable functional requirements for scope-aware publication (FR-10), partial exit codes, and Linux-only qualification status.
- Updated `docs/code-standards.md` with enforceable architectural bans and two-phase transaction standards.
- Updated `docs/codebase-summary.md` with exact current symbols, test suites, descriptor types, and scope distribution summary.
- Updated `docs/pi-native-migration.md` with scope-aware publication commands, extension-derived root derivation, and `PI_CODING_AGENT_DIR` runtime variable semantics.
- Updated `docs/project-roadmap.md` and `docs/project-changelog.md` with complete evidence traceability for Phases 05 through 09.
- Terminal code review approved (Verdict: PASS, Score: 10/10) with zero blockers and zero warnings.
- Plan completed. Remaining external gates (live vendor qualification, Windows runtime qualification, npm publication, deployment, rollout) remain operator-gated.

## Shared-file ownership and parallelization

| Surface | Primary owner | Parallel-safe work | Serialization rule |
|---|---|---|---|
| `src/cli/**`, `src/protocol/**` | Phase 01 | Phase 02 context types after wire names freeze | Phase 01 lands protocol exports before downstream callers |
| `src/context/**`, `src/manifests/{types,manifest}.ts`, target manifests | Phase 02 | Phase 03 adapter runtime code | Phase 03 owns publication-rule additions to manifests only after descriptor schema lands |
| `src/adapters/**`, Pi overlay runtime | Phase 03 | Phase 01 and early Phase 02 | One owner per target; no generated projection edits |
| `src/distribution/publication-rules.ts` | Phase 03 | Phase 04 planner reads frozen API | Phase 03 lands structured rules before Phase 04 consumes them |
| `src/distribution/publication-plan.ts`, `publication-inventory.ts`, `shared-json.ts` | Phase 04 | Phase 05 descriptor design | Phase 04 freezes plan interfaces before transaction work |
| `src/distribution/publication.ts`, `publication-recovery.ts`, `src/filesystem/locking.ts` | Phase 05 then Phase 06 | None on same symbols | Phase 05 lands generic engine; explicit handoff gives Phase 06 orchestration/migration ownership |
| Focused tests | Phase 07 | Split by protocol, adapter, publication, recovery files | Fixture shapes freeze in 01–06; no duplicate suites |
| Release assertion scripts and installed fixtures | Phase 08 | Generated outputs only after source proof | Archive/installer implementation files stay unchanged |
| Live docs | Phase 09 | None before Phase 08 proof | Update only after verified implementation and generated freshness |

## Cross-phase acceptance

1. CLI accepts scalar `--scope home|project`, defaults to `home`, and rejects it outside direct publish/recover and publication-bearing `distribute publish|all|recover`.
2. `--home` always owns shared infrastructure; `--project-root` selects only project harness destination; `--target` never filters shared HOME.
3. Exact requests/results carry scope and canonical project identity; ordered phase records correlate against their destination policy; top-level partial exits category 5.
4. Project bindings come only from normalized manifest output/additional roots and project documents. Mutation-grade identity/root validation happens at publication boundary; `ProjectionBuildContext` remains unchanged.
5. All seven projections are neutral. Installed wrappers find child resources from their own location while workspace environment/cwd remains active-project data. HOME materialization rewrites only validated structured fields.
6. Exactly one verified snapshot and digest feeds both phases. Shared planning always selects `.evcrate/bin`; harness planning preserves deterministic declaration order, managed ownership, JSON merges, hashes, modes, CAS, and stale cleanup bounds.
7. HOME is one atomic transaction/release. Project preflights both phases, holds HOME lock through shared commit and project harness, acquires project lock second, never reverses locks, and never compensates shared commit.
8. Schema 2 separates shared and HOME harness state. Valid schema 1 migrates under HOME lock; ambiguous state fails closed. Recovery never crosses requested scope.
9. Project harness failure rolls back only project work and yields `partial`; rollback failure preserves its journal and reports `ROLLBACK_FAILED`.
10. Release inventory, archive writers/verifiers, metadata, asset preparation, and installers keep one neutral snapshot. Linux installed fixtures prove HOME plus project publication and package-byte invariance.
11. Checked-in projections/manifests/registry regenerate only after canonical source changes and before final checks. Live docs update only after all proof passes.

## Assumptions

- Current manifest order is the deterministic target authority; each manifest’s `output_roots`/`project_docs` declaration order is preserved.
- Canonical project identity is lowercase SHA-256 over the validated canonical absolute directory-root string encoded as UTF-8; HOME identity is `null`.
- Existing `stateRoot` remains invocation-context state authority, independent of `--home` and project destination.
- Per-volume atomicity is the attainable boundary; cross-volume project orchestration intentionally exposes partial completion.
- External vendor discovery remains vendor-owned. Deterministic runtime closure proof is required; live vendor qualification remains a separate operator gate.
- Runtime qualification claims remain Linux-only. Windows archive construction stays supported but Windows runtime equivalence is not claimed.

## Non-goals and banned designs

- No project-local controller or project `.evcrate/bin`.
- No use of `--home` to emulate project scope; no change to shared HOME ownership.
- No ancestor project searches, wrapper child lookup from cwd, or HOME fallback for EVCrate-owned installed children.
- No arbitrary body/global text rewrite; only schema-validated registration/config command fields may change for HOME.
- No scope, HOME, lock, controller, or transaction fields in `ProjectionBuildContext`; no duplicate projection tree per scope.
- No reverse lock acquisition, cross-filesystem atomicity fiction, shared rollback/compensation, or premature HOME mutation before both plans/preflights pass.
- No hand edits to generated projections, registries, or build manifests.
- No scope variants in archive inventory, writers/verifiers, release metadata, `scripts/prepare-release-assets.cjs`, `install.sh`, or `install.ps1`; installers do not publish harnesses.
- No project recovery search or mutation of HOME state; no broad stale cleanup outside touched bindings.
- No Windows runtime qualification claim, npm publication, deployment, or rollout claim in this change.

## Planned verification sequence

After implementation only, sequentially:

```sh
npm run build
npm run distribute:check
npm run test:adapters
npm run test:publication
npm run test:integration
npm run test:cutover
npm run test:release
npm run test:installer:linux
npm run test:distribution:rollout
npm test
```

Regeneration occurs after canonical source changes and before final checks:

```sh
npm run distribute:build
npm run generate:registry
npm run generate:manifests
npm run distribute:check
```

No command above runs during planning.

## Unresolved questions

- None blocking. Implementation must re-open each named symbol before editing and fail closed if a legacy schema-1 marker cannot unambiguously split controller metadata from HOME harness ownership.
