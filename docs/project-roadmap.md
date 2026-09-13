# Project Roadmap

**Status:** Phase 10 DONE (Deterministic Acceptance; 272/272 tests, 29/29
closure files, 9/9 sanitized baseline); live vendor qualification and HOME
publication remain operator-gated  
**Updated:** 2026-09-13
**Evidence source:** [project changelog](./project-changelog.md), current package scripts,
the [system architecture](./system-architecture.md), Phase 08 integration
evidence, and the [Phase 10 QA acceptance report](../plans/reports/qa-260908-1915-phase10-acceptance.md)

This roadmap distinguishes implementation gates recorded in the repository from
operator/release work that has not been claimed. `docs/project-changelog.md` is the
maintained phase mirror for this package; root `CHANGELOG.md` is semantic-release
output and is not the phase evidence authority.

## Current baseline

The current source establishes a TypeScript control plane, seven fixed projection
adapters, schema-2 target/build manifests, a 29-file advisor controller closure,
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
| Advisor controller contract | Implemented in source | The canonical `.evcrate/source/.evcrate/bin` closure contains the generated 29-file inventory, history contracts/store/query/prune modules, canonical runtime brief artifact, v2 contract validators, policy migration schema, compatibility checkpoint/controller path, runner, adapters, and envelopes. |
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
| Build-command unblocking — Phases 01–04 | DONE (2026-09-07) | [Plan](../plans/260906-2125-unblock-build-commands-evcrateignore/plan.md), [Phase 04 verification](../plans/260906-2125-unblock-build-commands-evcrateignore/phase-04-verification-and-regression-testing.md), [test evidence](../plans/reports/tester-260907-0209-unblock-build-commands-phase-04.md), and [code review](../plans/reports/code-review-260907-0209-unblock-build-commands-phase-04.md); six focused suites pass 299/299, distribution parity is clean across seven adapters, and the bounded canonical/projected/published OMP matrix passes 21/21 (63 evaluations). |
| Command and skill catalogs — Phase 01 | DONE (2026-09-07) | [Plan](../plans/260906-2300-scan-command-skill-catalogs/plan.md) and [Phase 01 evidence](../plans/260906-2300-scan-command-skill-catalogs/phase-01-canonical-metadata-and-scanner-contracts.md); 70 commands and 36 non-template skills normalized, strict multi-format scanner contracts delivered, and focused scanner/help tests pass 24/24. |
| Command and skill catalogs — Phase 02 | DONE (2026-09-07) | [Phase 02 plan](../plans/260906-2300-scan-command-skill-catalogs/phase-02-catalog-data-schema-and-freshness.md), [test report](../plans/reports/tester-260907-0152-catalog-regression-freshness.md), and [code review](../plans/reports/code-review-260907-0153-phase-02-catalog-schema-freshness.md); strict schemas, canonical source identity, atomic generation, freshness validation, and fail-closed regressions complete; focused evidence passes 26/26 with freshness confirmed. |
| Command and skill catalogs — Phase 03 | DONE (2026-09-07) | [Phase 03 plan](../plans/260906-2300-scan-command-skill-catalogs/phase-03-seven-target-scanner-and-catalog-adapters.md), [test report](../plans/reports/tester-260907-0959-phase-03-seven-target-adapters.md), and [code review](../plans/reports/code-review-260907-1004-phase-03-seven-target-scanner-and-catalog-adapters.md); seven-target scanner/layout adapters and authoritative native mappings complete; foreign-CWD, unmanaged-resource isolation, fail-closed validation, and parity checks pass 37/37. Review has no critical issues; non-blocking output-containment and symlink-hardening follow-ups remain. |
| Command and skill catalogs — Phase 04 | DONE (2026-09-07) | [Phase 04 plan](../plans/260906-2300-scan-command-skill-catalogs/phase-04-regeneration-documentation-and-release-gates.md), [validation report](../plans/reports/tester-260907-1123-phase04-validation-matrix.md), and [final code review](../plans/reports/code-review-260907-1457-phase-04-final-post-fixes.md); regeneration, scanner/generator documentation, and release gates complete; focused gates pass 85/85, the seven-target foreign-CWD matrix passes 35/35, and `npm run distribute:check` returns `status: "ok"`. |
| Hook materialization scope distribution — Phase 04 | DONE (2026-09-12; 100%) | [Phase 04 plan](../plans/260912-0051-hook-materialization-scope-distribution/phase-04-one-snapshot-phase-planning.md); one aggregate schema-2 `VerifiedCurrentBuild`/digest drives shared and HOME/project phase planning with strict HOME mappings/order, neutral contained project roots/documents, ownership/stale/merge/CAS/bounds preservation, and preflight before reads. Evidence: `npm run build` passed; focused `node --test tests/distribution/publication-plan.test.mjs tests/distribution/publication-parity.test.mjs` passed 8/8; `npm run test:publication` passed 57/57; `npm run test:adapters` passed 24/24; `npm run distribute:check` returned `status: "ok"`; final review approved with no findings. Tester subagent unavailable because external Cloud Code Assist returned HTTP 429; live operator/vendor gates and Phase 09 architecture documentation remain deferred. |
| Hook materialization scope distribution — Phase 06 | DONE (2026-09-13; 100%) | [Phase 06 plan](../plans/260912-0051-hook-materialization-scope-distribution/phase-06-state-migration-recovery-and-partial-orchestration.md); schema-2 state/migration, scope-isolated HOME/project recovery, and partial orchestration completed after blocking review corrections covering schema-2 binding/phase validation, project-root binding before HOME mutation, locked replanning after HOME recovery, durable ownership-pinned legacy cleanup retry, and same-volume preflight. Evidence: `npm run build` passed; focused local tests passed individually — recovery 19/19, apply 12/12, publication-plan 6/6, CLI publication 6/6. Mandatory tester agent could not execute because its provider returned HTTP 429 before commands; final review approved and user approved finalization. |
| Live vendor qualification | GATED — operator authorization required | Each enabled installed CLI needs a bounded non-sensitive Linux qualification after upgrades. Deterministic tests do not authenticate a vendor. |
| Release publication/rollout | Pending operator gate | npm publication, deployment, rollout, and final release remain explicitly separate from repository contracts. |
| Windows validation | Deferred | Windows installer/runtime parity is not claimed without separate harness validation. |

## Immediate next gates

Phase 10 deterministic acceptance is complete: 272/272 tests pass, 29/29
runtime-closure files verify, and the 9/9 sanitized mentoring baseline passes.
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
- **V2 runtime adoption:** Phase 08 is complete: canonical command consumers use
  the V2 dispatcher and shared state lifecycle; seven target projections declare
  mentoring support with advisory-only write checks. Phase 09 is complete:
  projections, manifests, controller closure, publication recovery, and
documentation cutover are verified. Phase 10 deterministic acceptance is complete:
272/272 tests pass and 29/29 runtime-closure files verify. Live qualification remains
gated on explicit operator authorization before HOME rollout.
- **Policy route selection:** Exact deployed primary/backup routes, vendor
  controls, auth, and independent failure domains remain operator qualification
  inputs; no model/backend defaults are implied by examples.
- **Contract test depth:** Retain dedicated CJS v2 validator, structured-body
  boundary, public envelope-correspondence, retry-orchestration, task-state, and
  history CLI/CAS coverage as later workflow phases consume the frozen records.
- **Release authority:** Keep `docs/project-changelog.md` as the phase mirror and
  resolve its historical open question before release tagging.
- **Support scope:** Obtain separate Windows and operator rollout evidence before
  widening support claims.
- **Metrics:** Retain contract evidence by phase, but do not copy unexplained test
  totals into new documentation.

## Related documents

- [System architecture](./system-architecture.md)
- [Project overview and PDR](./project-overview-pdr.md)
- [Code standards](./code-standards.md)
- [Codebase summary](./codebase-summary.md)
- [Project changelog](./project-changelog.md)
- [Pi-native migration](./pi-native-migration.md)
