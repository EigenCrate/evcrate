# QA Report — Phase 09 Integrated Qualification

- Date: 2026-10-12
- Scope: The eight requested verification commands; `tests/qualification/` was not run. No pre/post whole-worktree baseline was collected.
- Runner: npm and Node.js `node:test`.

## Sequential Thinking Steps

1. Scoped execution to the eight specified verification gates; excluded the protected historical qualification suite.
2. Ran the verification commands and five targeted test invocations sequentially; captured exit status, test counts, and duration.
3. Compared automated results with the Phase 09 verification boundary; separated automated success from still-blocked native GUI/live-inference evidence.

## Test Results Overview

All eight commands exited **0**. Five Node test invocations ran **211 tests: 211 passed, 0 failed, 0 skipped, 0 cancelled, 0 todo**. TAP reported 0 suites for each invocation.

| Command | Exit | Tests | Pass | Fail | Skipped | TAP duration | Wall time |
|---|---:|---:|---:|---:|---:|---:|---:|
| `npm run check:vscode-companion` | 0 | — | — | — | — | — | 0.75 s |
| `npm run distribute:check` | 0 | — | — | — | — | — | 43.31 s |
| `npm run release:check` | 0 | — | — | — | — | — | 1.04 s |
| `node --test tests/vscode-companion/*.test.mjs tests/distribution/vscode-companion-vsix.test.mjs` | 0 | 54 | 54 | 0 | 0 | 2.082 s | 2.22 s |
| `node --test tests/adapters/vscode-*.test.mjs` | 0 | 98 | 98 | 0 | 0 | 4.522 s | 4.66 s |
| `node --test tests/cli/vscode-companion-installation.test.mjs tests/cli/arguments.test.mjs tests/cli/dispatch.test.mjs tests/cli/vscode-settings-registration.test.mjs` | 0 | 48 | 48 | 0 | 0 | 57.363 s | 57.49 s |
| `node --test tests/integration/vscode-installed-runtime.test.mjs` | 0 | 6 | 6 | 0 | 0 | 7.333 s | 7.46 s |
| `node --test --test-concurrency=1 tests/distribution/publication-vscode-*.test.mjs` | 0 | 5 | 5 | 0 | 0 | 86.609 s | 86.74 s |
| **Node test total** | **0** | **211** | **211** | **0** | **0** | **157.908 s** | **158.57 s** |

## Verification, Coverage, and Performance

- Companion verifier passed for the development checkout; the test suite also verified packed-package artifacts. Both reported VSIX SHA-256 `c4638015d732945f85f3a6040a8864ac6b004d2fffdcf02f974e53fe7bed97a2` and build identity `caf354b6a8a2276f25e80fff3cef77be7529e061f122c3aab12150325f998dab`.
- Distribution check returned protocol status `ok` (`distribute.check`, TypeScript engine). Release runtime-closure check exited successfully.
- Coverage: not collected; no coverage command was requested or run.
- Slowest gate was serial VS Code publication tests (86.609 s TAP); CLI tests took 57.363 s. No performance threshold was specified.
- Separate compilation/build status: not assessed; no build command was in the requested set.
- Not run (outside the requested set): `npm test`, `npm run generate:all`, fresh Linux/Windows archive qualification, or a native GUI/model session. Existing matrix entries were not revalidated here.

## Failed Tests and Critical Issues

- Failed tests/checks: none.
- No blocking issues for the requested automated gates. This report does **not** claim complete Phase 09 native qualification: the verification matrix still lists the interactive GUI picker and authenticated Copilot Chat inference rows as blocked. These require the separately approved isolated live session; automated tests are not a substitute.

## Recommendations / Next Steps

1. Retain this report as automated-gate evidence only; do not use it alone for Phase 09 sign-off.
2. Complete the matrix-tracked GUI picker and live-inference rows in an isolated profile/workspace after obtaining the required explicit per-session approval and model/invocation scope.

## Unresolved Questions

- None about the requested automated commands. The native GUI/live-inference evidence remains blocked as recorded in the verification matrix.
