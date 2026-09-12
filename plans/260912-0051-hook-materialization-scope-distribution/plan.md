---
title: "Hook Materialization Scope Distribution"
description: "Add scope-aware hook publication while keeping shared infrastructure HOME-owned and one neutral verified build authoritative."
status: in-progress
priority: P2
effort: "not estimated"
branch: main
tags: [feature, distribution, publication, recovery, security]
created: 2026-09-12
updated: 2026-09-12
---

# Hook Materialization Scope Distribution

## Current baseline and planned outcome

Current live architecture is HOME-only: `createPublicationPlan` combines the shared controller and HOME harness bindings in one schema-1 transaction. `--project-root` supplies invocation context, not a destination. Generated wrappers still contain HOME lookups or workspace-ancestor searches. `docs/system-architecture.md` remains authoritative for that current behavior until implementation is proven.

Planned outcome: `--scope home|project` selects only harness destination, defaulting to `home`. Shared `.evcrate/bin` always publishes beneath `--home`. One current verified neutral schema-2 snapshot feeds ordered `shared` and `harness` phases. HOME uses one atomic transaction/release; project uses a committed shared HOME release followed by an independent project harness release and reports a structured partial result if only the latter fails.

Future contracts are frozen in [design-contracts.md](./design-contracts.md); requirement-to-proof traceability is in [acceptance-matrix.md](./acceptance-matrix.md).

## Status and dependency roadmap

| Phase | Boundary | Status | Depends on | Unlocks |
|---|---|---|---|---|
| [01](./phase-01-cli-and-protocol-contract.md) | CLI, exact wire, partial result, correlation | **DONE (2026-09-12)** — 100% | Research baseline | 02, 04, 06, 07 |
| [02](./phase-02-context-and-manifest-project-bindings.md) | Normalized project descriptors and identity boundary | **READY (2026-09-12)** — 0% | 01 wire names | 03, 04, 05 |
| [03](./phase-03-neutral-seven-target-runtime-closures.md) | Seven neutral runtime closures and structured HOME rules | Pending | 02 descriptor contract | 04, 07, 08 |
| [04](./phase-04-one-snapshot-phase-planning.md) | One snapshot; shared/HOME/project phase plans | Pending | 01–03 | 05, 06, 07 |
| [05](./phase-05-generic-transaction-engine.md) | Generic transaction descriptor, locks, fsync, retention | Pending | 02, 04 | 06, 07 |
| [06](./phase-06-state-migration-recovery-and-partial-orchestration.md) | Schema 2, migration, isolated recovery, partial orchestration | Pending | 01, 04, 05 | 07, 08 |
| [07](./phase-07-focused-contract-and-runtime-proof.md) | Focused protocol/adapter/publication/recovery proof | Pending | 01–06 | 08 |
| [08](./phase-08-installed-release-fixtures-and-regeneration.md) | Installed Linux fixtures and checked-in regeneration | Pending | 03, 06, 07 | 09 |
| [09](./phase-09-post-verification-operator-documentation.md) | Live-current operator docs after proof | Pending | 08 full verification | Completion |

Critical path: `01 → 02 → 03 → 04 → 05 → 06 → 07 → 08 → 09`. Phase 04 protocol-facing design may begin after 01–02, but integration waits for Phase 03’s materialization rules.

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
