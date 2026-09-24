# Code Review: Phase 02 — Host Root Authorization and Context

## Scope
- **Files reviewed:**
  - `server/src/plugins/registry_state.rs`
  - `server/src/plugins/admin.rs`
  - `server/src/plugins/contract.rs`
  - `server/src/plugins/lifecycle.rs`
  - `server/src/plugins/registry_install.rs`
  - `server/src/plugins/registry_query.rs`
  - `server/src/plugins/authorization.rs`
  - `server/src/plugins/contexts.rs`
  - `server/src/plugins/api_service.rs`
  - `server/src/plugins/worker_supervisor.rs`
  - `server/src/plugins/runner_server.rs`
  - `server/src/plugins/runner_client.rs`
  - `server/src/plugins/error.rs`
  - `server/src/plugins/package_validate.rs`
  - `server/src/api/plugins.rs`
  - `server/src/api/plugin_admin.rs`
  - `server/src/api/router.rs`
  - `server/Cargo.toml`
  - `server/tests/plugin_authorization.rs`
  - `server/tests/plugin_lifecycle.rs`
  - `server/tests/plugin_runner_supervision.rs`
  - `server/tests/plugin_api_integration.rs`
  - `package.json`
  - `packages/ui/scripts/plugin-test-client.mjs`
  - `packages/ui/src/components/PluginHostPage.tsx`
  - `packages/ui/src/plugins/plugin-document.ts`
  - `packages/ui/src/plugins/use-plugin-navigation.ts`
- **Lines analyzed:** ~1,232 lines (+1,161 / -71 diff lines across 27 files)
- **Review focus:** Phase 02 Host root authorization, security bounds, path safety, concurrency, YAGNI/KISS/DRY.
- **Updated plans:** `plans/260924-1055-all-project-advisor-history/phase-02-host-authorization-context.md`

---

## Overall Assessment
**Score: 8.5 / 10**

Solid implementation of host-bound root history authorization. Clean separation between UI descriptors (which never receive the host file path) and backend verification under runner UID. All acceptance criteria for Phase 02 pass across Rust and TypeScript test suites (2,550 tests passing).

No critical security vulnerabilities or regressions detected, but several notable warnings and architectural gaps require attention before full production hardening:
1. In-memory `owner_history_sources` synchronization drift on DamHopper server restart and lifecycle rollback/remove.
2. Wildcard operation (`"*"`) check bypasses `verify_grant` in `check_open_authorization`.
3. Missing traversal (`..`) sanitation in `OwnerHistorySource::validate`.
4. Brittle `metadata.id.length > 20` heuristic in UI navigation/host components.

---

## Critical Issues
None (no exploitable security holes, data loss, or build-breaking defects).

---

## Warnings (High / Medium Priority)

### 1. In-Memory `owner_history_sources` Drift across Restarts and Admin Operations [High]
- **Location:** `server/src/state.rs:402`, `server/src/api/plugin_admin.rs:304,402`
- **Impact:**
  - On DamHopper API server restart, `PluginAuthorizationService` is initialized with an empty `owner_history_sources` map. Sources persisted on disk in `PluginRegistry` are not rehydrated into `PluginAuthorizationService`. Users will receive 403 Forbidden on `open_context` until an admin re-saves the configuration.
  - In `rollback_installation_handler`, `auth_service.set_owner_history_source(...)` is not invoked with the restored source from `RollbackPackageSnapshot`. Stale pre-rollback source remains in memory.
  - In `remove_installation_handler`, `auth_service.set_owner_history_source(&id, None)` is not called. Deleted installations leave zombie entries in `auth_service.owner_history_sources`, causing `has_actor_visibility` to return `true` indefinitely.
- **Remediation:**
  - In `invalidate_installation(id)`, invoke `self.auth_service.set_owner_history_source(id, None)`.
  - In `rollback_installation_handler`, call `state.plugin_service.auth_service().set_owner_history_source(&id, inst.owner_history_source.clone())`.
  - Add initialization/hydration logic on server boot (or cache-miss query to runner client) to populate `auth_service` from current active installations.

### 2. Wildcard Operation (`"*"`) Bypasses `verify_grant` in `check_open_authorization` [High]
- **Location:** `server/src/plugins/authorization.rs:275-287`
- **Impact:**
  ```rust
  let has_non_history_ops = requested_ops
      .iter()
      .any(|op| !ROOT_HISTORY_ALLOWED_OPERATIONS.contains(&op.as_str()) && op != "*");
  ```
  If an ungranted caller requests `allowed_operations: ["*"]` with `ContextScopeKind::HistoryRoot`, `has_non_history_ops` is `false` (because `op != "*"` fails). `verify_grant` is skipped during `open_context`, and the worker receives `allowed_operations: ["*"]`.
  While host `check_invoke_authorization` intercepts and blocks known non-history operations (e.g. `policy.readCurrent`), opening a context with unrestricted `["*"]` without a grant violates least privilege and relies entirely on host invoke gating.
- **Remediation:**
  Do not exempt `"*"` from `has_non_history_ops`, or filter `allowed_operations` in `open_context` to `ROOT_HISTORY_ALLOWED_OPERATIONS` when scope is `HistoryRoot` and actor has no wildcard grant.

### 3. Missing Path Normalization and Traversal Rejection in `OwnerHistorySource::validate` [Medium]
- **Location:** `server/src/plugins/registry_state.rs:76-80`
- **Impact:**
  `validate()` requires `root_path.starts_with('/')`, but does not reject `..`, non-canonical components, or trailing traversal. While only admins configure this path, code standards require strict validation against path traversal and symlinked ancestors.
- **Remediation:**
  Enforce path normalization: reject `..`, ensure components are valid, and resolve/canonicalize without traversing ancestor symlinks.

### 4. Omission of `root_identity` Recheck on Invoke [Medium]
- **Location:** `server/src/plugins/worker_supervisor.rs:444-449`
- **Impact:**
  On `invoke`, the supervisor checks `source_revision` against `owner_source.source_revision`, but does not verify `scope.root_identity == owner_source.root_identity`. If a source is updated without incrementing `source_revision` (or if replaced with identical revision but different identity), context could be reused.
- **Remediation:**
  Verify both `source_revision` and `root_identity` match in `invoke`.

---

## Suggestions (Low Priority / Code Quality / DRY)

### 1. Fragile Hardcoded ID-Length Heuristic in UI [Low]
- **Location:** `packages/ui/src/plugins/use-plugin-navigation.ts:92`, `packages/ui/src/components/PluginHostPage.tsx:193`
- **Issue:**
  `metadata.id === "evcrate.advisor" || metadata.publisher === "evcrate" || metadata.id.length > 20 ? "EVCrate Advisor" : metadata.id.toUpperCase()`
  Arbitrarily renames any plugin with ID length > 20 to "EVCrate Advisor".
- **Remediation:**
  Use plugin manifest display name or explicit package property instead of string length check.

### 2. Redundant Method in `registry_query.rs` [Low]
- **Location:** `server/src/plugins/registry_query.rs:222-261`
- **Issue:**
  `PluginRegistry::update_owner_history_source` only updates `registry_revision` without `security_revision` or audit logging. Only used by tests in `plugin_runner_supervision.rs`.
- **Remediation:**
  Align test harness to use lifecycle coordinator or remove redundant method.

### 3. Compiler Warnings in Test Targets [Low]
- **Location:**
  - `tests/plugin_lifecycle.rs:411` (`unused variable: result`)
  - `tests/plugin_lifecycle.rs:464` (`unused variable: update_res`)
  - `tests/plugin_api_integration.rs:27` (`unused import: OwnerHistorySource`)
- **Remediation:**
  Prefix unused variables with `_` and remove unused import.

---

## Positive Observations
1. **Strong Privacy Boundary:** Host file paths never leak to the iframe or client. The client context receives only `{ contextId, scopeKind: "history-root", ... }` and worker receives `{ kind, rootIdentity, sourceRevision }`.
2. **Double Verification:** Runner independently validates owner UID and symlink rejection, preventing privilege escalation even if host API were compromised.
3. **Comprehensive Test Coverage:** 2,550 passing unit and integration tests across Rust server, plugin SDK, UI host, and EVCrate protocol suites.
4. **Lifecycle Atomicity:** Preserves previous `owner_history_source` across updates and properly restores on rollback.
5. **Accurate Web Crypto Fallback:** Pure JS SHA-256 fallback in `plugin-document.ts` is mathematically sound and matches RFC 6234.

---

## Validation Commands and Results
- `cargo check --manifest-path server/Cargo.toml --all-targets` (PASS, 3 compiler warnings)
- `cargo test --manifest-path server/Cargo.toml --test plugin_authorization --test plugin_lifecycle --test plugin_runner_supervision --test plugin_api_integration` (PASS, 29/29 tests)
- `pnpm --dir packages/plugin-sdk test` (PASS, 45/45 tests)
- `pnpm --dir packages/ui test` (PASS, 1,863/1,863 tests)
- `pnpm --dir packages/ui exec tsc --noEmit` (PASS, clean)
- `pnpm --dir packages/plugin-sdk exec tsc --noEmit` (PASS, clean)

---

## Unresolved Questions
1. Should `PluginAuthorizationService` hydrate `owner_history_sources` from the runner process on API server startup via a dedicated startup hook, or should `dam-hopper-server` query runner on-demand when opening context?
2. Should `requested_ops: ["*"]` in root history scope automatically be narrowed to `ROOT_HISTORY_ALLOWED_OPERATIONS` or rejected if explicit wildcard grant is absent?
