# Project Roadmap

**Status:** Unreleased; operator gates remain separate  
**Updated:** 2026-09-06  
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
| Build-command unblocking — Phases 01–04 | DONE (2026-09-06) | [Plan](../plans/260906-2125-unblock-build-commands-evcrateignore/plan.md) and [phase evidence](../plans/260906-2125-unblock-build-commands-evcrateignore/phase-01-core-hook-enhancements.md), [Phase 02](../plans/260906-2125-unblock-build-commands-evcrateignore/phase-02-pattern-matcher-and-ignore-standardization.md), [Phase 03](../plans/260906-2125-unblock-build-commands-evcrateignore/phase-03-target-projections-and-runtime-sync.md), and [Phase 04](../plans/260906-2125-unblock-build-commands-evcrateignore/phase-04-verification-and-regression-testing.md), plus the [status report](../plans/reports/project-manager-260906-2245-phase-04-status.md); 299/299 focused assertions pass, six projections and active OMP runtime verified; build/read boundary preserved. |
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
