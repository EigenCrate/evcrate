# Phase 02 — DamHopper owner-root authorization and context

## Context links
[Plan](./plan.md) · [Phase 01 contract](./phase-01-cross-project-contract.md) · [host research](./research/host-authorization.md) · [cross-repo security contract](../260920-1603-dam-hopper-advisor-plugin/cross-repo-contract.md#authentication-grants-and-identities). Depends on Phase 00 and Phase 01.

## Overview
2026-09-24; priority P1; estimate 7h; implementation complete; review complete. Installed owner-root source and authenticated-session context authority—not a UI-only wildcard or manual per-user grant.

## Key Insights
`server/src/plugins/api_service.rs:223-310` resolves a single workspace target; `runner_server.rs:431-439` and `worker_supervisor.rs:275-309` forward one configured target. `authorization.rs:197-198` target wildcard grants host-configured projects, not unregistered history dirs. `registry_state.rs:92-109` persists grants/bindings; security revisions already exist.

## Requirements
The trusted EVCrate installation binds the actual advisor-owner history root once; all authenticated accounts of that DamHopper server may use account-wide history by default. No registration of historical projects or per-user history grant. Root identity/owner UID/installation revision remain fixed, revocable and hidden from iframe; project-target `*` alone must not enable account history. Anonymous, expired, no-auth and wrong-installation contexts remain denied. Existing project/worktree context behavior and policy/evaluation permissions are unchanged.

## Architecture
Extend durable registry/install lifecycle with a typed owner-history source for EVCrate, provisioned as part of trusted installation, and an explicit install-scoped all-authenticated history-read capability. Recheck actor session/epoch/installation/activation/source revision at API and independent owner runner on every invocation. Runner verifies approved root under owner UID; worker receives scoped descriptor, not a browser path. Revoking/disabling/removing installation or changing binding cancels in-flight work and clears iframe context. UI visibility may remain tied to a selected host workspace for navigation but historic project membership is not required.

## Related code files
- **Host modify** `server/src/plugins/{registry_state.rs,lifecycle.rs,registry_query.rs,authorization.rs,contract.rs,api_service.rs,runner_server.rs,worker_supervisor.rs,contexts.rs}`; `server/src/api/{plugins.rs,plugin_admin.rs}`; `packages/plugin-sdk/src/runner-protocol.ts` and contract fixtures as frozen Phase 01.
- **Host modify tests** existing `server/tests/` plugin lifecycle/authorization suites and SDK wire fixtures. **EVCrate no edits** in this phase.

## Implementation Steps
1. Bind the installed EVCrate package to its real owner history root, with atomic install/rollback and safe default for other plugins; admin approves package installation, not 21 workspace registrations.
2. At API open and invoke require a valid authenticated actor plus installation's root-history capability; runner independently rechecks root/owner/source revisions. Keep root independent of `configured_project_target: '*'` and `allowCurrentAccountPolicy`.
3. Send validated versioned scope descriptor to worker; on logout/revoke/disable/runner restart/profile switch close contexts and prevent stale data.
4. Test any valid MongoDB-authenticated account (including one added after install) can view root history; deny anonymous/no-auth/expired/wrong-installation access and symlink/owner/source replacement. Verify project mode unaffected.

## Todo list
- [x] Persist an install-bound owner-root source and all-authenticated history capability.
- [x] Add host and runner admission/reauthorization/revocation.
- [x] Verify negative cases without leaking owner paths.

## Success Criteria
Every valid authenticated account may open root history after trusted EVCrate installation, including users added later, without per-project registration or manual user grants. Anonymous/no-auth/wrong-installation sessions cannot; root revocation clears context data immediately. Existing project-only contexts still work.

## Verification Evidence
- **All-authenticated history root admission**: Verified in `server/tests/plugin_authorization.rs::test_root_history_authorization_admits_any_authenticated_account` and `server/tests/plugin_api_integration.rs::test_root_history_api_admission_and_authorization`. Newly authenticated user `bob` opens and invokes `history.summary` without per-project registration or explicit grant.
- **Negative unauthorized denial**: Verified in `test_no_auth_mode_strictly_denied`, `test_plugin_api_denied_under_no_auth_mode`, and anonymous request rejection in `test_root_history_api_admission_and_authorization`. Expired epochs and unauthorized operations (`policy.readCurrent`) rejected with 401/403.
- **Owner path safety**: Verified in `server/tests/plugin_runner_supervision.rs::test_runner_supervision_root_history_validation_and_rejections`. Direct symlinks, ancestor symlinks (`canonicalize != root_path`), non-directories, mismatched root identities, and wrong revisions rejected under runner owner UID with `SourcePermissionDenied`/`SourceMissing`. Wrong-owner UID rejection directly tested under unprivileged EUID against `/proc/1` (root-owned UID 0).
- **Restart hydration and cache invalidation**: Verified in `server/tests/plugin_api_integration.rs::test_root_history_api_admission_and_authorization`. Simulating clean server restart by wiping in-memory auth sources hydrates automatically from runner durable registry on next `open_context`; `invalidate_installation` clears in-memory auth sources immediately.
- **Project mode default deny**: Verified in `test_unconfigured_actor_default_deny` and `test_root_history_api_admission_and_authorization`. Project scope requests remain strictly denied without explicit grants.
- **Test execution metrics**: The original suite report records 2,550 passing executions and one Windows-only skip; subsequent targeted rechecks passed restart hydration/cache invalidation, ancestor-symlink rejection, and wrong-owner-UID rejection.

## Review Findings and Dispositions
- Code Review Score: 8.5/10 (0 critical issues, 4 warnings, 3 suggestions).
- **Warning 1 (In-memory cache sync & restart hydration)**: Resolved in code. `open_context` and `list_plugins` in `api_service.rs` hydrate `owner_history_source` on demand from `runner_client.list_plugins(true)` before authorization checks. `api_service.rs::invalidate_installation` explicitly clears in-memory source map. Tested in `test_root_history_api_admission_and_authorization`.
- **Warning 2 (Wildcard requested_ops)**: Resolved in code. Clamped `check_open_authorization` so wildcard `*` in root history scope strictly requires an explicit wildcard grant.
- **Warning 3 (Path normalization & ancestor symlinks)**: Resolved in code. `OwnerHistorySource::validate` requires an absolute path and rejects `..`/NUL; `worker_supervisor.rs` rejects non-canonical root paths (including ancestor symlinks). Verified by `root_path.canonicalize() == root_path` in test case 4b.
- **Warning 4 (Root identity recheck on invoke)**: Resolved in code. Added explicit `root_identity` match check on `invoke` in `worker_supervisor.rs`.
## Risk Assessment
Host API UID differs from owner UID: runner—not API/browser—performs root ownership checks. Provisioning root mode to all authenticated users is broader than exact-target grants; document that deliberate access scope, do not silently extend any other plugin.

## Security Considerations
The account-wide capability discloses every retained consultation under that owner to present and future logged-in users. Retain valid session checks, installation binding, sanitized errors and explicit admin ownership of plugin installation. Do not weaken production MongoDB or dev `--no-auth` plugin denial.

## Next steps
Phase 02 implementation and verification complete. Integrate with worker Phase 03 and paired UI Phase 04.
