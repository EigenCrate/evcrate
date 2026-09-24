# Phase 02 — Host root authorization and context

## Test results overview

| Command | Passed | Failed | Ignored | Result |
|---|---:|---:|---:|---|
| `cargo test --test plugin_authorization` | 10 | 0 | 0 | PASS |
| `cargo test --test plugin_api_integration` | 4 | 0 | 0 | PASS |
| `cargo test --test plugin_lifecycle` | 8 | 0 | 0 | PASS |
| `cargo test --test plugin_runner_supervision` | 7 | 0 | 0 | PASS |
| `cargo test --test plugin_contract_fixtures` | 14 | 0 | 0 | PASS |
| `cargo test --test plugin_admin_api` | 6 | 0 | 0 | PASS |
| `pnpm test` (`packages/plugin-sdk`) | 45 | 0 | 0 | PASS |
| `pnpm test` (`packages/ui`) | 1,863 | 0 | 0 | PASS |
| `npm test` (EVCrate) | 593 | 0 | 1 | PASS |
| **Total** | **2,550** | **0** | **1** | **PASS** |

**Pass rate:** 100% of 2,550 executed tests; 1 Windows-only test skipped. EVCrate `npm test` ran `build:all` and `test:protocol`, `test:advisor-metrics`, `test:cli`, `test:primitives`, `test:adapters`, `test:registry`, `test:scopes`, `test:publication`, `test:integration`, `test:cutover`, `test:validation-rollout`, `test:advisor-controller`, `test:release`, `test:installer:linux`, and `test:distribution:rollout`.

## Phase 02 acceptance

- **All-authenticated history-root admission — PASS.** Newly authenticated Bob opens and invokes history-root without an explicit grant after trusted owner source configuration.
- **Negative unauthorized denial — PASS.** Anonymous request denied; ungranted policy/project operations denied; removing the owner source revokes the existing context.
- **Owner path safety — PASS for exercised cases.** Runner rejects symlink roots and mismatched root identity/source revision; EVCrate context tests reject symlink, missing, and non-directory project roots. Runner source also checks effective UID; the requested suites do not directly exercise a wrong-owner-UID rejection.
- **Project mode isolation — PASS.** History-root access does not authorize project scope; project wildcard without a grant is denied, while explicit project grants remain scoped.

## Build, coverage, performance

- EVCrate `build:all` passed as part of `npm test` (including repeated prepack builds). Cargo test targets compiled and passed.
- Coverage not collected; no requested command generated coverage.
- EVCrate `npm test` wall time: **544.06 s**. Slowest reported Node test runs: `test:publication` **161.48 s**, `test:cutover` **143.01 s**, `test:adapters` **92.08 s**. No separate benchmark or memory profiling.

## Issues and unresolved questions

No test failures or blocking issues. Non-failing diagnostics: unused Rust test imports/variables, JSDOM navigation/canvas not-implemented messages, and Node `DEP0190`; the Windows-only context suite was skipped as expected on Linux. No unresolved questions.
