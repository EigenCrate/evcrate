# Project Roadmap

**Status:** Current roadmap for package `2.1.0`; Hook Materialization Scope
Distribution is complete through Phase 09, and Windows release qualification is
complete through Phase 10 (10/10 phases, 100%; completed 2026-09-15).
**Updated:** 2026-09-18

**Advisor metrics explorer progress:** 30% (3/10 phases complete; Phases 01–03 DONE on 2026-09-18).

**Windows release qualification progress:** 100% (10/10 phases complete; Phases
01–10 DONE on 2026-09-15).
**Evidence source:** [project changelog](./project-changelog.md), current package scripts,
the [system architecture](./system-architecture.md), [Phase 09 integrated qualification](../plans/reports/tester-260915-1119-phase-09-integrated-qualification.md),
[Phase 09 suite validation](../plans/reports/tester-260915-1119-phase-09-suite-validation.md), and the [Phase 10 support cutover](../plans/260914-0636-windows-release-qualification/phase-10-post-proof-documentation-and-support-cutover.md)

This roadmap distinguishes implementation gates recorded in the repository from
operator/release work that has not been claimed. `docs/project-changelog.md` is the
maintained phase mirror for this package; root `CHANGELOG.md` is semantic-release
output and is not the phase evidence authority.

## Current baseline

The current source establishes a TypeScript control plane, seven fixed projection
adapters, schema-2 target/build manifests, a 33-file advisor controller closure,
advisor v2 contracts with explicit policy migration, canonical generated mentor
instructions, unified structured advice parsing, V2 envelope correspondence
validation, compatibility direct checkpoint counsel, bounded primary retry with
one-shot backup orchestration, durable task state and correction gates, the
canonical V2 mentoring dispatcher, honest seven-target mentoring capability
declarations, sanitized execution/outcome history, bounded history review tools,
and journaled publication/recovery. Phase 08 proves the real CLI lifecycle,
three-cycle review/correction boundaries, durable human handoff, and user-baseline
preservation. The npm package path is authoritative by default. Generated
projections and the shared controller are outputs of canonical source plus target
policy; they are not hand edited.

## Phase and gate status

| Phase/gate | State | Evidence or boundary |
|---|---|---|
| Protocol and filesystem foundations | Implemented in source | Strict bounded JSON, canonical hashing, safe paths, locks, staging, CAS, and recovery modules are present under `src/`. |
| Advisor controller contract | Implemented in source | The canonical `.evcrate/source/.evcrate/bin` closure contains the generated 33-file inventory, history contracts/store/query/prune modules, canonical runtime brief artifact, v2 contract validators, policy migration schema, compatibility checkpoint/controller path, runner, adapters, and envelopes. |
| Phase 9 packed consumer/adapter work | Historical evidence recorded | The changelog records packed-consumer and diagnostic adapter contracts; it does not claim live Agent Store/DamHopper release or target cutover. |
| Phase 10 TypeScript cutover | Historical evidence recorded | The changelog records TypeScript authority and per-target cutover receipts; current `package.json` routes build/check/publish actions through the compiled CLI. |
| Phase 11 validation and staged rollout | Historical evidence recorded | The changelog records consumer validation and staged-rollout gates; it does not claim live vendor qualification, npm publication, deployment, or main-branch merge. |
| Documentation centralization | Current gate | Advisor distribution and supervision content is centralized into the six core docs; standalone advisor docs are removed. |

| Advisor mentoring/recovery/audit — Phase 01 | DONE (2026-09-07) | [Phase plan](../plans/260907-1208-advisor-mentoring-recovery-audit/phase-01-contracts-and-policy-migration.md) and [review](../plans/reports/code-review-260907-1648-phase-01-v2-contracts-and-policy-migration.md); policy/checkpoint/result/controller v2, task/history v1 records, TS/CJS parity, typed errors, and explicit legacy-policy migration are frozen. No automatic HOME rewrite or later-phase runtime retry/wait/state/history cutover is claimed. |
| Advisor mentoring/recovery/audit — Phase 02 | DONE (2026-09-07) | [Phase plan](../plans/260907-1208-advisor-mentoring-recovery-audit/phase-02-wait-cancellation-and-cleanup.md); completed at 100% with indefinite generation without a generation deadline, monotonic bounded progress warnings on stderr, cancellation dominance across async boundaries, POSIX process-group termination with leader/group reap verification, observable workspace absence requiring **ENOENT**, and runner/controller tracking of probe cleanup uncertainty. Evidence: 65/65 advisor-controller tests, a real 31.25s smoke pass, `npm run distribute:check`, `npm run release:check`, Sol Cycle 3 sign-off 9/10, and Astra mentor approval. |
| Advisor mentoring/recovery/audit — Phase 03 | DONE (2026-09-08) | [Phase plan](../plans/260907-1208-advisor-mentoring-recovery-audit/phase-03-adapter-qualification-and-terminal-parsing.md); completed at 100% with qualified adapter controls, strict final lifecycle parsing, fail-closed unsafe terminal output handling, structured operational failures, explicit route/effort/no-tool/session controls, and unavailable-backend boundaries. Evidence: 92/92 advisor-controller tests passed, `npm run build` exited 0, `npm run release:check` exited 0; Astra Cycle 3 sign-off 10/10; Sol mentor counsel recorded for Phase 04/05/10. |
| Advisor mentoring/recovery/audit — Phase 04 | DONE (2026-09-08) | [Phase plan](../plans/260907-1208-advisor-mentoring-recovery-audit/phase-04-mentor-brief-evidence-and-results.md); completed at 100% with the `brief-contract.md` → `generate-runtime-brief.mjs` → `runtime-brief.generated.cjs` single-source chain, unified `formatMentorPrompt` packaging for Claude/Codex/OMP/Pi, strict seven-field `parseAdviceBody` validation (fences/prose and Node/Python/Go/Rust raw stack frames rejected while ordinary prose remains valid), and V2 digest/build-identity/receipt-effort correspondence checks. Evidence: 118/118 advisor-controller tests passed (~7.3s), `npm run build` exit 0, `npm run release:check` exit 0; Astra post-fix sign-off 8/10 with all four critical correspondence/RAW_STACK issues resolved. |
| Advisor mentoring/recovery/audit — Phase 05 | DONE (2026-09-08) | [Phase plan](../plans/260907-1208-advisor-mentoring-recovery-audit/phase-05-primary-retry-and-backup-orchestration.md); completed at 100% with bounded recovery (up to four sequential primary launches plus one configured backup), cancellable 10/20/30s backoff, route-local preflight skip, provider cooldown handling, and qualification-to-spawn identity binding. Evidence: 140/140 advisor-controller tests passed and `npm run release:check` exited 0. |
| Advisor mentoring/recovery/audit — Phase 06 | DONE (2026-09-08) | [Phase plan](../plans/260907-1208-advisor-mentoring-recovery-audit/phase-06-task-state-scope-and-human-handoff.md); completed at 100% with durable task state, scope/disposition tracking, three-cycle correction gates, and human handoff. Review approved 2026-09-08. |
| Advisor mentoring/recovery/audit — Phase 07 | DONE (2026-09-08) | [Phase plan](../plans/260907-1208-advisor-mentoring-recovery-audit/phase-07-audit-history-and-outcome-review.md) and [QA evidence](../plans/reports/tester-260908-1344-phase07-final-verification.md); completed at 100% with owner-only sanitized execution/outcome history, bounded attempt snapshots, CAS terminal settlement, linked executor outcomes, audit degradation independent of inference, and managed `history list|show|export|prune` review tools. Evidence: 204/204 advisor-controller tests passed (19/19 targeted); Phase Lead/Senior Mentor sign-off is unconditional approval at 10/10. |
| Advisor mentoring/recovery/audit — Phase 08 | DONE (2026-09-08) | [Phase plan](../plans/260907-1208-advisor-mentoring-recovery-audit/phase-08-workflow-and-harness-gate-integration.md) and [integration evidence](../tests/adapters/phase08-mentoring-integration.test.mjs); canonical `evcrate-advisor-checkpoint/v2` dispatcher migrated across all 16 code/cook/bootstrap/fix consumers; seven targets declare mentoring supported and write checks advisory-only; real CLI Path A/Path B lifecycles, exact correction ordinals 1/2/3, durable `needs_human`, and user-baseline preservation are covered. Evidence: 279/279 tests; Lead Mentor approval 10/10; user approved. |
| Advisor mentoring/recovery/audit — Phase 09 | DONE (2026-09-08; 100%) | [Phase plan](../plans/260907-1208-advisor-mentoring-recovery-audit/phase-09-projection-publication-and-documentation-cutover.md); generated and verified seven target projections, synchronized schema-2 manifests/registry, verified the exact 29-file controller closure, passed network-isolated installer and publication-recovery checks, preserved disposable HOME, and documented operator cutover/rollback. Actual HOME publication remains operator-gated pending explicit operator authorization. |
| Advisor mentoring/recovery/audit — Phase 10 | DONE (2026-09-08; 100%) | [Phase plan](../plans/260907-1208-advisor-mentoring-recovery-audit/phase-10-acceptance-qualification-and-improvement-evaluation.md) and [QA acceptance](../plans/reports/qa-260908-1915-phase10-acceptance.md); deterministic acceptance is complete: 272/272 tests, 29/29 runtime-closure files, and a 9/9 sanitized mentoring baseline; live qualification and HOME publication remain operator-gated. |
| Advisor metrics explorer — Phase 01 | DONE (2026-09-18) | [Phase plan](../plans/260917-2308-advisor-visual-metrics/phase-01-portable-advisor-contract-runtime.md), [validation](../plans/reports/tester-260918-0027-phase-01-portable-advisor-contract-runtime.md), and [review](../plans/reports/code-review-260918-0028-phase-01-portable-advisor-contract-runtime.md); portable zero-Node contract runtime and corrected public history shapes complete. Focused proof: 49/49 requested test executions passed. Review found no critical issues; follow-up warnings remain non-blocking. |
| Advisor metrics explorer — Phase 02 | DONE (2026-09-18) | [Phase plan](../plans/260917-2308-advisor-visual-metrics/phase-02-checkpoint-digest-metrics-kernel-and-generated-cjs-adapters.md), [review](../plans/reports/code-review-260918-0244-phase02-re-review.md); deterministic checkpoint digest, portable metrics kernel, generated four-file CJS runtime, compatibility adapters, and 33-file controller inventory complete. Evidence: protocol 31/31, metrics 5/5, parity 4/4, advisor-controller 206/206, `distribute:check`/`distribute:build` status `ok`, and `npm run build` passed. |
| Advisor metrics explorer — Phase 03 | DONE (2026-09-18) | [Phase plan](../plans/260917-2308-advisor-visual-metrics/phase-03-controller-closure-and-inventory-migration.md), [closure evidence](../plans/reports/evidence-260918-1140-phase-03-33-file-closure-parity.json), and [review](../plans/reports/code-review-260918-1136-phase-03-controller-closure-inventory-migration.md); exact 33-file parity now covers generated inventory, manifests, `install.sh`, and `install.ps1`; negative tests reject viewer files and external-package requires. |
| Build-command unblocking — Phases 01–04 | DONE (2026-09-07) | [Plan](../plans/260906-2125-unblock-build-commands-evcrateignore/plan.md), [Phase 04 verification](../plans/260906-2125-unblock-build-commands-evcrateignore/phase-04-verification-and-regression-testing.md), [test evidence](../plans/reports/tester-260907-0209-unblock-build-commands-phase-04.md), and [code review](../plans/reports/code-review-260907-0209-unblock-build-commands-phase-04.md); six focused suites pass 299/299, distribution parity is clean across seven adapters, and the bounded canonical/projected/published OMP matrix passes 21/21 (63 evaluations). |
| Command and skill catalogs — Phase 01 | DONE (2026-09-07) | [Plan](../plans/260906-2300-scan-command-skill-catalogs/plan.md) and [Phase 01 evidence](../plans/260906-2300-scan-command-skill-catalogs/phase-01-canonical-metadata-and-scanner-contracts.md); 70 commands and 36 non-template skills normalized, strict multi-format scanner contracts delivered, and focused scanner/help tests pass 24/24. |
| Command and skill catalogs — Phase 02 | DONE (2026-09-07) | [Phase 02 plan](../plans/260906-2300-scan-command-skill-catalogs/phase-02-catalog-data-schema-and-freshness.md), [test report](../plans/reports/tester-260907-0152-catalog-regression-freshness.md), and [code review](../plans/reports/code-review-260907-0153-phase-02-catalog-schema-freshness.md); strict schemas, canonical source identity, atomic generation, freshness validation, and fail-closed regressions complete; focused evidence passes 26/26 with freshness confirmed. |
| Command and skill catalogs — Phase 03 | DONE (2026-09-07) | [Phase 03 plan](../plans/260906-2300-scan-command-skill-catalogs/phase-03-seven-target-scanner-and-catalog-adapters.md), [test report](../plans/reports/tester-260907-0959-phase-03-seven-target-adapters.md), and [code review](../plans/reports/code-review-260907-1004-phase-03-seven-target-scanner-and-catalog-adapters.md); seven-target scanner/layout adapters and authoritative native mappings complete; foreign-CWD, unmanaged-resource isolation, fail-closed validation, and parity checks pass 37/37. Review has no critical issues; non-blocking output-containment and symlink-hardening follow-ups remain. |
| Command and skill catalogs — Phase 04 | DONE (2026-09-07) | [Phase 04 plan](../plans/260906-2300-scan-command-skill-catalogs/phase-04-regeneration-documentation-and-release-gates.md), [validation report](../plans/reports/tester-260907-1123-phase04-validation-matrix.md), and [final code review](../plans/reports/code-review-260907-1457-phase-04-final-post-fixes.md); regeneration, scanner/generator documentation, and release gates complete; focused gates pass 85/85, the seven-target foreign-CWD matrix passes 35/35, and `npm run distribute:check` returns `status: "ok"`. |
| Hook materialization scope distribution — Phase 01 | DONE (2026-09-12; 100%) | [Phase 01 plan](../plans/260912-0051-hook-materialization-scope-distribution/phase-01-cli-and-protocol-contract.md); froze scalar `--scope`, exact publication/recovery wire contracts, phase correlation, partial result semantics, and exit category 5. Evidence: build; protocol 21/21; CLI 42/42; integration 14/14; publication 53/53. |
| Hook materialization scope distribution — Phase 02 | DONE (2026-09-12; 100%) | [Phase 02 plan](../plans/260912-0051-hook-materialization-scope-distribution/phase-02-context-and-manifest-project-bindings.md) and [review](../plans/reports/advisor-260912-1035-phase02-context-and-manifest-project-bindings.md); normalized manifest-derived project bindings, overlap rejection, canonical owner-controlled project identity, and unchanged projection context. Evidence: 174/174 tests and `distribute:check` status `ok`. |
| Hook materialization scope distribution — Phase 03 | DONE (2026-09-12; 100%) | [Phase 03 plan](../plans/260912-0051-hook-materialization-scope-distribution/phase-03-neutral-seven-target-runtime-closures.md); completed seven neutral installation-relative runtime closures and structured target-owned HOME rules, including fail-closed child validation and workspace cwd/env separation. Evidence: build; adapters 24/24; source-derived publication 54/54; integration 14/14; full source-derived suite passed. |
| Hook materialization scope distribution — Phase 04 | DONE (2026-09-12; 100%) | [Phase 04 plan](../plans/260912-0051-hook-materialization-scope-distribution/phase-04-one-snapshot-phase-planning.md); one aggregate schema-2 `VerifiedCurrentBuild`/digest drives shared and HOME/project phase planning with strict HOME mappings/order, neutral contained project roots/documents, ownership/stale/merge/CAS/bounds preservation, and preflight before reads. Evidence: `npm run build` passed; focused publication plan/parity tests passed 8/8; `npm run test:publication` passed 57/57; `npm run test:adapters` passed 24/24; `npm run distribute:check` returned `status: "ok"`. |
| Hook materialization scope distribution — Phase 05 | DONE (2026-09-13; 100%) | [Phase 05 plan](../plans/260912-0051-hook-materialization-scope-distribution/phase-05-generic-transaction-engine.md); generic transaction descriptor/engine covering HOME and project publication with preflight-before-mutation, HOME-then-project locking, durable journal-before-workspace ordering, workspace identity/containment and same-volume checks, fsync/marker ordering, bounded HOME retention with project no-retention cleanup, and distinct recovery/error outcomes. Evidence: `npm run build` passed; `npm run test:publication` passed 66/66; `npm run test:integration` passed 14/14. |
| Hook materialization scope distribution — Phase 06 | DONE (2026-09-13; 100%) | [Phase 06 plan](../plans/260912-0051-hook-materialization-scope-distribution/phase-06-state-migration-recovery-and-partial-orchestration.md); schema-2 state/migration, scope-isolated HOME/project recovery, and partial orchestration completed after blocking review corrections covering schema-2 binding/phase validation, project-root binding before HOME mutation, locked replanning after HOME recovery, durable ownership-pinned legacy cleanup retry, and same-volume preflight. Evidence: `npm run build` passed; focused local tests passed individually — recovery 19/19, apply 12/12, publication-plan 6/6, CLI publication 6/6. |
| Hook materialization scope distribution — Phase 07 | DONE (2026-09-13; 100%) | [Phase 07 plan](../plans/260912-0051-hook-materialization-scope-distribution/phase-07-focused-contract-and-runtime-proof.md); focused contract and runtime proof gate passed across all protocol, adapter, publication, and recovery suites. Evidence: build, protocol 21/21, CLI/context 47/47, primitives 31/31, adapters 26/26, publication 77/77, integration 14/14, cutover 7/7, and `distribute:check` returned `status: "ok"`. |
| Hook materialization scope distribution — Phase 08 | DONE (2026-09-13; 100%) | [Phase 08 plan](../plans/260912-0051-hook-materialization-scope-distribution/phase-08-installed-release-fixtures-and-regeneration.md); installed Linux fixtures and checked-in regeneration verified. Extended `verifyInstalledLauncherAndInvariance` to prove HOME non-mutation on install, all-seven HOME publication with shared controller, project publication to separate project directory without project controller, runtime entrypoint execution across all seven targets from third workspace, partial failure rollback/recovery isolation, and package snapshot byte invariance throughout. Evidence: `test:release` (10/10), `test:installer:linux` (15/15), `test:validation-rollout` (6/6), `test:distribution:rollout` (5/5), and full test suite (512/512). |
| Hook materialization scope distribution — Phase 09 | DONE (2026-09-13; 100%) | [Phase 09 plan](../plans/260912-0051-hook-materialization-scope-distribution/phase-09-post-verification-operator-documentation.md); live operator and architecture documentation updated after full implementation proof, release gate verification, and complete test suite pass. Covers CLI examples, destination matrix, shared controller HOME invariant, partial outcomes, scope-isolated recovery, and installer distinction. |
| Live vendor qualification | GATED — operator authorization required | Each enabled installed CLI needs a bounded non-sensitive Linux qualification after upgrades. Deterministic tests do not authenticate a vendor. |
| Release publication/rollout | Pending operator gate | npm publication, deployment, rollout, and final release remain explicitly separate from repository contracts. |
| Windows validation | COMPLETE (2026-09-15) | [Master plan](../plans/260914-0636-windows-release-qualification/plan.md), [Phase 09 verification](../plans/reports/tester-260915-1119-phase-09-integrated-qualification.md), [Phase 10 documentation cutover](../plans/260914-0636-windows-release-qualification/phase-10-post-proof-documentation-and-support-cutover.md); build-once handoff, 4-row matrix (`windows-2025` x64, Windows PowerShell 5.1 and PowerShell 7, Node 22.19.0 and 24.21.0), publisher-only write, automatic predecessor transitions, and seven-file byte identity proven. Bounded support cutover complete; runtime/desktop/signing exclusions remain. |

### Windows release qualification milestone

| Milestone | Progress | Evidence / next gate |
|---|---:|---|
| Windows release qualification | **100% (10/10 phases complete)** | [Master plan](../plans/260914-0636-windows-release-qualification/plan.md); Phases 01–10 are DONE (2026-09-15). Qualified one immutable Windows release candidate across `windows-2025` x64 with Windows PowerShell 5.1 and PowerShell 7 and Node 22.19.0 and 24.21.0 for standalone installer lifecycle and `version --json`. Runtime commands (`publish`, `health`, advisor execution), desktop/UAC/SmartScreen/Authenticode/enterprise-policy environments, and live vendor qualification remain future/unclaimed. |

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

Hook Materialization Scope Distribution is complete through Phase 09 (Post-Verification
Operator Documentation): 512/512 tests pass, 29/29 runtime-closure files verify, and
the verified Linux release installer fixture passes.
The 29/29 figure above is dated evidence for that completed milestone and remains
unchanged. Current Advisor Metrics Explorer Phase 03 proof is the 33-file closure
recorded in the changelog and closure evidence report.
Advisor Metrics Explorer next gate: Phase 04 — History metrics CLI integration.
Live vendor qualification and production `$HOME/.evcrate/` publication remain
operator-gated; deterministic evidence does not authorize rollout.

1. **Use canonical source.** Change `.evcrate/source/.claude/`, the shared controller
   root, or a declared target overlay—not generated projection trees.
2. **Regenerate inventory/build.** Run the current npm/Node TypeScript build and
   distribution scripts; verify schema-2 manifests, hashes, owners, and the exact
   controller closure.
3. **Review publication.** Run a disposable-home dry run, inspect managed/unmanaged
   changes, then apply only with a current verified build.
4. **Exercise recovery.** Keep the publication marker/journal available and verify
   interrupted promotion restores the complete prior managed state.
5. **Configure or migrate advisor policy.** Create or inspect the user-owned
   `$HOME/.evcrate/advisor-routing.json`. Runtime policy v2 requires explicit
   primary/backup routes, wait warnings, and bounded history. For legacy v1,
   use `settings get`, prepare v2, then `preview`/`apply`; do not auto-rewrite
   HOME or put credentials in the policy.
6. **Qualify enabled adapters.** Run bounded Linux checks for Claude, Codex, Pi, and
   OMP using each CLI's own authentication; record receipt, lifecycle, isolation,
   probe deadline, generation warning/cancellation, and cleanup evidence.
7. **Review target-specific boundaries.** Treat Copilot as a projection-only target;
   review Pi settings/runtime separately; leave Antigravity unavailable until its
   capability contract is proven.

## Documentation and command-prefix follow-up

Documentation now uses a literal `cmd` prefix for every documented slash
command/resource name, including `.claude` references. OMP nested names use `__`
(for example `/cmd-fix__hard`), and Copilot names use `/evcrate-cmd-fix-hard`.

The current `.claude/scripts/scan_commands.py` still derives names from relative
paths, while the TypeScript CLI parser accepts bare operational actions. Prefix
validation is therefore a known implementation follow-up, not a completed source
change. Do not rename source command files or claim parser enforcement from this
roadmap item.

## Open gaps and decisions

- **Command enforcement:** Decide whether and where to enforce the documentation
  convention in future scanner/parser changes without breaking generated target maps.
- **Advisor qualification:** Repeat real installed-CLI qualification after every
  vendor CLI upgrade; keep `antigravity` unavailable until equivalent evidence exists.
- **V2 runtime adoption:** The prior Advisor mentoring/recovery/audit milestone
  completed canonical consumers in Phase 08 and historical Phase 10 deterministic
  acceptance (272/272 tests, 29/29 runtime-closure files). In the current Hook
  Materialization Scope Distribution milestone, Phases 01–09 are complete:
  projections, manifests, controller closure, publication recovery, and
  documentation cutover are verified. Live qualification remains gated on explicit
  operator authorization before HOME rollout.
- **Policy route selection:** Exact deployed primary/backup routes, vendor
  controls, auth, and independent failure domains remain operator qualification
  inputs; no model/backend defaults are implied by examples.
- **Contract test depth:** Retain dedicated CJS v2 validator, structured-body
  boundary, public envelope-correspondence, retry-orchestration, task-state, and
  history CLI/CAS coverage as later workflow phases consume the frozen records.
- **Release authority:** Keep `docs/project-changelog.md` as the phase mirror and
  resolve its historical open question before release tagging.
- **Support scope:** Standalone Windows installer lifecycle and version verification are qualified (Phases 01–10); obtain separate evidence before widening support claims to broader Windows runtime equivalence, desktop/signing environments, or operator rollout.
- **Metrics:** Retain contract evidence by phase, but do not copy unexplained test
  totals into new documentation.

## Related documents

- [System architecture](./system-architecture.md)
- [Project overview and PDR](./project-overview-pdr.md)
- [Code standards](./code-standards.md)
- [Codebase summary](./codebase-summary.md)
- [Project changelog](./project-changelog.md)
- [Pi-native migration](./pi-native-migration.md)
