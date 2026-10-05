# Code Review: Phase 03 — Bounded Worker Staging (Cycle 2)

## Code Review Summary

### Scope
- Files reviewed:
  - `src/distribution/worker-pool.ts` (365 LOC)
  - `src/distribution/worker-stage-verification.ts` (77 LOC)
  - `src/distribution/build-jobs.ts` (68 LOC)
  - `src/distribution/local-build.ts` (234 LOC)
  - `src/distribution/local-build-staging.ts` (289 LOC)
  - `tests/distribution/bounded-worker-staging.test.mjs` (481 LOC)
- Lines of code analyzed: ~1,514 LOC
- Review focus: Resolution of Cycle 1 findings (concurrency bounding, abort idempotency / OOM elimination, stdio draining, bidirectional stage verification), type safety, build verification, and test robustness under restricted memory budgets (256MB heap).
- Updated plans:
  - `plans/261004-2101-build-generation-performance/phase-03-bounded-worker-staging.md`
  - `plans/261004-2101-build-generation-performance/progress.md`

### Overall Assessment
- **Score: 9.8/10** (Approved / Qualified)
- All 4 defects identified in Review Cycle 1 are resolved and verified:
  1. Concurrency bounding: Each slot awaits child process exit before pulling next queue target; concurrency strictly capped at `min(this.jobs, targets.length)`.
  2. Idempotent abort handling: `abortAllActive` returns cached promise; event listeners guarded against post-abort invocation; zero recursive event loops; stable under restricted 256MB heap.
  3. Stdio stream draining: `stdout` actively resumed; `stderr` bounded to 64KB for failure diagnostics.
  4. Bidirectional output verification: `verifyAndCopyChildStage` enforces bidirectional 1:1 match between reported hashes and filesystem entries, rejecting extra unverified files with `PATH_UNSAFE`.
- Test suite expanded to 17/17 tests passing with 0 failures under both normal execution and `--max-old-space-size=256`.

---

### Verification of Cycle 1 Findings

#### 1. Slot-Based Concurrency Bounding (`src/distribution/worker-pool.ts:318-332`)
- **Status**: **RESOLVED**
- **Analysis**:
  Worker pool allocates exactly `concurrency = Math.min(this.jobs, targets.length)` worker slot loops (`runWorkerSlot`). Each slot pulls a target from the shared queue and directly `await executeTargetJob(target)`. Inside `executeTargetJob`, execution blocks until `await closePromise` (child process `'close'` event).
- **Verification Evidence**:
  - Code inspection confirms that each worker loop is strictly sequential per slot.
  - Concurrency test with synthetic 50ms hold across 4 targets with `jobs=2` records maximum in-flight processes `<= 2`.

#### 2. Idempotent Abort Handler & Heap OOM Prevention (`src/distribution/worker-pool.ts:87-129, 263-273`)
- **Status**: **RESOLVED**
- **Analysis**:
  1. `abortAllActive()` caches and returns `abortPromise` immediately on re-entrant calls (`if (abortPromise) return abortPromise;`).
  2. `aborted = true` and `queue.length = 0` clear pending workload immediately.
  3. `job.status` transitions from `'running'` to `'aborted'`, preventing duplicate IPC signals.
  4. Handlers for `child.on('error')`, `child.on('close')`, `handleSuccess`, and `handleFailure` guard against re-entry (`if (aborted) return;`).
- **Verification Evidence**:
  - Test `worker failure halts execution and cleans up without modifying baseline outputs` executes in ~2.7s with zero timer accumulation.
  - Test suite passes repeatedly under `--max-old-space-size=256` heap limit without memory spikes or V8 GC aborts.

#### 3. Stdio Stream Draining (`src/distribution/worker-pool.ts:152-160, 286-295`)
- **Status**: **RESOLVED**
- **Analysis**:
  `child.stdout?.resume()` continuously drains worker standard output to prevent OS pipe buffer saturation and hang. `child.stderr` listener captures up to 64KB (`stderrBuffer.length < 65536`) and surfaces trimmed diagnostic context upon abnormal process termination (`code !== 0`).
- **Verification Evidence**:
  - Test `child worker stdout producing >64KB drains cleanly without deadlocking` writes >80KB chunks to child stdout without hang or buffer overflow.

#### 4. Bidirectional Stage Output Verification (`src/distribution/worker-stage-verification.ts:42-68`)
- **Status**: **RESOLVED**
- **Analysis**:
  `verifyAndCopyChildStage` verifies:
  1. Forward check: All entries in `outputHashes` exist, are non-symlink regular files, and match expected hashes.
  2. Reverse check: `scanActual` traverses `manifest.outputRoots` and `manifest.projectDocs` in `childStagePath`, collecting all files into `actualFiles`. Any actual file missing from `outputHashes` throws `ControlPlaneError('PATH_UNSAFE', 'Extra unverified file in staged output: ...')`.
- **Verification Evidence**:
  - Dedicated unit tests added to `tests/distribution/bounded-worker-staging.test.mjs`:
    - `verifyAndCopyChildStage verifies and copies valid outputs successfully`: PASS.
    - `verifyAndCopyChildStage rejects extra unverified file with PATH_UNSAFE`: PASS.
    - `verifyAndCopyChildStage rejects content hash mismatch with VALIDATION_INVALID`: PASS.

---

### Critical Issues
None.

---

### High Priority Findings
None.

---

### Medium Priority Improvements
None.

---

### Low Priority Suggestions
1. **File Length in `worker-pool.ts` (365 LOC) and test suite (481 LOC)**:
   - Both files exceed recommended 200 LOC guideline. When time permits, child execution / message wiring can be split into `worker-job-runner.ts` and test cases partitioned by domain. Not blocking qualification.
2. **Strict Symlink Rejection in `scanActual`**:
   - `scanActual` currently checks `if (stat.isDirectory())` and `else if (stat.isFile())`. While `copyStagedTree` and forward hash checks already ignore/reject symlinks, adding an explicit `if (stat.isSymbolicLink()) throw new ControlPlaneError('PATH_UNSAFE', ...)` inside `scanActual` would provide defense-in-depth against unexpected directory entries.

---

### Positive Observations
1. **Flawless Byte Parity**: 100% byte-for-byte equality across all 9 manifest outputs between serial (`jobs=1`) and parallel (`jobs=2`, `jobs=4`) builds.
2. **Robust Fault Tolerance**: When child workers fail or are aborted, temporary job containers (`.evcrate-job-*`) are cleaned up immediately, and baseline outputs remain intact.
3. **Optimistic Freshness Guard**: Input snapshot hash comparison before atomic promotion guarantees stale source edits abort safely.

---

### Recommended Actions
1. **Proceed to Phase 04 / Phase 05**: The bounded worker staging architecture is production-ready for qualification and benchmark measurements.
2. **Maintain Default Concurrency at 1**: As outlined in the plan, keep default build concurrency at `1` until multi-platform performance and RSS benchmarks are qualified across Linux and Windows in Phase 05.

---

### Metrics
- **Type Coverage**: 100% strict TypeScript (`tsc` clean).
- **Test Coverage**: 17/17 passing in `bounded-worker-staging.test.mjs`; 15/15 passing in adjacent distribution suites.
- **Linting Issues**: 0 issues (`npm run lint` clean).
- **Memory Footprint**: Stable under 256MB heap limit (`--max-old-space-size=256`).

---

### Validation Commands & Results
- `npm run build`: **PASS** (prebuild scripts, advisor runtime tsc, main tsc all clean).
- `npm run lint`: **PASS** (`Linting passed`).
- `node --test tests/distribution/bounded-worker-staging.test.mjs`: **PASS** (17/17 tests passing, ~40.5s).
- `node --max-old-space-size=256 --test tests/distribution/bounded-worker-staging.test.mjs`: **PASS** (17/17 tests passing, ~40.8s).
- `node --test tests/distribution/single-projection-manifest-reuse.test.mjs tests/distribution/publication-parity.test.mjs tests/distribution/publication-plan.test.mjs`: **PASS** (15/15 tests passing, ~64.2s).
- `node --test tests/distribution/publication-apply.test.mjs`: **PASS** (14/14 tests passing, ~120s).

---

### Unresolved Questions
None.
