# Phase 02 Documentation Status: Single-Projection Manifest Reuse

**Date:** 2026-10-05  
**Author:** Phase02DocsManager  
**Status:** Complete  
**Plan Directory:** `plans/261004-2101-build-generation-performance/`  
**Phase:** Phase 02: Single-Projection Manifest Reuse  
**Advice Run ID:** `7584567b-1ebb-479c-81f3-765f5acc5b17`  
**Target File:** `plans/reports/phase-02-documentation-status.md`  

---

## 1. Executive Summary

Phase 02 optimizes build and manifest generation throughput by eliminating redundant target projection passes. Previously, manifest generation executed 9 sequential staging builds (8 single-target builds + 1 aggregate build), projecting each target twice (16 total projection cycles).

Phase 02 introduces `runAllManifestsBuild` and single-projection manifest reuse:
- Projects and validates each persisted target exactly once (`buildAndStageTarget`).
- Gathers pre-verified `TargetBuildFacts` and `SharedBuildInputs`.
- Derives all 8 target manifests (`build-manifest-<target>.json`) and 1 aggregate manifest (`build-manifest.json`) purely in memory (`deriveManifestView`).
- Commits all staged projections and all 9 manifests in a single atomic promotion transaction (`promoteTransaction`).
- Verified 100% byte-for-byte parity across all 9 manifests against sequential baseline.
- Manifest generation wall-clock dropped to ~27.87s (~50% projection execution reduction).

---

## 2. Core Implementation Deliverables

### 2.1 In-Memory Manifest View Derivation (`src/distribution/manifest-view-derivation.ts`)
- **`buildTargetPolicies(manifests: readonly TargetManifest[]): Record<string, unknown>`**
  - Generates canonical `home_policy` dictionary for target manifests.
  - Injects mandatory `advisor-controller` entry: `bindings: { '.evcrate/bin': '.evcrate/bin' }`, `preserve_paths: {}`, `promotion_order: 5`.
- **`deriveManifestView(targetFactsList, shared, stagePath, controllerMetadata, forceTargetId?)`**
  - Pure in-memory computation of manifest payload bytes (`buildManifestBytes`) without disk re-reads.
  - Selective `.evcrate/targets` source hash inclusion: omitted from single-target manifests; included only in aggregate manifest when all targets present.
  - Constructs `DerivedManifestView`: `manifestPath`, `stagedManifestPath`, `manifestData`.
- **Types**: `SharedBuildInputs`, `TargetBuildFacts`, `DerivedManifestView`.

### 2.2 Staging Filesystem Helpers (`src/distribution/local-staging-fs.ts`)
- **`copyStagedTree(source: string, destination: string): void`**
  - Recursively copies staged trees/files, preserving directory structure and POSIX executable mode (`0o111`).
- **`collectBaselineOwners(stagePath: string, rootName: string, owners: Map<string, string>): void`**
  - Traverses staged roots; attributes contained files to `'baseline'` ownership.
  - Normalizes Windows path separators (`\\` -> `/`) ensuring cross-platform owner map consistency.

### 2.3 Single-Pass Staging Assembly (`src/distribution/local-build-staging.ts`)
- **`prepareSharedBuildInputs(packageRoot: string): SharedBuildInputs`**
  - Validates `assertLegacyRootClean`; computes tree hashes for canonical harness (`.claude`), `CLAUDE.md`, target registry, and advisor controller closure.
- **`stageAdvisorController(sourceBin: string, stageBin: string): Record<string, unknown>`**
  - Stages 36-file controller closure into `.evcrate/bin`; sets executable mode on `evcrate-advisor`.
- **`buildAndStageTarget(manifest, shared, stagePath): TargetBuildFacts`**
  - Dispatches to target adapter (`vscodeAdapter` for `vscode`; `getProjectionAdapter` for others).
  - Validates build context; copies staged outputs into main staging root; collects `TargetBuildFacts`.
- **`assembleLocalStage(packageRoot, stage, selectedTargets, options)`**
  - When `options.emitAllManifests` is true: projects 8 targets once, derives all 9 manifest views in memory, writes all 9 manifest files atomically into stage root, returns `allStagedManifests`.

### 2.4 Atomic Promotion & Build Entrypoint (`src/distribution/local-build.ts`)
- **`runLocalBuild(packageRoot, selectedTargets, options?: LocalBuildOptions)`**
  - Supports `options.emitAllManifests`. Assembles promotion pairs for outputs + all 9 manifests for single atomic promotion.
- **`runAllManifestsBuild(packageRoot: string): VerifiedAllManifestsBuild`**
  - Orchestrates single-pass stage assembly and single `promoteTransaction`.
  - Returns `VerifiedAllManifestsBuild`: `aggregateBuild`, `targetBuilds` map (`ReadonlyMap<PersistedTarget, VerifiedCurrentBuild>`), and `allManifestPaths`.

### 2.5 Generator Script Cutover (`scripts/build-manifests.mjs`)
- Replaced sequential 9-iteration build loop with single `runAllManifestsBuild(ROOT)`.

---

## 3. QA & Parity Evidence

- **Test Suite:** `tests/distribution/single-projection-manifest-reuse.test.mjs`
  - `buildTargetPolicies generates mandatory controller policy and target policy entries`: **PASS** (10.89 ms).
  - `deriveManifestView excludes .evcrate/targets for single target and includes it for all targets`: **PASS** (157.88 ms).
  - `runAllManifestsBuild produces 100% byte-for-byte identical manifests compared to sequential runLocalBuild`: **PASS** (57.40 s).
  - `runLocalBuild with emitAllManifests option populates allStagedManifests and produces verified build`: **PASS** (17.24 s).
  - `single target runLocalBuild leaves other target manifests and outputs untouched`: **PASS** (2.43 s).
  - `staging failure leaves prior workspace completely unmodified`: **PASS** (2.48 s).
- **Parity Assertion:** Verified 100% byte-for-byte equality across all 9 manifest files between legacy sequential builds and new single-pass execution.
- **Rollback Invariant:** Intentionally triggered pre-promotion failure (`assertLegacyRootClean`) verified zero partial output leakage and uncommitted workspace preservation.

---

## 4. Documentation Updates Performed

1. **`docs/codebase-summary.md`**:
   - Updated generation metadata and Repomix baseline (2026-10-05, Repomix v1.18.0 compaction).
   - Updated `src/distribution/` module map with `manifest-view-derivation.ts` and `local-staging-fs.ts`.
   - Updated Build, publication, and installer flow detailing single-projection manifest reuse and `runAllManifestsBuild`.
   - Maintained file size at 609 LOC (well below 800 LOC limit).
2. **`docs/system-architecture.md`**:
   - Added Section 4.1 "Single-projection manifest reuse" documenting single-pass projection staging, in-memory view derivation, atomic 9-manifest promotion, and verified build envelopes.
   - Renumbered release workflow and Windows smoke subsections to 4.2 and 4.3.
   - Tightened historical standalone explorer and retired plugin prose.
   - Reduced file size from 806 LOC to 795 LOC (strictly below `docs.maxLoc` 800 limit).
3. **`docs/` Validation Check (`node .evcrate/source/.omp/evcrate/scripts/validate-docs.cjs docs/`)**:
   - 21 code references verified OK (increased from 14 baseline).
   - 480 internal links working (0 broken links).
   - Zero syntax, format, or reference errors in modified files.
4. **Sealed Paths Preserved (Untouched)**:
   - `plans/261004-2101-build-generation-performance/plan.md` (SEALED)
   - `plans/261004-2101-build-generation-performance/phase-01-*` (SEALED)
   - `plans/261004-2101-build-generation-performance/reports/phase-01-*` (SEALED)
   - `docs/project-roadmap.md` (SEALED)

---

## 5. Unresolved Questions

1. Should `isSamePathTree` in `src/distribution/local-build.ts:19-28` (unused dead code) be removed during Phase 03 staging refactor?
2. Should `buildTargetPolicies` in `src/distribution/manifest-view-derivation.ts` and `expectedPolicy` in `src/distribution/build-resolution.ts` be consolidated in Phase 05 benchmark/stabilization?
