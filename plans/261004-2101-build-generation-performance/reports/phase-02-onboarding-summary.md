# Phase 02: Single-Projection Manifest Reuse — Onboarding & Environment Summary

## Overview
Phase 02 optimizes manifest generation by building each target projection once and deriving both individual target manifests and aggregate metadata in memory before promoting all deliverables in a single atomic transaction.

## Environment & Dependency Requirements
- **Node.js**: `>=22.19.0` (unchanged).
- **Package Manager**: `npm` (authoritative; unchanged).
- **Environment Variables**: None required.
- **External Services / API Keys**: None.
- **Secrets / Credentials**: None.

## Developer Workflows & CLI Commands
1. **Full Build & TypeScript Compilation**:
   ```bash
   npm run build
   ```
2. **Single-Pass Manifest Generation**:
   ```bash
   npm run generate:manifests
   ```
   *Behavior*: Builds 8 persisted target projections once into stage, derives all 9 schema-2 build manifests (8 individual + 1 aggregate), and promotes all outputs and manifests atomically.
3. **Targeted Verification Tests**:
   ```bash
   node --test tests/distribution/single-projection-manifest-reuse.test.mjs
   npm run test:primitives
   npm run test:adapters
   ```

## Transition to Phase 03
- **Prerequisite Met**: Single-pass staging pipeline established and verified with 100% byte parity.
- **Next Phase**: Phase 03: Bounded Worker Staging.
- **Next Goal**: Add worker pool concurrency (`min(2, os.availableParallelism(), targets.length)`) on top of `buildAndStageTarget` without modifying the single-projection manifest reuse contract.
