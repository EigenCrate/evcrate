# Phase 03 Documentation Status: Bounded Worker Staging

**Date:** 2026-10-05  
**Author:** Phase03DocsManager  
**Status:** Complete  
**Plan Directory:** `plans/261004-2101-build-generation-performance/`  
**Phase:** Phase 03: Bounded Worker Staging  
**Advice Run ID:** `7584567b-1ebb-479c-81f3-765f5acc5b17`  
**Target File:** `plans/reports/phase-03-documentation-status.md`  

---

## 1. Executive Summary

Phase 03 extends the distribution build and manifest generation pipeline by introducing bounded parallel worker staging. While Phase 02 established single-projection manifest reuse (`runAllManifestsBuild`) by deriving all 9 manifests in memory from a single projection pass, all 8 target adapters previously executed serially on a single Node.js event loop thread.

Phase 03 introduces bounded parallel execution across child processes while strictly preserving transaction atomicity and security:
- **Bounded Worker Pool (`TargetWorkerPool`):** Spawns bounded Node.js child processes (`process.execPath`) to execute synchronous adapter projection and validation concurrently.
- **Strict Concurrency Bounding:** Worker slots strictly await process exit before taking the next queue item, mathematically capping active child processes to $\min(\text{jobs}, \text{targets})$.
- **Ephemeral Container Isolation:** Each target builds inside an isolated ephemeral container (`.evcrate-job-*`), preventing target cross-contamination.
- **Input Snapshotting & Optimistic Freshness:** Captures pre-build input snapshots (`prepareInputSnapshot`) and enforces an optimistic freshness guard (`assertLiveInputsUnchanged`) within `promoteTransaction` pre-backup hooks.
- **Bidirectional Stage Output Verification (`verifyAndCopyChildStage`):** Enforces a strict 1:1 match between reported hashes and filesystem entries, device boundary integrity, and symlink prohibition, rejecting unexpected files with `PATH_UNSAFE`.
- **Stdio Pipe Draining & Idempotent Cancellation:** Continuous stdout draining prevents pipe deadlocks (>64KB); stderr capture is bounded to 64KB for failure diagnostics; abort promises are cached and deduplicated to eliminate GC leaks under tight memory limits (256MB heap).
- **Parity Guarantee:** Verified 100% byte-for-byte identity across all 9 manifest files between serial (`jobs=1`) and parallel (`jobs=2`, `jobs=4`) builds.

---

## 2. Architectural Design & Security Boundaries

```
                      +---------------------------------------+
                      |       runAllManifestsBuild()          |
                      |  - prepareInputSnapshot()             |
                      |  - resolveBuildJobs(jobs, count)      |
                      +-------------------+-------------------+
                                          |
                      +-------------------v-------------------+
                      |         assembleLocalStage()          |
                      |  - if jobs <= 1: serial build         |
                      |  - if jobs >  1: TargetWorkerPool     |
                      +-------------------+-------------------+
                                          |
                 +------------------------+------------------------+
                 |                                                 |
+----------------v-----------------+             +-----------------v-----------------+
| Worker Slot 1                    |             | Worker Slot 2                     |
| - spawn(.evcrate-job-1)          |             | - spawn(.evcrate-job-2)           |
| - IPC: BUILD_TARGET              |             | - IPC: BUILD_TARGET               |
| - target-worker builds target    |             | - target-worker builds target     |
| - IPC: TARGET_SUCCESS            |             | - IPC: TARGET_SUCCESS             |
| - verifyAndCopyChildStage()      |             | - verifyAndCopyChildStage()       |
| - child cleans up & exits        |             | - child cleans up & exits         |
+----------------+-----------------+             +-----------------+-----------------+
                 |                                                 |
                 +------------------------+------------------------+
                                          |
                      +-------------------v-------------------+
                      |   deriveManifestView() (in memory)    |
                      |   - 8 single-target manifests         |
                      |   - 1 aggregate manifest              |
                      +-------------------+-------------------+
                                          |
                      +-------------------v-------------------+
                      |       promoteTransaction()            |
                      |   - Hook: assertLiveInputsUnchanged   |
                      |   - Atomic swap: outputs + manifests  |
                      +---------------------------------------+
```

### 2.1 Security & Sandboxing Principles
1. **Single Promotion Authority:** Child workers are strictly execution engines. Workers cannot access publish locks, mutate live project directories, or execute promotion transactions. Only the parent coordinator executes `promoteTransaction`.
2. **Ephemeral Containers:** Workers execute within a parent-owned temporary container (`.evcrate-job-*`). Output directory basenames are validated (`basename === name`), and filesystem device boundaries (`dev`) are asserted.
3. **Bidirectional Stage Verification:** Parent does not trust worker metadata blindly. Forward verification checks all declared hashes against disk; reverse verification walks disk trees to ensure zero undeclared or injected files exist (`PATH_UNSAFE`). Symlinks are prohibited throughout the stage hierarchy.
4. **Optimistic Source Freshness:** Canonical source (`.claude`), `CLAUDE.md`, registry, and advisor controller binaries are fingerprinted before build staging. Immediately prior to promotion, live files are re-checked under the transaction lock. Any drift triggers `PUBLICATION_FAILED` rollback.

---

## 3. Core Implementation Deliverables & API Inventory

### 3.1 Concurrency Resolution (`src/distribution/build-jobs.ts`)

- **Constants:**
  - `MIN_BUILD_JOBS = 1`: Minimum allowed concurrency.
  - `MAX_BUILD_JOBS = 8`: Maximum bounded concurrency.
  - `DEFAULT_MAX_PARALLEL_JOBS = 2`: Safe default parallelism cap.
- **`parseJobsValue(raw: unknown): number`**
  - Parses number or numeric string.
  - Strictly asserts integer in range `[1, 8]`.
  - Throws `ControlPlaneError('USAGE_INVALID')` on non-integers, floats, negative values, `>8`, `NaN`, or malformed strings.
- **`resolveBuildJobs(options: ResolveJobsOptions): number`**
  - Evaluates explicit `options.explicitJobs` first.
  - Falls back to `process.env.EVCRATE_BUILD_JOBS` when set.
  - If unset, calculates bounded default: $\max(1, \min(2, \text{systemParallelism}, \text{targetCount}))$.
  - Always caps requested jobs to `targetCount`.

### 3.2 Input Snapshotting & Freshness (`src/distribution/input-snapshot.ts`)

- **Interfaces:**
  - `InputSnapshotHashes`: Pre-build SHA-256 hashes (`canonicalClaudeHash`, `claudeMdHash`, `targetsRegistryHash`, `controllerHashes`).
  - `InputSnapshotResult`: Contains `shared` inputs (`SharedBuildInputs`), `snapshotStage` (`StagedRoot`), and `snapshotHashes` (`InputSnapshotHashes`).
- **`prepareInputSnapshot(packageRoot: string): InputSnapshotResult`**
  - Hashes live canonical sources (`.evcrate/source/.claude`, `CLAUDE.md`, `.evcrate/targets`, controller binaries).
  - Copies canonical files into private staging root (`.evcrate-snapshot-`).
  - Re-verifies tree hashes of copied files against source hashes.
  - Loads target manifest registry from the isolated snapshot.
- **`assertLiveInputsUnchanged(packageRoot: string, expected: InputSnapshotHashes): void`**
  - Re-computes live filesystem hashes during promotion pre-backup hook.
  - Throws `ControlPlaneError('PUBLICATION_FAILED')` if any file changed during build execution.

### 3.3 Target Worker Process (`src/distribution/target-worker.ts`)

- **IPC Protocol Types:**
  - `WorkerRequest`: `{ type: 'BUILD_TARGET', target, workspacePath, packageRoot, registryPath, canonicalHarnessRoot, sourceRoot }`.
  - `ParentToWorkerMessage`: `WorkerRequest | { type: 'STAGE_ACCEPTED' } | { type: 'ABORT' }`.
  - `WorkerSuccessMessage`: `{ type: 'TARGET_SUCCESS', target, stageBasename, owners, adapterHashes, sourceHashes, outputHashes }`.
  - `WorkerFailureMessage`: `{ type: 'TARGET_FAILURE', target, errorCode, message }`.
  - `WorkerToParentMessage`: `WorkerSuccessMessage | WorkerFailureMessage`.
- **`collectOutputHashes(stagePath: string, manifest: TargetManifest): Record<string, string>`**
  - Recursively traverses `outputRoots` and `projectDocs` under worker stage.
  - Normalizes relative path separators to POSIX `/`.
  - Returns map of relative paths to SHA-256 hex digests.
- **`executeTargetBuild(request: WorkerRequest): { stage: StagedRoot; message: WorkerSuccessMessage }`**
  - Builds target via appropriate adapter (`vscodeAdapter` or `getProjectionAdapter`).
  - Validates output integrity using adapter validation rules.
  - Collects baseline owners and hashes.
  - Cleans up ephemeral stage immediately if an error occurs.
- **`startWorkerListener(): void`**
  - Subprocess listener attached to `process.on('message')`.
  - Sends `TARGET_SUCCESS` or `TARGET_FAILURE` via `process.send`.
  - Automatically cleans active stage and exits upon `STAGE_ACCEPTED` or `ABORT`.

### 3.4 Bidirectional Stage Verification (`src/distribution/worker-stage-verification.ts`)

- **`verifyAndCopyChildStage(childStagePath, containerDev, manifest, outputHashes, destStagePath): void`**
  - **Path Safety:** Calls `assertNoSymlinkAncestors(childStagePath)` and `assertRealDirectory(childStagePath)`.
  - **Device Isolation:** Asserts `Number(lstatSync(childStagePath).dev) === containerDev`; throws `ControlPlaneError('PATH_UNSAFE')` on device mismatch.
  - **Forward Hash Check:** Iterates all entries in `outputHashes`. Asserts file exists, is regular non-symlink file, and SHA-256 matches expected hash. Throws `ControlPlaneError('VALIDATION_INVALID')` or `ControlPlaneError('PATH_UNSAFE')`.
  - **Reverse File Check (`scanActual`):** Traverses filesystem under `manifest.outputRoots` and `manifest.projectDocs`. Asserts every disk file exists in `outputHashes`. Rejects unhashed files with `ControlPlaneError('PATH_UNSAFE')`.
  - **Copy:** Copies verified trees into parent stage via `copyStagedTree`.

### 3.5 Bounded Worker Pool (`src/distribution/worker-pool.ts`)

- **Interface:**
  - `WorkerPoolOptions`: `{ jobs: number | string, packageRoot: string, sharedInputs: SharedBuildInputs, stagePath: string, workerScriptPath?: string }`.
- **`resolveWorkerScriptPath(packageRoot?: string): string`**
  - Locates compiled `target-worker.js` or source `target-worker.ts` across standard distribution locations.
- **Class `TargetWorkerPool`:**
  - `constructor(options: WorkerPoolOptions)`: Normalizes and caps concurrency.
  - `run(targets: readonly PersistedTarget[]): Promise<TargetBuildFacts[]>`:
    - **Slot Concurrency (`runWorkerSlot`):** Spawns $\min(\text{jobs}, \text{targets})$ worker loops. Each slot sequentially pulls from queue and awaits child process exit before shifting next target.
    - **Stdio Pipe Management:** Actively resumes `child.stdout` to continuously drain pipe buffers. Binds `child.stderr` listener with 64KB cap for error diagnostics without OOM risk.
    - **Idempotent Abort (`abortAllActive`):** Caches returned promise; drains queue; transitions jobs to `'aborted'`; sends `{ type: 'ABORT' }` IPC; guards all event listeners (`child.on('error')`, `child.on('close')`, `handleSuccess`, `handleFailure`) against re-entrant calls.
    - **Signal Handling:** Attaches listeners to `process.on('SIGINT')` and `process.on('SIGTERM')`, triggering clean abort and container cleanup.

### 3.6 Local Build Staging Integration (`src/distribution/local-build-staging.ts`)

- **`assembleLocalStage(packageRoot, stage, selectedTargets, options): Promise<StagedBuildResult>`**
  - Resolves effective jobs using `resolveBuildJobs`.
  - If `effectiveJobs <= 1`: Executes targets serially via `buildAndStageTarget`.
  - If `effectiveJobs > 1`: Instantiates `TargetWorkerPool` and awaits `pool.run(selectedTargets)`.
  - Stages advisor controller closure into staging root `.evcrate/bin`.
  - Derives single and aggregate manifest views in memory (`deriveManifestView`).
  - Writes manifests into stage root atomically (`writeAtomicFile`).
  - Returns `StagedBuildResult` with `snapshotHashes` and `allStagedManifests`.

### 3.7 Local Build Entrypoints (`src/distribution/local-build.ts`)

- **`runLocalBuild(packageRoot, selectedTargets, options?: LocalBuildOptions): Promise<VerifiedCurrentBuild>`**
  - Accepts `options.jobs` and `options.emitAllManifests`.
  - Passes snapshot pre-backup validation hook to `promoteTransaction`.
- **`runAllManifestsBuild(packageRoot, options?: LocalBuildOptions): Promise<VerifiedAllManifestsBuild>`**
  - Orchestrates single-pass staging for all 8 targets.
  - Passes concurrency options to `assembleLocalStage`.
  - Atomically promotes outputs and all 9 manifests in a single atomic transaction.

### 3.8 Generator Script Cutover (`scripts/build-manifests.mjs`)

- Parses `--jobs <N>` and `--jobs=<N>` CLI argument.
- Invokes `runAllManifestsBuild(ROOT, jobsArg !== undefined ? { jobs: jobsArg } : {})`.

### 3.9 Public Package Exports (`src/distribution/index.ts`)

- Re-exports new modules:
  - `export * from './build-jobs.js'`
  - `export * from './input-snapshot.js'`
  - `export * from './worker-pool.js'`
  - `export * from './target-worker.js'`
  - `export * from './worker-stage-verification.js'`

---

## 4. QA, Verification & Parity Evidence

### 4.1 Test Suites Execution Matrix

| Test Suite | Tests Run | Result | Duration | Notes |
|---|---|---|---|---|
| `tests/distribution/bounded-worker-staging.test.mjs` | 14 | **PASS** | ~40.5s | Jobs parsing, snapshots, concurrency bounds, stdio drain, aborts |
| `tests/distribution/single-projection-manifest-reuse.test.mjs` | 6 | **PASS** | ~17.2s | Manifest reuse, single-target isolation, policies |
| `tests/distribution/publication-parity.test.mjs` | 5 | **PASS** | ~3.8s | Wire parity & format verification |
| `tests/distribution/publication-plan.test.mjs` | 4 | **PASS** | ~2.5s | Inventory and plan calculation |
| `tests/distribution/release-and-cutover.test.mjs` | 7 | **PASS** | ~6.1s | Release lifecycle, cutover transactions |
| `tests/distribution/validation-rollout.test.mjs` | 6 | **PASS** | ~4.9s | Validation rollouts |
| `tests/distribution/publication-apply.test.mjs` | 14 | **PASS** | ~120s | Publication application & rollback |

### 4.2 Parity & Robustness Guarantees

1. **100% Manifest Byte Parity:**
   - Evaluated between `jobs=1` (serial) vs `jobs=2` (parallel) vs `jobs=4` across all 9 manifest files (`build-manifest.json` + 8 `build-manifest-<target>.json`).
   - All digests and file contents match byte-for-byte with zero deviation.
2. **Restricted Memory Budget Stability:**
   - Ran test suite under `node --max-old-space-size=256 --test tests/distribution/bounded-worker-staging.test.mjs`.
   - All 14 tests passed with zero heap exhaustion or V8 GC aborts.
3. **Fault Tolerance & Pre-Promotion Rollback:**
   - Worker failures, mid-build source edits, or process aborts trigger immediate scratch cleanup (`.evcrate-job-*`).
   - Prior baseline outputs and uncommitted workspaces remain completely unmodified.

---

## 5. Documentation Maintenance & File Size Audit

### 5.1 Size Limit Compliance (`docs.maxLoc`: 800 LOC)
- `plans/reports/phase-03-documentation-status.md`: ~280 LOC (well below 800 LOC limit).
- `docs/system-architecture.md`: 795 LOC (compliant).
- `docs/codebase-summary.md`: 609 LOC (compliant).

### 5.2 Documentation Validation Check
Executed validation script:
```bash
node .evcrate/source/.omp/evcrate/scripts/validate-docs.cjs docs/
```
- **Code References:** 21 validated OK.
- **Internal Links:** 480 working, 0 broken links.

### 5.3 Sealed Path Governance
The following sealed paths were strictly protected and remain untouched:
- `plans/261004-2101-build-generation-performance/plan.md` (SEALED)
- `docs/project-roadmap.md` (SEALED)
- `plans/261004-2101-build-generation-performance/reports/phase-01-*` (SEALED)
- `plans/261004-2101-build-generation-performance/reports/phase-02-*` (SEALED)

---

## 6. Unresolved Questions

1. In Phase 04, should the TypeScript incremental cache (`.tsbuildinfo`) be stored inside `dist/` or under a dedicated cache root such as `.evcrate/cache/tsconfig.tsbuildinfo`?
2. Should `TargetWorkerPool` child IPC event handling be extracted into a dedicated `worker-job-runner.ts` helper during Phase 05 stabilization to reduce `worker-pool.ts` file length?
3. Should the default concurrency in `scripts/build-manifests.mjs` remain bounded at 2 until cross-platform benchmarks (Linux, macOS, Windows) are finalized in Phase 05?
