# Project Roadmap

**Status:** Unreleased; operator gates remain separate  
**Updated:** 2026-09-07  
**Evidence source:** [project changelog](./project-changelog.md), current package scripts,
and the [system architecture](./system-architecture.md)

This roadmap distinguishes implementation gates recorded in the repository from
operator/release work that has not been claimed. `docs/project-changelog.md` is the
maintained phase mirror for this package; root `CHANGELOG.md` is semantic-release
output and is not the phase evidence authority.

## Current baseline

The current source establishes a TypeScript control plane, seven fixed projection
adapters, schema-2 target/build manifests, a shared 17-file advisor controller
closure, direct ten-key checkpoint counsel, and journaled publication/recovery. The
npm package path is authoritative by default. Generated projections and the shared
controller are outputs of canonical source plus target policy; they are not hand
edited.

## Phase and gate status

| Phase/gate | State | Evidence or boundary |
|---|---|---|
| Protocol and filesystem foundations | Implemented in source | Strict bounded JSON, canonical hashing, safe paths, locks, staging, CAS, and recovery modules are present under `src/`. |
| Target manifest and projection registry | Implemented in source | Schema-2 manifests persist seven targets; `src/adapters/index.ts` registers Claude, Gemini, Antigravity, Codex, Pi, OMP, and Copilot. |
| Advisor controller contract | Implemented in source | The canonical `.evcrate/source/.evcrate/bin` closure contains the generated 17-file inventory, policy schema, direct checkpoint contract, runner, adapters, and envelopes. |
| Phase 9 packed consumer/adapter work | Historical evidence recorded | The changelog records packed-consumer and diagnostic adapter contracts; it does not claim live Agent Store/DamHopper release or target cutover. |
| Phase 10 TypeScript cutover | Historical evidence recorded | The changelog records TypeScript authority and per-target cutover receipts; current `package.json` routes build/check/publish actions through the compiled CLI. |
| Phase 11 validation and staged rollout | Historical evidence recorded | The changelog records consumer validation and staged-rollout gates; it does not claim live vendor qualification, npm publication, deployment, or main-branch merge. |
| Documentation centralization | Current gate | Advisor distribution and supervision content is centralized into the six core docs; standalone advisor docs are removed. |
| Build-command unblocking — Phases 01–04 | DONE (2026-09-07) | [Plan](../plans/260906-2125-unblock-build-commands-evcrateignore/plan.md), [Phase 04 verification](../plans/260906-2125-unblock-build-commands-evcrateignore/phase-04-verification-and-regression-testing.md), [test evidence](../plans/reports/tester-260907-0209-unblock-build-commands-phase-04.md), and [code review](../plans/reports/code-review-260907-0209-unblock-build-commands-phase-04.md); six focused suites pass 299/299, distribution parity is clean across seven adapters, and the bounded canonical/projected/published OMP matrix passes 21/21 (63 evaluations). |
| Command and skill catalogs — Phase 01 | DONE (2026-09-07) | [Plan](../plans/260906-2300-scan-command-skill-catalogs/plan.md) and [Phase 01 evidence](../plans/260906-2300-scan-command-skill-catalogs/phase-01-canonical-metadata-and-scanner-contracts.md); 70 commands and 36 non-template skills normalized, strict multi-format scanner contracts delivered, and focused scanner/help tests pass 24/24. |
| Command and skill catalogs — Phase 02 | DONE (2026-09-07) | [Phase 02 plan](../plans/260906-2300-scan-command-skill-catalogs/phase-02-catalog-data-schema-and-freshness.md), [test report](../plans/reports/tester-260907-0152-catalog-regression-freshness.md), and [code review](../plans/reports/code-review-260907-0153-phase-02-catalog-schema-freshness.md); strict schemas, canonical source identity, atomic generation, freshness validation, and fail-closed regressions complete; focused evidence passes 26/26 with freshness confirmed. |
| Command and skill catalogs — Phase 03 | DONE (2026-09-07) | [Phase 03 plan](../plans/260906-2300-scan-command-skill-catalogs/phase-03-seven-target-scanner-and-catalog-adapters.md), [test report](../plans/reports/tester-260907-0959-phase-03-seven-target-adapters.md), and [code review](../plans/reports/code-review-260907-1004-phase-03-seven-target-scanner-and-catalog-adapters.md); seven-target scanner/layout adapters and authoritative native mappings complete; foreign-CWD, unmanaged-resource isolation, fail-closed validation, and parity checks pass 37/37. Review has no critical issues; non-blocking output-containment and symlink-hardening follow-ups remain. Phase 04 remains regeneration, documentation, and release gates. |
| Live vendor qualification | Pending operator gate | Each enabled installed CLI needs a bounded non-sensitive Linux qualification after upgrades. Deterministic tests do not authenticate a vendor. |
| Release publication/rollout | Pending operator gate | npm publication, deployment, rollout, and final release remain explicitly separate from repository contracts. |
| Windows validation | Deferred | Windows installer/runtime parity is not claimed without separate harness validation. |

## Immediate next gates

1. **Use canonical source.** Change `.evcrate/source/.claude/`, the shared controller
   root, or a declared target overlay—not generated projection trees.
2. **Regenerate inventory/build.** Run the current npm/Node TypeScript build and
   distribution scripts; verify schema-2 manifests, hashes, owners, and the exact
   controller closure.
3. **Review publication.** Run a disposable-home dry run, inspect managed/unmanaged
   changes, then apply only with a current verified build.
4. **Exercise recovery.** Keep the publication marker/journal available and verify
   interrupted promotion restores the complete prior managed state.
5. **Configure advisor policy.** Create the user-owned
   `$HOME/.evcrate/advisor-routing.json` with the exact version-1 shape; do not put
   credentials in the policy.
6. **Qualify enabled adapters.** Run bounded Linux checks for Claude, Codex, Pi, and
   OMP using each CLI's own authentication; record receipt, lifecycle, isolation,
   deadline, and cleanup evidence.
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
