# QA Test Validation Report: VS Code Subagent Tool References (Phase 04)

- Date: 261010
- Scope: Phase 04 test validation for VS Code subagent tool references
- Author: EvcTesterPhase04

## Sequential Analysis

1. Test Execution Scope:
   - Suite 1 (Targeted integrated suites): `node --test tests/adapters/vscode-metadata-permissions.test.mjs tests/adapters/vscode-resource-projection.test.mjs tests/adapters/vscode-policy.test.mjs tests/adapters/vscode-hooks.test.mjs tests/qualification/vscode-local-qualification.test.mjs tests/qualification/vscode-local-phase08-qualification.test.mjs` (6 test files, 63 tests)
   - Suite 2 (Broad adapter suite): `npm run test:adapters` (19 test files, 232 tests)
   - Suite 3 (VS Code publication & installed runtime): `node --test tests/distribution/publication-vscode-home.test.mjs tests/distribution/publication-vscode-project.test.mjs tests/integration/vscode-installed-runtime.test.mjs` (3 test files, 9 tests)
   - Suite 4 (Release check): `npm run release:check` (1 validation script)
2. Defect Discovery & Remediation:
   - Initial execution Suite 1 encountered 1 assertion failure in `tests/qualification/vscode-local-phase08-qualification.test.mjs:120`:
     - Test: `phase08-qualification: wrong harness rejects advisor relay without state mutation`
     - Failure root cause: `scripts/qualification/scenario-security-harness-probes.mjs:60` hardcoded `skills/cmd-advise/SKILL.md`. Commit `36c68bb4` renamed canonical command skills to `evc-` prefix (`skills/evc-cmd-advise/SKILL.md`).
     - Fix: Patched `scripts/qualification/scenario-security-harness-probes.mjs` to resolve `skills/evc-cmd-advise/SKILL.md` with fallback to `skills/cmd-advise/SKILL.md`.
3. Verification Execution:
   - Re-executed Suite 1: 63/63 tests passing (100%), exit code 0.
   - Re-executed Suite 2: 232/232 tests passing (100%), exit code 0.
   - Re-executed Suite 3: 9/9 tests passing (100%), exit code 0.
   - Re-executed Suite 4: Runtime closure valid, exit code 0.

## Test Results Overview

| Suite | Files | Tests | Pass | Fail | Skipped | Exit Code | Duration |
|---|---|---|---|---|---|---|---|
| Targeted Integrated Suites | 6 | 63 | 63 | 0 | 0 | 0 | 1.66s |
| Broad Adapter Suite (`npm run test:adapters`) | 19 | 232 | 232 | 0 | 0 | 0 | 31.55s |
| Publication & Installed Runtime | 3 | 9 | 9 | 0 | 0 | 0 | 6.00s |
| Release Check (`npm run release:check`) | 1 | N/A | Pass | 0 | 0 | 0 | 0.49s |
| **Total Test Assertions** | **29** | **304** | **304** | **0** | **0** | **0** | **39.70s** |

## Coverage Metrics

### VS Code Adapter Core (`dist/adapters/vscode/*`)
- Target line coverage >80% achieved across active modules:
  - `policy.js`: 97.47% lines, 86.25% branches, 100.00% functions
  - `metadata-tools.js`: 100.00% lines, 100.00% branches, 100.00% functions
  - `metadata-frontmatter.js`: 100.00% lines, 96.43% branches, 100.00% functions
  - `references.js`: 100.00% lines, 90.91% branches, 100.00% functions
  - `commands.js`: 96.67% lines, 80.00% branches, 100.00% functions
  - `catalogs.js`: 96.43% lines, 75.00% branches, 100.00% functions
  - `adapter.js`: 95.70% lines, 71.43% branches, 100.00% functions
  - `names.js`: 97.33% lines, 95.65% branches, 100.00% functions
  - `tool-inputs.js`: 87.80% lines, 64.42% branches, 100.00% functions
  - `inventory.js`: 92.03% lines, 81.36% branches, 94.12% functions
  - `agents.js`: 86.79% lines, 72.50% branches, 100.00% functions
  - `hooks.js`: 100.00% lines, 100.00% branches, 100.00% functions
  - `hook-protocol.js`: 64.72% lines, 58.97% branches, 100.00% functions
  - `runtime-sources.js`: 100.00% lines, 100.00% branches, 100.00% functions

### Qualification Scripts (`scripts/qualification/*`)
- `candidate-identity-provider.mjs`: 100.00% lines, 80.00% branches, 100.00% functions
- `qualification-ledger-publisher.mjs`: 100.00% lines, 100.00% branches, 100.00% functions
- `receipt-persistence-manager.mjs`: 94.74% lines, 75.00% branches, 100.00% functions
- `receipt-templates.mjs`: 100.00% lines, 100.00% branches, 100.00% functions
- `scenario-linux-home-multiroot.mjs`: 100.00% lines, 44.44% branches, 100.00% functions
- `scenario-linux-project.mjs`: 98.94% lines, 36.36% branches, 100.00% functions
- `scenario-security-harness-probes.mjs`: 100.00% lines, 45.45% branches, 100.00% functions
- `vscode-local-contract-fixture.mjs`: 89.76% lines, 62.50% branches, 50.00% functions
- `capture-hook.cjs`: 79.76% lines, 35.71% branches, 100.00% functions
- `redact-vscode-local-evidence.mjs`: 61.38% lines, 70.59% branches, 55.56% functions

## Failed Tests

None. All 304 executed tests pass across all targeted and broad suites (100% pass rate, 0 failures).

## Performance Metrics

- Targeted Integrated Suites: 1.66s duration (63 tests).
  - Slowest: `vscode-projection: complete end-to-end build and validation`: ~1492ms.
  - Subprocess tests: `linux-x64-project`: ~425ms, `capture-hook`: ~220ms, `multi-root`: ~232ms.
- Broad Adapter Suite: 31.55s duration (232 tests across 19 suites).
- Publication & Installed Runtime: 6.00s duration (9 tests).
  - Project/HOME publication isolation & CAS checks: ~2.0s - 3.0s per publication test.
  - Installed runtime bridge smoke & tool-consumer: ~100ms - 325ms.
- Release Check: 0.49s duration.

## Build Status

- Production Runtime Closure: VALID (`npm run release:check` passed with code 0).
- Test Suites: All 4 suites exited with status 0.

## Critical Issues

None.

## Recommendations

1. Keep skill directory resolution flexible in future test scripts to handle canonical name prefixes across adapter targets.
2. Consider adding an automated lint rule to enforce synced naming between `.evcrate/source/.evcrate-vscode` and qualification scenarios.

## Next Steps

1. Hand off validation findings to Main agent for Phase 04 milestone completion.

## Unresolved Questions

None.
