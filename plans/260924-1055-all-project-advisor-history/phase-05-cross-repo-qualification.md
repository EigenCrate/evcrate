# Phase 05 — Paired qualification and release decision

## Context links
[Plan](./plan.md) · [Phases 00](./phase-00-secure-auth-prerequisite.md)–[04](./phase-04-project-filter-ui.md) · [joint gate](../260920-1603-dam-hopper-advisor-plugin/cross-repo-contract.md#joint-gates-and-handoffs). Depends on all implementation phases and trusted owner-root installation.

## Overview
2026-09-24; priority P1; estimate 3h provisional, environment dependent; implementation pending; review pending. No G4 or production claim until owner-runner and LAN checks actually run.

## Key Insights
Source review is not a fresh browser/runtime verification. User observed 230 consultations/21 project dirs, evcrate 27 at prior run; retention changes data. The existing LAN HTTP test-server check is not evidence of production auth/grants. Host and plugin artifacts are separately versioned.

## Requirements
Verify v2 host/SDK/domain/schema/manifest compatibility; tests and installed owner-runner path. Trusted EVCrate installation must bind owner root so every authenticated account gets All Projects without registering history projects or per-user grants. Preserve project-only contexts, separate policy/evaluation permissions, revocation and anonymous/no-auth denial. Explicit development token/test server remains operational; production MongoDB absence cannot silently trigger dev JWT issuance. Release only matched host+plugin candidates; rollback never restores revoked root binding.

## Architecture
Deploy staged paired versions with negotiated contract/capability; fail incompatible package early. Root snapshot is bounded and cancellable, consulted in same authorized context. On revocation/profile/worktree/connection switch clear worker context and iframe data; no replay. Independently provisioned owner runner reads only approved history root, API UID cannot directly read it.

## Related code files
- **EVCrate modify** `scripts/build-advisor-plugin-candidate.mjs`, plugin manifest/inventory, affected `tests/plugin/`, `tests/viewer/`, `docs/{advisor-plugin-ui.md,advisor-plugin-worker.md,code-standards.md,system-architecture.md,project-changelog.md}` once implementation is proven.
- **Host modify** plugin contract fixtures and integration tests under `server/tests/`, `packages/ui/browser-tests/`, deployment docs under `docs/`, release manifest/build only where required. No new production paths for demo auth.

## Implementation Steps
1. Run focused protocol/provider/worker/viewer tests and host Rust SDK/authorization/UI browser tests; check generated schema/manifest and package reproducibility once; investigate disagreements, do not re-pin incorrect filters.
2. Exercise anonymous/no-auth/expired actor, MongoDB-backed accounts including one added after installation, production missing DB versus explicit dev token, wrong installation, wildcard project grant only, cross-owner root, symlink/replaced directory, root revocation mid-refresh, expired snapshot, cursor reuse, changed/missing detail and partial/cancel/deadline behavior.
3. Run actual DamHopper plugin in browser against owner runner: default All Projects inventory/count without registering historical projects, sample pages/detail across 2+ IDs, evcrate-only count/Overview, switch-back, historical unknown-name fallback and newly recorded safe name. Check Configuration and Evaluations explicitly label their independently bound sources. Compare accepted scan against contemporaneous baseline (230/21 only if unchanged); capture evidence without HOME paths.
4. Measure memory, scan byte/record counts, page latency and no-subtle hashing responsiveness within frozen limits. Check disable/revoke/update/rollback with no revived permissions; update docs/changelog and qualification report.

## Todo list
- [ ] Pass contract/unit/integration and negative authorization matrix.
- [ ] Verify real multi-project UI on approved owner runner, capture completeness.
- [ ] Qualify bounds, revoke/rollback, docs and matched release decision.

## Success Criteria
Any authenticated user on the installed owner-runner can view/filter all eligible retained advisor histories; anonymous/expired users cannot. No historical workspace registration is required. Future EVCrate consultations have safe display names; unknown legacy names show ID. Configuration/Evaluations show independent scope labels; no source escapes or implicit policy grant. Release decision requires observed gates, not prior test-server live claim.

## Risk Assessment
If operational root grant/owner runner or data-size limits cannot be qualified, retain project-only production behavior and report precise blocker; do not claim account-wide capability deployed or silently cut acceptance.

## Security Considerations
Do not ship if production missing MongoDB could mint dev JWT; preserve the intentional explicit dev/test path. Keep per-invocation authorization, independent runner checks and owner-safe traversal.

## Next steps
Present evidence and release/rollback decision; installed root binding grants all authenticated users account-wide history by design.
