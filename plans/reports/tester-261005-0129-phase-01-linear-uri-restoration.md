# Phase 01: Linear URI Restoration — QA Report

## Test Results Overview

- Command: `npm run test:adapters`
- Result: **PASS** — 122 tests run, 122 passed, 0 failed, 0 skipped, 0 cancelled, 0 todo.
- Duration: 21.52 s wall time; Node test-runner duration 21,417.96 ms.
- Coverage: Not collected; coverage was not part of the requested commands.
- The adapter run included `tests/adapters/uri-restoration-differential.test.mjs`.

## Benchmark

Command: `node scripts/benchmark-uri-restoration.mjs` — **PASS** (0.92 s wall time).

| Metric | Result |
|---|---:|
| Schema size | 242,277 bytes |
| URIs extracted | 5,060 |
| Legacy `replaceAll` duration | 883.03 ms |
| Linear `restoreIndexedTokens` duration | 1.88 ms |
| Measured speedup | 469.7× |
| Byte-for-byte output identity | **true** |

## Build Status

- Command: `npm run build` — **PASS** (4.14 s wall time).
- Prebuild generation, advisor-runtime TypeScript compilation, and main TypeScript build completed; no warnings or errors were printed.

## Failures and Critical Issues

- Failed tests: None.
- Blocking issues: None.

## Performance Notes

- The longest reported adapter test was `all projection adapters (including claude) project advisor-mentoring.md with honest advisory-only capabilities` at 9,977 ms.
- The URI restoration benchmark confirms output identity and a 469.7× speedup on the measured 5,060-URI schema.

## Recommendations and Next Steps

- No follow-up is indicated by these requested checks; all passed.

## Unresolved Questions

- None.
