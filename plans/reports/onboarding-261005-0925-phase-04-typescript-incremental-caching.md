# Onboarding & Operations Report: Phase 04 TypeScript Incremental Caching

- Date: 2026-10-05
- Phase: Phase 04 — TypeScript Incremental Caching
- Slug: phase-04-typescript-incremental-caching

## Onboarding Requirements

### 1. API Keys & Authentication
- **Zero API keys required**: All compilation and caching mechanisms execute entirely locally under Node.js and TypeScript compiler binaries. No remote services or external network requests are involved.

### 2. Environment Variables
- **No new mandatory environment variables**:
  - `EVCRATE_BUILD_JOBS`: Existing Phase 03 variable for target worker parallelism remains supported.
  - TypeScript incremental caching operates transparently without requiring custom environment configuration.

### 3. Filesystem & Configuration
- **Automatic cache provisioning**: The cache directory `.cache/evcrate/` is automatically created on first compilation.
- **Git exclusion**: `/.cache/` and `*.tsbuildinfo` are ignored in `.gitignore`, preventing accidental commits of local build state.
- **Package exclusion**: Neither cache files nor receipt files are included in the published npm package closure (verified via `npm pack --dry-run`).

### 4. New Developer Workflows & Commands
- **Standard Build**:
  - `npm run build`: Transparently uses `scripts/build-typescript.mjs` with incremental caching. Emits to `dist/` in ~1.8 s (down from ~4.3 s clean).
- **Clean Build**:
  - `npm run build:clean`: Explicitly invalidates the `.cache/evcrate/` buildinfo and receipt, forcing a complete compilation rebuild from scratch (~2.7 s).
- **Advisor Runtime**:
  - `npm run generate:advisor-runtime`: Transparently caches CommonJS advisor runtime modules into `.cache/evcrate/tsconfig.advisor-runtime.tsbuildinfo`.
- **Automatic Recovery**:
  - Deleting an individual output file (e.g. `dist/index.js` or `dist/index.d.ts`) is automatically detected; the driver invalidates the build info and re-emits all outputs without requiring manual clean commands.
  - Corrupt or truncated cache files are detected and automatically purged before compiler execution.
  - Source renames and deletions trigger automatic removal of stale compiler-owned outputs via tracked receipts.

## Next Steps
- Transition to Phase 05: Parity Verification & Benchmarks (validate byte-for-byte parity across jobs 1/2/4/8, CI contracts, and formal qualification).
