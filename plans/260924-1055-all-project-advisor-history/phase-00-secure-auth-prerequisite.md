# Phase 00 — Guard production auth without breaking development

## Context links
[Plan](./plan.md) · [Source review](./reports/summary-review.md) · [Host research](./research/host-authorization.md) · [Cross-repo security contract](../260920-1603-dam-hopper-advisor-plugin/cross-repo-contract.md#authentication-grants-and-identities). Blocks Phase 02 and release.

## Overview
2026-09-24; priority P1; estimate 4h; status DONE; implementation and review approved. Production auth guards and development test ergonomics verified.
## Key Insights
Normal production operation uses MongoDB (`server/src/main.rs:333-344`); the non-auth token flow is intentional for development/test. But absent MongoDB environment variables also set `db=None` while `no_auth` can remain false. `server/src/api/auth.rs:355,476` mints tokens on `db.is_none()` regardless of an explicit development flag. `apps/web/index.html:8-17` seeds a default profile in all builds, including production.

## Requirements
Preserve current explicit dev/test token bootstrap and test-server login. Gate development token issuance on an explicit development/test configuration, never solely on missing DB; production with missing MongoDB configuration must fail startup or return unavailable, not mint a token. Keep first-visit test profile bootstrap working in the test harness but do not force an `authType: none` evcrate profile on normal production installs.

## Architecture
MongoDB-backed production authenticates against enabled users; development/test config alone permits test tokens. Separately constrain the standalone plugin test server to its explicit fixture actor and history grant. Auth and UI bootstrap logic must not confuse a database outage/misconfiguration with opt-in development mode. Root history requires an authenticated session even though every such account is admitted after installation.

## Related code files
- **Host modify** `server/src/main.rs`/`server/src/state.rs` (production DB gate), `server/src/api/auth.rs` (explicit dev-only fallback), `apps/web/index.html` (test-only bootstrap), `server/src/bin/dam-hopper-plugin-test-server.rs` (retain working fixture).
- **Host modify/add tests** auth integration under `server/tests/`, web bootstrap/profile tests under `apps/web/` or `packages/ui/` existing conventions. No EVCrate source changes in this phase.

## Implementation Steps
1. Trace production startup DB configuration and explicit test-server path; preserve development bootstrap unchanged unless an equivalent explicit fixture replaces it.
2. Keep MongoDB-backed credential checks in production; reject or fail startup when production DB config is absent. Permit JWT bootstrap only in explicit dev/test mode, never because `db.is_none()` alone.
3. Scope first-visit profile seeding to a test harness or explicit development mode; normal browser profile onboarding remains user-owned.
4. Test production missing DB, normal credentialed MongoDB login, and developer test-server login/profile/plugin grant path.

## Todo list
- [x] Require explicit development/test mode for token bootstrap; guard production missing DB.
- [x] Scope default profile seed without losing test-server ergonomics.
- [x] Exercise both normal production and intentional development paths.
## Success Criteria
Production with configured MongoDB continues authenticating; development/test server still issues its intended test token. Production startup with missing DB configuration never implicitly enables development-token issuance or a default auth-none browser profile.

## Verification Evidence
- **Production missing DB fails startup:** Guarded in `server/src/state.rs:301-309` and `server/src/main.rs:344-350`. Verified by `test_production_missing_mongodb_fails` (`server/tests/auth_no_auth.rs:506-571`).
- **No dev token fallback on missing DB in normal auth:** Removed `|| state.db.is_none()` in `server/src/api/auth.rs:355,476`. Verified by `test_normal_auth_requires_credentials`, `test_normal_auth_status_without_token`, and `test_normal_auth_login_error_response_structure` (all return 401 UNAUTHORIZED, 0 tokens minted).
- **Explicit dev/test token bootstrap preserved:** `--no-auth` explicitly handled in `server/src/api/auth.rs:355,456`. Verified by `test_no_auth_login_returns_dev_token`, `test_no_auth_status_shows_dev_mode`, and `test_no_auth_bypasses_middleware`.
- **First-visit profile seed scoped to dev/test:** `apps/web/index.html:10-16` checks `?dev`, `?test`, `localhost:5173`, `__DAM_HOPPER_TEST_HARNESS__`, or `sessionStorage`. Normal production installs never auto-seed `authType: none`.
- **Test-server grants constrained to fixture actor:** `server/src/bin/dam-hopper-plugin-test-server.rs:254-259,306` only grants `args.actor` (removed hardcoded `dev-user` wildcard grant).
- **Test results:** All 13 tests in `auth_no_auth` passed (0.82s); all 1,863 tests in `@dam-hopper/ui` passed (12.10s); full server suite 1,496 tests passed; web production build succeeded.

## Risk Assessment
Overly broad auth change can break developer workflow: limit the guard to explicit mode/configuration and prove test-server behavior.

## Security Considerations
Every authenticated account can read installed owner history; a forged test subject outside explicit development would widen exposure. Production auth and `--no-auth` plugin denial stay intact.

## Next steps
Proceed to Phase 01: Freeze scope and data contract (phase-01-cross-project-contract.md).
