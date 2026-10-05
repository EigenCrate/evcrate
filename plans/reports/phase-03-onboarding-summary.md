# Phase 03: Bounded Worker Staging — Onboarding & Environment Summary

## Overview
Phase 03 implements bounded parallel worker staging for distribution manifest generation. Targets are built in parallel across isolated worker processes, verified bidirectionally, and assembled in parent memory before atomic single-transaction promotion.

## Environment & Dependency Requirements
- **Node.js**: `>=22.19.0` (unchanged).
- **Package Manager**: `npm` (authoritative; unchanged).
- **Environment Variables**:
  - `EVCRATE_BUILD_JOBS` (optional): Bounded worker concurrency integer (`1..8`). Defaults to `min(2, availableParallelism, targetCount)`.
- **Memory Footprint**: Verified stable under 256MB heap (`--max-old-space-size=256`).
- **External Services / API Keys**: None.
- **Secrets / Credentials**: None.

## Developer Workflows & CLI Commands
1. **Full Build & TypeScript Compilation**:
   ```bash
   npm run build
   ```
2. **Manifest Generation with Custom Concurrency**:
   ```bash
   # Default bounded concurrency (up to 2 workers):
   npm run generate:manifests

   # Custom worker count via CLI option:
   npm run generate:manifests -- --jobs=4

   # Custom worker count via environment variable:
   EVCRATE_BUILD_JOBS=4 npm run generate:manifests
   ```
3. **Targeted Verification Tests**:
   ```bash
   # Run bounded worker staging test suite:
   node --test tests/distribution/bounded-worker-staging.test.mjs

   # Run under restricted 256MB heap limit:
   node --max-old-space-size=256 --test tests/distribution/bounded-worker-staging.test.mjs

   # Run full distribution suite:
   node --test tests/distribution/bounded-worker-staging.test.mjs tests/distribution/single-projection-manifest-reuse.test.mjs tests/distribution/release-and-cutover.test.mjs tests/distribution/validation-rollout.test.mjs
   ```

## Transition to Phase 04
- **Prerequisite Met**: Bounded worker staging operational, stable under memory constraints, and verified with 100% byte parity.
- **Next Phase**: Phase 04: TypeScript Incremental Caching.
- **Next Goal**: Integrate TypeScript incremental build caching (`.tsbuildinfo`) to eliminate compilation overhead during manifest builds.
