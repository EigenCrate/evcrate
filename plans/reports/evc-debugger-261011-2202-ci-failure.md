# CI failure diagnostic — run 38148347852

## Executive summary

- [Release run](https://github.com/EigenCrate/evcrate/actions/runs/38148347852), push to `main`, commit `5196a4d8707bb348052d3d2902207034d396d49c` (`refactor!: retire advisor subsystem and retain inline advise (#29)`). Local `HEAD` matches failed run.
- Failing job: **Produce Release Candidate**, workflow job key `release-candidate`, job ID `114496341314`, Ubuntu, configured Node `24.21.0`.
- Failing step: **10 — Run legacy tests**, `.github/workflows/release.yml:68-69`, command `npm test`. Nested failure: `npm run test:build-generation` (`package.json:31,43`). Exit code **1**; **75 tests, 70 passed, 5 failed**, 22 suites.
- Root cause: incomplete advisor retirement. Six translated-target manifests still declare removed shared advisory code; VS Code additionally declares two removed advisory modules. A surviving test still mutates the retired helper. Separate command inventory assertion still requires 70 commands although the retired advise command reduced inventory to 69.
- Impact: release candidate decision/build/upload never ran. Windows qualification and Publish Release jobs skipped. No release published by this run.

## Timeline / evidence collection

All timestamps UTC, 2026-10-11:

| Time | Event |
|---|---|
| 14:43:37 | Release workflow created |
| 14:43:52–14:43:58 | Build TypeScript CLI succeeded |
| 14:44:04–14:45:08 | Separate protocol and CLI test steps succeeded |
| 14:45:08 | `npm test` started |
| 14:54:50 | Nested `test:build-generation` started |
| 14:55:07 / 14:55:38 | Serial and parallel bounded-worker regression assertions failed |
| 14:57:42 | Command inventory assertion failed |
| 15:00:23 | Two adapter-identity fixture copies failed; suite reported five failures; step exited 1 |
| 15:00:24 | Candidate job concluded failure |

Fetched with `gh run view 38148347852 --repo EigenCrate/evcrate --log-failed` and `gh run view ... --json name,headSha,headBranch,event,status,conclusion,jobs,url,createdAt,updatedAt`. [Failing job / logs](https://github.com/EigenCrate/evcrate/actions/runs/38148347852/job/114496341314).

## Exact failing tests, messages, stacks

Runner path prefix: `/home/runner/work/evcrate/evcrate/`.

### 1–2. Bounded-worker staging, both job modes

File: `tests/distribution/bounded-worker-staging.test.mjs:159:7`.

- `rebuilds twice without promoting over canonical AGENTS with jobs=1`
- `rebuilds twice without promoting over canonical AGENTS with jobs=2`

```text
AssertionError [ERR_ASSERTION]: Missing expected exception.
    at TestContext.<anonymous> (.../tests/distribution/bounded-worker-staging.test.mjs:193:18)
    at async Test.run (node:internal/test_runner/test:1409:7)
    at async Suite.processPendingSubtests (node:internal/test_runner/test:974:7)
code: 'ERR_ASSERTION'
actual: undefined
expected: { code: 'PUBLICATION_FAILED' }
operator: 'throws'
```

The jobs=2 trace additionally includes `process.processTicksAndRejections (node:internal/process/task_queues:104:5)` before `Test.run`.

### 3. Canonical command naming regression

File: `tests/distribution/phase09-golden-and-contract-regressions.test.mjs:39:1`.
Test: `Phase 09: all canonical command files round-trip through -x- reversibility`.

```text
AssertionError [ERR_ASSERTION]: Must have at least 70 canonical commands
    at TestContext.<anonymous> (.../tests/distribution/phase09-golden-and-contract-regressions.test.mjs:42:10)
    at Test.runInAsyncScope (node:async_hooks:227:14)
    at Test.run (node:internal/test_runner/test:1402:25)
    at Test.start (node:internal/test_runner/test:1262:17)
    at startSubtestAfterBootstrap (node:internal/test_runner/harness:387:17)
actual: false
expected: true
operator: '=='
```

### 4–5. Adapter runtime identity

File: `tests/manifests/adapter-runtime-identity.test.mjs`.

- Line `72:1`: `a shared adapter helper change invalidates every translated adapter and rejects the recorded build`
- Line `98:1`: `a VS Code helper change invalidates only its adapter and rejects the recorded build`

```text
Error: ENOENT: no such file or directory, lstat
'/home/runner/work/evcrate/evcrate/dist/adapters/advisory.js'
    at cpSyncFn (node:internal/fs/cp/cp-sync:56:13)
    at cpSync (node:fs:3242:3)
    at copiedTranslatedRuntime (.../tests/manifests/adapter-runtime-identity.test.mjs:44:7)
    at TestContext.<anonymous> (.../tests/manifests/adapter-runtime-identity.test.mjs:73:34)
    at Test.runInAsyncScope (node:async_hooks:227:14)
    at Test.run (node:internal/test_runner/test:1402:25)
    at Test.start (node:internal/test_runner/test:1262:17)
    at startSubtestAfterBootstrap (node:internal/test_runner/harness:387:17)
errno: -2
code: 'ENOENT'
syscall: 'lstat'
```

Second test has `TestContext.<anonymous> (...:99:34)`, followed by `Test.runInAsyncScope`, `Test.run`, `Test.processPendingSubtests (node:internal/test_runner/test:974:18)`, `Test.postRun (node:internal/test_runner/test:1542:19)`, `Test.run (node:internal/test_runner/test:1467:12)`, and `async startSubtestAfterBootstrap (node:internal/test_runner/harness:387:3)`.

## Code-level root cause

### A. Removed adapter files remain in declared runtime closure

Commit deletes `src/adapters/advisory.ts`, `src/adapters/vscode/advisory-rendering.ts`, and `src/adapters/vscode/advisory.ts`; clean compilation therefore emits none of their `.js` files.

Remaining declarations:

| Target manifest | Invalid `adapter_sources` entries |
|---|---|
| `.evcrate/targets/{antigravity,codex,copilot,omp,pi}/manifest.json:6` | `dist/adapters/advisory.js` |
| `.evcrate/targets/vscode/manifest.json:6,15-16` | `dist/adapters/advisory.js`, `dist/adapters/vscode/advisory-rendering.js`, `dist/adapters/vscode/advisory.js` |

Read-only local inventory confirms exactly these missing declared runtime paths. This is stale metadata, not a failed TypeScript build or missing dependency install.

Adapter identity fixture copies every declared adapter/source at `tests/manifests/adapter-runtime-identity.test.mjs:37-44`. First stale declaration causes `cpSync` to throw before either identity assertion runs. Additionally, `sharedHelper` at line 22 still names `dist/adapters/advisory.js`; fixing manifests alone would leave the first test mutating an absent, untracked helper via `appendFileSync` at line 82.

### B. Stale closure silently selects consumer verification, masking source drift

Both bounded-worker tests successfully build twice, then deliberately change canonical `.claude/AGENTS.md` at line 192. They correctly expect `resolveCurrentBuild(options)` to reject stale source hashes at line 193. `options` at lines 186-190 does not specify `mode`.

Execution chain:

1. `src/distribution/build-resolution.ts:90-104`: `hasAuthoringSources` requires canonical AGENTS plus every declared adapter source. Missing `dist/adapters/advisory.js` in Codex's closure makes it return `false` at line 97.
2. Same file, line 153: absent explicit mode + false authoring detection selects `isConsumer`.
3. Lines 154-155: consumer branch verifies only recorded output roots, not current canonical source or adapter hashes.
4. `src/distribution/manifest.ts:138-139`: source/adapter identity comparison only runs when those hash arguments are supplied. Canonical mutation does not alter generated outputs, so verification returns normally.
5. Result: `assert.throws` reports “Missing expected exception” in both jobs=1 and jobs=2. Not a worker concurrency race or canonical promotion corruption.

Contributing behavior: `src/manifests/registry.ts:120-129` silently omits absent adapter paths from `manifestAdapterHashes`. Builds can succeed with stale closure declarations, allowing this defect to survive earlier suites.

### C. Command-count contract not migrated after deliberate deletion

Commit deletes `.evcrate/source/.claude/commands/evc-cmd-advise.md`. Current directory contains **69** `.md` command files; retired command absent. Test line 42 still asserts `commandFiles.length >= 70`, aborting before name round-trip checks at lines 44-49. Intended retirement requires updating the inventory contract, not restoring a dummy command.

## Concrete proposed fix

Priority **P0 — complete retirement cutover, preserve real regression coverage**:

1. Remove `dist/adapters/advisory.js` from all six translated-target manifests listed above. Remove both remaining VS Code advisory entries. Keep actual live helper closure, including `dist/adapters/uri-restoration.js` already declared across those six manifests.
2. In `tests/manifests/adapter-runtime-identity.test.mjs:22`, change shared identity-mutation helper to `dist/adapters/uri-restoration.js`. It is live shared token-restoration code used by translated adapters and remains in every relevant manifest. Retain existing per-target hash-change and `PUBLICATION_FAILED` assertions. Leave target-specific `configuration-validation.js` test intact.
3. In `tests/distribution/phase09-golden-and-contract-regressions.test.mjs:42`, migrate inventory expectation to current 69-command baseline (exact 69 if inventory is intentionally frozen); explicitly assert `evc-cmd-advise.md` absent. Retain full parse/format round-trip loop. This is a deliberate contract migration supported by the deletion, not suppressed coverage.
4. Regenerate registry/catalogs if inventory inputs require it, and regenerate every build manifest/projection atomically with `node scripts/build-manifests.mjs` (calls `runAllManifestsBuild` once for the full target set). Do not hand-edit generated hashes. Target-manifest bytes participate in source identity, so declaration changes invalidate prior recorded builds.
5. Do not remove bounded-worker drift assertions, restore deleted advisory modules, skip missing fixture files, or loosen `PUBLICATION_FAILED` checks. Correct metadata should restore authoring detection and the existing drift behavior.

Priority **P1 — preventive regression coverage**: ensure a clean compiled runtime contains every declared adapter source and add a missing-declared-helper case proving an explicit authoring build cannot pass source identity checks. Any broader change to automatic consumer detection needs separate contract review; intentional packaged-consumer behavior must remain distinct.

## Validation / scope

- Investigation only: source files read-only; only this report written. No fixes, builds, tests, linters, or smoke runs executed locally. Findings grounded in failed CI logs, matching Git revision, local source inspection, read-only command count and declared-path inventory.
- CI `src/error.ts(1,7): error TS2322: Type 'string' is not assignable to type 'number'` is **expected negative-test output**, not root cause. `tests/distribution/typescript-incremental-caching.test.mjs:111-115` creates the invalid temporary source and asserts nonzero compiler status; CI marks that test passed.
- `DEP0190` shell deprecation warning likewise does not explain these five failures.
- Recommended main-agent verification after fix: clean TypeScript build, `npm run test:build-generation`, full `npm test`, atomic manifest generation and `npm run distribute:check`; then rerun Release workflow. No claim that downstream skipped gates already pass.

## Unresolved questions

None for the five observed failures. Downstream skipped gates remain unqualified until post-fix validation.
