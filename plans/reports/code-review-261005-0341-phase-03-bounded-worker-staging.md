# Code Review: Phase 03 — Bounded Worker Staging

## Code Review Summary

### Scope
- Files reviewed:
  - `src/distribution/build-jobs.ts` (68 LOC)
  - `src/distribution/target-worker.ts` (196 LOC)
  - `src/distribution/worker-pool.ts` (350 LOC)
  - `src/distribution/worker-stage-verification.ts` (50 LOC)
  - `src/distribution/input-snapshot.ts` (128 LOC)
  - `src/distribution/local-build-staging.ts` (289 LOC)
  - `src/distribution/local-build.ts` (234 LOC)
  - `src/distribution/index.ts` (22 LOC)
  - `scripts/build-manifests.mjs` (33 LOC)
  - `tests/distribution/bounded-worker-staging.test.mjs` (279 LOC)
- Lines of code analyzed: ~1,649 LOC
- Review focus: Bounded concurrency enforcement, process lifecycle, IPC error handling & cancellation, input snapshotting & stale-input detection, containment verification, single promotion authority, memory stability, type safety.
- Updated plans:
  - `plans/261004-2101-build-generation-performance/phase-03-bounded-worker-staging.md`
  - `plans/261004-2101-build-generation-performance/progress.md`

### Overall Assessment
- **Score: 6.5/10** (Changes Required before qualification)
- The architectural foundation is solid: isolated input snapshotting before build, stale-input abort under transaction locks, parent-owned job containers preventing path traversal, child workers restricted to bounded IPC with no publication authority, and verified 100% byte-for-byte manifest parity.
- However, two **Critical** defects and two **High Priority** issues must be resolved:
  1. **Unbounded Concurrency Race Condition**: Worker slots do not await individual target completion; slots unblock en masse on `Promise.race`, resulting in up to 5 concurrent workers when `jobs=2` and up to 7 when `jobs=4` (violates *"never more than configured jobs"* criterion).
  2. **Infinite Recursive Abort Loop & Heap OOM**: Unguarded `child.on('error')` interacting with `abortAllActive()` recurses up to 113,000+ times within 4 seconds during worker exit/abort, creating hundreds of thousands of timers/promises and crashing with `JavaScript heap out of memory`.
  3. **Unread Child Pipe Buffers**: `stdio: ['pipe', 'pipe', 'pipe', 'ipc']` without listeners or drain risks OS pipe-buffer deadlock on verbose outputs, and completely swallows child error diagnostics on non-zero exit.
  4. **Output Verification Exhaustiveness Gap**: Parent checks reported `outputHashes`, but fails to assert no unverified extra files exist in `childStagePath` before copying.

---

### Critical Issues

#### 1. Unbounded Concurrency Race Condition in `TargetWorkerPool` (`src/distribution/worker-pool.ts:297-320`)
- **Severity**: Critical
- **Problem**:
  In `TargetWorkerPool.run`, concurrency is managed via multiple slot loops:
  ```ts
  const runWorkerSlot = async (): Promise<void> => {
    while (!aborted && queue.length > 0) {
      await launchNext();
      if (activeJobs.size >= this.jobs) {
        await Promise.race(
          Array.from(activeJobs.values()).map((j) => j.closePromise)
        );
      }
    }
  };
  ```
  `launchNext()` returns immediately upon spawning without awaiting the job's completion. The check `if (activeJobs.size >= this.jobs)` is performed *after* launching rather than before. Furthermore, when any single child completes, `Promise.race` unblocks **all** waiting worker slots simultaneously. Every awakened slot immediately shifts the queue and spawns another child process before re-checking concurrency limits.
- **Observed Impact**:
  - Configured `jobs = 2` with 8 targets: **5 concurrent active processes** observed.
  - Configured `jobs = 4` with 8 targets: **7 concurrent active processes** observed.
  Directly violates the Phase 03 plan requirement: *"never more than configured jobs"*.
- **Fix**:
  Each worker slot must take one target from the queue and **await that specific target's execution to completion** before attempting to pull another:
  ```ts
  const runWorkerSlot = async (): Promise<void> => {
    while (!aborted && queue.length > 0) {
      const target = queue.shift()!;
      await executeWorkerJob(target); // Await target completion before pulling next
    }
  };
  ```

#### 2. Infinite Recursive Error Loop & Heap OOM in Worker Cancellation (`src/distribution/worker-pool.ts:87-124, 258-266`)
- **Severity**: Critical
- **Problem**:
  When a child fails or exits unexpectedly:
  1. `handleFailure` calls `void abortAllActive();`.
  2. `abortAllActive()` loops through `activeJobs` and invokes `job.child.send({ type: 'ABORT' })`.
  3. If the child process is already terminating or closed its IPC channel, `child.send()` triggers an `'error'` event on `child`.
  4. The `child.on('error')` handler at line 258 has no guard (`if (aborted) return;`), and immediately calls `void abortAllActive();` again.
  5. This creates an unconstrained recursive ping-pong loop: `abortAllActive -> child.send -> error event -> abortAllActive`.
- **Observed Impact**:
  During test runs with failure scenarios (e.g. `fake-failing-worker.js`), `abortAllActive` executed **113,315 times in under 4 seconds**, generating over 100,000 pending `setTimeout` timers and unresolved promise handlers. Memory spiked from 10MB to 260MB+ (or 4GB+ with default heap) until V8 failed with:
  `FATAL ERROR: Ineffective mark-compacts near heap limit Allocation failed - JavaScript heap out of memory`.
- **Fix**:
  1. Guard `abortAllActive`: return immediately if abortion is already underway (`if (aborted) return; aborted = true;`).
  2. Guard `child.on('error')`: do not invoke `abortAllActive()` if `aborted` is already `true`.
  3. Track per-job abortion state (`job.status = 'aborting'`) so that `{ type: 'ABORT' }` is sent at most once per child.

---

### High Priority Findings

#### 3. Unconsumed Child `stdio: ['pipe', 'pipe', 'pipe', 'ipc']` Risks Deadlock and Discards Errors (`src/distribution/worker-pool.ts:145-147`)
- **Severity**: High
- **Problem**:
  In `worker-pool.ts`:
  ```ts
  const child = spawn(process.execPath, [this.workerScriptPath], {
    stdio: ['pipe', 'pipe', 'pipe', 'ipc']
  });
  ```
  Neither `child.stdout` nor `child.stderr` has data listeners attached, nor are they drained. If any target build produces diagnostics, warnings, or stack traces exceeding the OS pipe buffer (64KB on Linux, 4KB on Windows), the child's `write()` call blocks indefinitely, hanging the build in a silent deadlock.
  Furthermore, when a child worker exits with a non-zero code, all diagnostic messages written to `stderr` are discarded; the parent only reports `Worker for target ${target} exited with status ${code}` without context.
- **Fix**:
  Drain `stdout` and capture up to 64KB of `stderr` for rich diagnostic reporting:
  ```ts
  let stderrBuffer = '';
  child.stderr?.on('data', (chunk) => {
    if (stderrBuffer.length < 65536) stderrBuffer += chunk.toString();
  });
  child.stdout?.resume();
  ```
  Append `stderrBuffer.trim()` to the error message when `code !== 0`.

#### 4. Incomplete Child Output Verification Before Stage Copy (`src/distribution/worker-stage-verification.ts:28-50`)
- **Severity**: High
- **Problem**:
  `verifyAndCopyChildStage` checks that every file declared in `msg.outputHashes` exists, is regular, and matches its hash. However, it does not verify that `outputHashes` accounts for **all** files present within the child stage.
  If a worker stage produces extra unhashed or unauthorized files inside `childStagePath`, `copyStagedTree` copies them directly into the parent assembly stage.
  Phase 03 requirements mandate: *"Child messages are not replacements for parent verification."*
- **Fix**:
  Traverse `childStagePath` output roots on the parent side, collect all actual files, and verify bidirectional 1:1 match against `outputHashes` before copying.

---

### Medium Priority Improvements

#### 5. Type Discrepancy for `--jobs` Option Across Public Signatures (`src/distribution/build-jobs.ts`, `src/distribution/local-build.ts`, `scripts/build-manifests.mjs`)
- **Severity**: Medium
- **Problem**:
  `scripts/build-manifests.mjs` extracts `--jobs` from CLI args as a `string` and passes `{ jobs: jobsArg }` to `runAllManifestsBuild`.
  `LocalBuildOptions.jobs` and `AssembleStageOptions.jobs` are typed strictly as `number`. While runtime `parseJobsValue` accepts strings, TypeScript consumers receive compile-time type errors if passing strings.
- **Fix**:
  Either type `jobs?: number | string;` in build option interfaces, or explicitly parse CLI options with `parseJobsValue(jobsArg)` in `scripts/build-manifests.mjs`.

#### 6. Untrimmed Environment Variable in `resolveBuildJobs` (`src/distribution/build-jobs.ts:45-47`)
- **Severity**: Medium
- **Problem**:
  ```ts
  } else if (process.env.EVCRATE_BUILD_JOBS !== undefined && process.env.EVCRATE_BUILD_JOBS.trim() !== '') {
    requestedJobs = parseJobsValue(process.env.EVCRATE_BUILD_JOBS);
  }
  ```
  If `EVCRATE_BUILD_JOBS=" 2 "`, the check succeeds but passes untrimmed `" 2 "` to `parseJobsValue`, where `/^[1-8]$/.test(" 2 ")` fails and throws `USAGE_INVALID`.
- **Fix**:
  Pass `process.env.EVCRATE_BUILD_JOBS.trim()`, or call `raw.trim()` inside `parseJobsValue` for string inputs.

---

### Low Priority Suggestions

#### 7. File Size Exceeds Standard in `worker-pool.ts` (350 LOC)
- **Severity**: Low
- **Problem**:
  `src/distribution/worker-pool.ts` has 350 LOC (recommended threshold: 200 LOC).
- **Suggestion**:
  Extract child process execution & message handling into a dedicated `worker-job-runner.ts` helper.

---

### Positive Observations
1. **Strict Input Freshness Gate**: `prepareInputSnapshot` captures live tree hashes and verifies the snapshot stage before build; `assertLiveInputsUnchanged` under transaction lock guarantees concurrent workspace edits abort before promotion.
2. **Parent-Only Promotion**: Worker processes have zero access to the publish state or lock directories; all final writes and manifest promotions are strictly parent-controlled.
3. **No Stage Escapes**: Worker stages reside in parent-owned container directories (`.evcrate-job-*`), preventing path traversal or WeakSet identity bypass.
4. **100% Byte Parity**: When running without race errors, all 9 generated manifests are byte-for-byte identical between `jobs=1` and `jobs=2`.
5. **Clean Signal Handling**: Graceful cleanup handlers for SIGINT/SIGTERM properly de-register in `finally` blocks.

---

### Recommended Actions (Prioritized)
1. **Fix Worker Pool Concurrency**: Refactor `runWorkerSlot` so each slot awaits its own job's resolution, strictly capping concurrent workers to `min(jobs, targets.length)`.
2. **Prevent Recursive Abort Ping-Pong**: Add re-entrancy guards to `abortAllActive()`, guard `child.on('error')`, and mark jobs as aborting to eliminate the OOM crash.
3. **Consume Child Stdio Streams**: Add data listeners / drain to `stdout` and capture bounded `stderr` to prevent pipe deadlocks and log failure reasons.
4. **Enforce Bidirectional Stage Verification**: Ensure parent verifies no extra unhashed files exist in child stage before copying into assembly stage.
5. **Normalize `jobs` Types and Environment Trimming**: Support `number | string` in options or parse CLI string arguments explicitly; trim environment variable strings before validation.

---

### Metrics
- **Type Coverage**: 100% strict TypeScript (NodeNext).
- **Test Coverage**: 31/31 tests passing in isolated single-run testing; 4/5 runs fail in repeated failure tests due to recursive abort OOM.
- **Byte Parity**: 100% across serial and parallel builds.
- **Linting Issues**: 0 issues.

---

### Validation Commands & Results
- `npm run build`: **PASS** (prebuild scripts, advisor runtime tsc, main tsc all clean).
- `npm run lint`: **PASS** (`Linting passed`).
- `node --test tests/distribution/bounded-worker-staging.test.mjs`: **PASS (single execution, ~52s)** / **FAIL (repeated run under heap limit, OOM due to recursive abort loop)**.
- `node --test tests/distribution/single-projection-manifest-reuse.test.mjs`: **PASS** (6/6 passing).
- `node --test tests/distribution/validation-and-rollout.test.mjs`: **PASS** (6/6 passing).

---

### Unresolved Questions
- Should the default concurrency for Phase 03 remain strictly `1` until the worker pool concurrency bounding and recursive abort fixes are validated on both Linux and Windows? (Recommended: YES).
