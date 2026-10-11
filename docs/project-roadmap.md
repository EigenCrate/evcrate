# Project Roadmap

**Baseline:** `evcrate@2.11.0` (private Node/TypeScript package, Node `>=22.19.0`).
**Target Topology:** `3.0.0-rc.1` (channel: `next`) / `3.0.0` (stable on `main`).
**Status:** Unified `evc-*` naming and `AGENTS.md` instructions across all harnesses milestone:
Phases 01–11 complete per the [project changelog](./project-changelog.md); VS Code plugin identity and container-aware command mapping cutover complete.
**Updated:** 2026-10-12
**Advisor subsystem retirement progress:** 100% (7/7 phases complete — 2026-10-11; Phase 01 interface freeze DONE 2026-10-11T07:08:04+07:00; Phases 02–07 DONE 2026-10-11; portable Linux/repo verification complete; Review Cycle 2 approved 9.8/10). Native GUI/Windows host boundaries remain host-dependent.
**VS Code plugin identity & container-aware command mapping:** 100% (completed 2026-10-11). Plugin identity is `evc`; VS Code command skills use local `cmd-*` names within that container, while canonical and other-target commands retain `evc-cmd-*` (see [project changelog](./project-changelog.md)). These results do not claim live editor qualification or release publication.

**Filesystem-policy cutover progress:** 100% (2/2 phases complete; Phase 01 DONE 2026-09-27; Phase 02 DONE 2026-09-27; review approved 9.6/10; user approved). Cutover plan complete; broader operator release deployment matrix remains release-gated.

**Evidence source:** [project changelog](./project-changelog.md), current package scripts, and [system architecture](./system-architecture.md). Historical Windows release-phase plans and reports are not retained in this repository.
This roadmap distinguishes implementation gates recorded in the repository from
operator/release work that has not been claimed. `docs/project-changelog.md` is the
maintained phase mirror for this package; root `CHANGELOG.md` is semantic-release
output and is not the phase evidence authority.

## Current baseline

The source cutover retains the TypeScript control plane and seven persisted target
IDs, with six shared-registry adapters plus separately routed VS Code Local.
Target definitions/resource registry remain schema 2; BuildManifest is v3,
publication journal v4 and marker v3 are harness-only. One scoped transaction
preserves ownership, CAS, rollback, recovery, generic JSON/resources/imports/scopes,
installed-root native context, privacy/scout hooks, and main-session inline interview.
Generated projections derive from canonical sources and target policy, never hand edits.
Portable Linux/repo generation, build, distribution parity, and sandbox fresh/upgrade/interrupted recovery verification of this controller-free cutover are complete as of 2026-10-11 (Review Cycle 2 approved 9.8/10); native GUI/Windows/live-model host qualification remains host-dependent.

## Phase and gate status

| Phase/gate | State | Evidence or boundary |
|---|---|---|
| Protocol and filesystem foundations | Implemented in source | Strict bounded JSON, canonical hashing, safe paths, locks, staging, CAS, and recovery modules are present under `src/`. |
| Phase 9 packed consumer/adapter work | Historical evidence recorded | The changelog records packed-consumer contracts; it does not claim live Agent Store release or current target qualification. |
| Phase 10 TypeScript cutover | Historical evidence recorded | The changelog records TypeScript authority and per-target cutover receipts; current `package.json` routes build/check/publish actions through the compiled CLI. |
| Phase 11 validation and staged rollout | Historical evidence recorded | The changelog records consumer validation and staged-rollout gates; it does not claim live vendor qualification, npm publication, deployment, or main-branch merge. |
| Advisor subsystem retirement — Phases 01–07 | DONE (2026-10-11; 7/7 phases, 100%; Review Cycle 2 approved 9.8/10) | Completed in dedicated cutover worktree and merged to repository baseline (see [system architecture](./system-architecture.md#advisor-subsystem-retirement-boundary) and [project changelog](./project-changelog.md)); retired checkpoint/activation/relay/viewer/evaluation/metrics/settings/health surfaces, shipped controller-free BuildManifest v3 / journal v4 / marker v3 with strict historical recovery, clean inline `/evc-cmd-advise` across seven targets (140 canonical resources), and completed portable Linux/repo verification. Native GUI/Windows host boundaries remain host-dependent. |
| VS Code Local Native qualification — Phase 08 | DONE (2026-10-04; review approved 9.4/10; user approved; commit `cbd298a4`) | Historical [index](../plans/261002-2213-vscode-local-native-support/reports/native-local/qualification-index.md) reconciles 50 capability rows and 12 contexts for that candidate. It is not current cutover/native interview qualification. |
| VS Code Local documentation & rollout — Phase 09 | DONE (2026-10-04; review approved; report `phase-09-rollout-and-lifecycle-report.md`) | [Phase 09 Spec](../plans/261002-2213-vscode-local-native-support/phase-09-documentation-and-rollout.md) and [Rollout Report](../plans/261002-2213-vscode-local-native-support/reports/phase-09-rollout-and-lifecycle-report.md); delivers support matrix (12 contexts), quickstart, coexistence with Copilot CLI, bounded recovery runbook, and lifecycle stop triggers for undated Local retirement. |
| VS Code plugin identity & container-aware command mapping | DONE (2026-10-11; 100%; Cycle 2 review 10/10) | Plugin `evc`; local command skills `cmd-*`, including nested `cmd-plan-x-fast`; canonical/other-target `evc-cmd-*` unchanged. Help discovery, projected paths, command invocations, and wildcard references migrated (see [project changelog](./project-changelog.md)). Live editor qualification and operator rollout remain separate. |
| Documentation centralization | Current gate | Distribution, resource, native-context, and publication contracts are centralized in the maintained core docs. |
| Filesystem-policy cutover — Phase 01 | DONE (2026-09-27; 1/2 phases, 50%) | Historical summary in the [project changelog](./project-changelog.md): direct-launch publication/install, file-kind-separated registry/import identity, and required staging chmod failures. Source plan/review artifacts are not retained. |
| Filesystem-policy cutover — Phase 02 | DONE (2026-09-27; 2/2 phases, 100%) | Historical summary in the [project changelog](./project-changelog.md): schema-3 journal writing, strict schema-1/2 recovery, mode-free registry/import capability derivation, and shell-free Windows client dispatch. Current journal writing is v4; historical proof is not new qualification. |

| Build-command unblocking — Phases 01–04 | DONE (2026-09-07) | [Plan](../plans/260906-2125-unblock-build-commands-evcrateignore/plan.md), [Phase 04 verification](../plans/260906-2125-unblock-build-commands-evcrateignore/phase-04-verification-and-regression-testing.md), [test evidence](../plans/reports/tester-260907-0209-unblock-build-commands-phase-04.md), and [code review](../plans/reports/code-review-260907-0209-unblock-build-commands-phase-04.md); six focused suites pass 299/299, distribution parity is clean across seven adapters, and the bounded canonical/projected/published OMP matrix passes 21/21 (63 evaluations). |
| Command and skill catalogs — Phase 01 | DONE (2026-09-07) | [Plan](../plans/260906-2300-scan-command-skill-catalogs/plan.md) and [Phase 01 evidence](../plans/260906-2300-scan-command-skill-catalogs/phase-01-canonical-metadata-and-scanner-contracts.md); 70 commands and 36 non-template skills normalized, strict multi-format scanner contracts delivered, and focused scanner/help tests pass 24/24. |
| Command and skill catalogs — Phase 02 | DONE (2026-09-07) | [Phase 02 plan](../plans/260906-2300-scan-command-skill-catalogs/phase-02-catalog-data-schema-and-freshness.md), [test report](../plans/reports/tester-260907-0152-catalog-regression-freshness.md), and [code review](../plans/reports/code-review-260907-0153-phase-02-catalog-schema-freshness.md); strict schemas, canonical source identity, atomic generation, freshness validation, and fail-closed regressions complete; focused evidence passes 26/26 with freshness confirmed. |
| Command and skill catalogs — Phase 03 | DONE (2026-09-07) | [Phase 03 plan](../plans/260906-2300-scan-command-skill-catalogs/phase-03-seven-target-scanner-and-catalog-adapters.md), [test report](../plans/reports/tester-260907-0959-phase-03-seven-target-adapters.md), and [code review](../plans/reports/code-review-260907-1004-phase-03-seven-target-scanner-and-catalog-adapters.md); seven-target scanner/layout adapters and authoritative native mappings complete; foreign-CWD, unmanaged-resource isolation, fail-closed validation, and parity checks pass 37/37. Review has no critical issues; non-blocking output-containment and symlink-hardening follow-ups remain. |
| Command and skill catalogs — Phase 04 | DONE (2026-09-07) | [Phase 04 plan](../plans/260906-2300-scan-command-skill-catalogs/phase-04-regeneration-documentation-and-release-gates.md), [validation report](../plans/reports/tester-260907-1123-phase04-validation-matrix.md), and [final code review](../plans/reports/code-review-260907-1457-phase-04-final-post-fixes.md); regeneration, scanner/generator documentation, and release gates complete; focused gates pass 85/85, the seven-target foreign-CWD matrix passes 35/35, and `npm run distribute:check` returns `status: "ok"`. |
| Hook materialization scope distribution — Phase 01 | DONE (2026-09-12; 100%) | Historical CLI/protocol milestone for scalar scope, publication/recovery wire contracts, phase correlation, and exit category 5. Current harness-only failure semantics follow the approved freeze. |
| Hook materialization scope distribution — Phase 02 | DONE (2026-09-12; 100%) | [Phase 02 plan](../plans/260912-0051-hook-materialization-scope-distribution/phase-02-context-and-manifest-project-bindings.md) and [review](../plans/reports/advisor-260912-1035-phase02-context-and-manifest-project-bindings.md); normalized manifest-derived project bindings, overlap rejection, canonical owner-controlled project identity, and unchanged projection context. Evidence: 174/174 tests and `distribute:check` status `ok`. |
| Hook materialization scope distribution — Phase 03 | DONE (2026-09-12; 100%) | [Phase 03 plan](../plans/260912-0051-hook-materialization-scope-distribution/phase-03-neutral-seven-target-runtime-closures.md); completed seven neutral installation-relative runtime closures and structured target-owned HOME rules, including fail-closed child validation and workspace cwd/env separation. Evidence: build; adapters 24/24; source-derived publication 54/54; integration 14/14; full source-derived suite passed. |
| Hook materialization scope distribution — Phase 04 | DONE (2026-09-12; 100%) | Historical one-snapshot planning milestone with strict scope bindings, order, contained roots/documents, ownership, merge/CAS/bounds, and preflight-before-read checks. |
| Hook materialization scope distribution — Phase 05 | DONE (2026-09-13; 100%) | Historical generic transaction engine milestone: scope-bound descriptors, preflight, workspace identity/containment, same-volume checks, journal/fsync/marker ordering, retention, and recovery/error boundaries. Current v4 crash ordering follows the approved freeze. |
| Hook materialization scope distribution — Phase 06 | DONE (2026-09-13; 100%) | Historical scope-isolated state/recovery and ownership-pinned predecessor-file cleanup milestone. Current writes use journal v4/marker v3 with strict old-format recovery. |
| Hook materialization scope distribution — Phase 07 | DONE (2026-09-13; 100%) | Historical focused protocol, adapter, publication, recovery, context, primitive, and installed integration proof; no current cutover qualification claim. |
| Hook materialization scope distribution — Phase 08 | DONE (2026-09-13; 100%) | Historical installed Linux fixtures covered installation HOME noninteraction, separate project destination, foreign-workspace entrypoints, scoped rollback/recovery, and package snapshot invariance. Current candidate acceptance must be re-exercised. |
| Hook materialization scope distribution — Phase 09 | DONE (2026-09-13; 100%) | Historical operator documentation milestone for CLI/destinations, scoped recovery, and installer distinction. Current architecture follows the approved harness-only cutover. |
| Live vendor qualification | GATED — operator authorization required | Each enabled installed CLI needs a bounded non-sensitive Linux qualification after upgrades. Deterministic tests do not authenticate a vendor. |
| Release publication/rollout | Pending operator gate | npm publication, deployment, rollout, and final release remain explicitly separate from repository contracts. |
| Windows validation | COMPLETE (2026-09-15) | [Master plan](../plans/260914-0636-windows-release-qualification/plan.md), [Phase 09 verification](../plans/reports/tester-260915-1119-phase-09-integrated-qualification.md), [Phase 10 documentation cutover](../plans/260914-0636-windows-release-qualification/phase-10-post-proof-documentation-and-support-cutover.md); build-once handoff, 4-row matrix (`windows-2025` x64, Windows PowerShell 5.1 and PowerShell 7, Node 22.19.0 and 24.21.0), publisher-only write, automatic predecessor transitions, and seven-file byte identity proven. Bounded support cutover complete; runtime/desktop/signing exclusions remain. |

### Windows release qualification milestone

| Milestone | Progress | Evidence / next gate |
|---|---:|---|
| Windows release qualification | **100% (10/10 phases complete)** | Historical [master plan](../plans/260914-0636-windows-release-qualification/plan.md) qualified its immutable candidate across `windows-2025` x64 PowerShell 5.1/7 × Node 22.19.0/24.21.0 for installer lifecycle and `version --json`. It does not qualify this cutover. Runtime, desktop/UAC/SmartScreen/Authenticode/enterprise-policy, and live native qualification remain outside that support boundary. |

Phase 04 freezes the predecessor handoff consumed by later candidate/harness phases:
`buildWindowsTestReleaseSet` builds the archive and real `install.ps1` entrypoint
through shared release authorities with a fixed metadata timestamp. The resolver
enumerates bounded non-draft stable releases, requires the exact Windows archive
and installer labels plus exact-four byte verification, and downloads only the ZIP,
sidecar, release metadata, and installer into a private staging directory. Before
qualification it emits deterministic `bootstrap-fixture` `1.0.0` bytes with the
fixed `a`×40 source identity; after qualification history exists, an unqualified
latest stable release, missing/tampered asset, duplicate label, or API/token
failure is terminal—no older or bootstrap fallback. The normalized handoff is
`{kind, version, tag, sourceCommit, files, directory}`. This remains internal
fixture/release evidence; it does not qualify native Windows runtime support.

Phase 05 completes the self-contained Windows qualification harness. The
Node-builtins-only CLI freezes strict host/receipt/byte preflight, safe
PowerShell and `cmd.exe` invocation, path-with-spaces smoke/full lifecycle
transitions, isolated negatives, immutable-state observers, and exact user
`PATH` restoration. Scoped evidence is 60/60 checks with Cycle 2 review approval
at 10/10. These host-independent checks do not claim native Windows execution.
**Phase 06 — Canonical Semantic-Release Candidate, Receipt, and Publisher —
Completed (2026-09-14; 100%)** supplies the candidate, receipt, and verify-only
publisher boundary with 47/47 distribution tests and 10/10 review approval.
**Phase 07 — Release Workflow Producer, Native Matrix, and Publisher Split —
Completed (2026-09-15; 100%)** adds the least-privilege `release.yml` producer,
four fixed Windows rows, exact-ID handoff, and success-only publisher. Static
workflow checks and release orchestration passed 12/12.
**Phase 08 — Unprivileged Windows PR Smoke and Qualified Asset Labels —
Completed (2026-09-15; 100%)** adds the read-only PR/manual smoke, diagnostic
fixture build/exact-seven verification, explicit `pwsh.exe`, exact labels, and
WRQ-042–044 contract coverage. Phase 09 completed integrated qualification, failure routing, predecessor transition, rerun boundaries, and final seven-file byte identity; Phase 10 owns bounded docs/support cutover.

**Phase 09 — Integrated Qualification, Failure Routing, and Release-Byte Verification — Completed (2026-09-15; 100%)** closes WRQ-047–052 and WRQ-059. Evidence: [integrated qualification report](../plans/reports/tester-260915-1119-phase-09-integrated-qualification.md) and [suite validation report](../plans/reports/tester-260915-1119-phase-09-suite-validation.md).

**Phase 10 — Post-Proof Documentation and Bounded Support Cutover — Completed (2026-09-15; 100%)** closes WRQ-006, WRQ-045–046, and WRQ-054. Documentation across `README.md` and the five core docs reflects the proven build-once candidate, four-lane matrix, publisher-only write, and exact installer/version support boundary while retaining all named runtime, signing, desktop, and live vendor exclusions.

## Immediate next gates

Historical Hook Materialization Scope Distribution evidence remains dated in its
plans/reports and changelog; those counts are not current verification.

1. **Use canonical source.** Change `.evcrate/source/.claude/` or a declared target
   overlay, never generated projection trees.
2. **Regenerate/build.** Use established npm/Node scripts; check schema-2 target
   definitions/registry and strict BuildManifest v3 hashes, owners, and policies.
3. **Review publication.** In disposable roots, inspect dry-run managed/unmanaged
   changes before applying only a verified current harness build.
4. **Exercise recovery.** Verify interrupted promotion, physical/byte CAS,
   scope isolation, v4 identity/journal ordering, and strict predecessor recovery.
5. **Qualify native entrypoints.** Exercise current installed commands and inline
   interviews on real hosts with supported tools/model access. Generated output,
   portable tests, and historical host rows do not prove native qualification.
6. **Review target boundaries.** Preserve seven targets, native instruction loaders,
   Pi settings/delegation, OMP admission, VS Code registration, and privacy/scout hooks.

## Unified naming, AGENTS.md authority, and release promotion milestone

The unified naming and instruction authority refactoring is implemented across all seven targets:
- **Canonical command & agent naming:** All 70 canonical commands follow `/evc-cmd-*` (nested with reserved separator `-x-`, length <= 64), 17 canonical agents follow `evc-*`, and Copilot skills/styles follow `evc-<skill>` and `evc-style-<style>`. Enforced by `src/adapters/resource-naming.ts` and `.evcrate/source/.claude/scripts/scan_commands.py`. VS Code projects commands as container-local `cmd-*` skills under plugin identity `evc`, with `/cmd-*` invocations and `skills/cmd-*/SKILL.md` references; other targets retain `evc-cmd-*`.
- **Single instruction authority:** Authored strictly in `.evcrate/source/.claude/AGENTS.md`; root Codex `AGENTS.md` is generated. All targets consume canonical instructions without aliases or CLAUDE shims.
- **Publication upgrade & leftover reporting:** Ownership markers control pruning; untracked legacy leftovers are reported across 5 canonical kinds; unmanaged collisions refuse publication (`PUBLICATION_FAILED`).
- **Release pipeline:** `.releaserc.json` and `.github/workflows/release.yml` support dual-branch promotion (`next` prerelease candidate -> `main` stable release) with candidate mirror seeding and maintainer approval evidence validation.
## Open gaps and decisions

- **Command enforcement:** Canonical `evc-cmd-*` naming and `-x-` nesting remain enforced by `src/adapters/resource-naming.ts` and `.evcrate/source/.claude/scripts/scan_commands.py`; VS Code maps commands to container-local `cmd-*` under plugin `evc`.
- **Current acceptance:** Portable Linux/repo generators, build, tests, and sandbox installed fresh/upgrade/interrupted recovery for the controller-free cutover are completed as of 2026-10-11 (Review Cycle 2 approved 9.8/10). Live native GUI/Windows host execution and vendor/model qualification remain host-dependent gates.
- **Native availability:** Missing GUI/native host, model access, or safe report-write capability leaves the affected row unqualified; preserve host-dependent safety limits.
- **Contract coverage:** Preserve generic JSON/resources/imports/scopes, publication CAS/locks/rollback/recovery, installed-root transport, privacy, and historical protected-progress behavior.
- **Release authority:** Keep `docs/project-changelog.md` as the phase mirror and
  resolve its historical open question before release tagging.
- **Support scope:** Standalone Windows installer lifecycle and version verification are qualified (Phases 01–10); obtain separate evidence before widening support claims to broader Windows runtime equivalence, desktop/signing environments, or operator rollout.
- **Metrics:** Retain contract evidence by phase, but do not copy unexplained test
  totals into new documentation.

## Related documents
- [Agent guidance](../AGENTS.md)
- [System architecture](./system-architecture.md)
- [Project overview and PDR](./project-overview-pdr.md)
- [Code standards](./code-standards.md)
- [Codebase summary](./codebase-summary.md)
- [Project changelog](./project-changelog.md)
- [Project changelog archive](./project-changelog-archive.md)
- [Pre-Upgrade Backup & Leftover Guidance](./upgrade-backup-and-leftover-guidance.md)
- [Pi-native migration](./pi-native-migration.md)
- [Snyk specialist guide](./snyk-expert-cli.md)
