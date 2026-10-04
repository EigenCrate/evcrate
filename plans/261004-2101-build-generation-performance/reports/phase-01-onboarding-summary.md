# Phase 01: Linear URI Restoration — Onboarding Summary

## Overview
Phase 01 introduces linear $O(N)$ single-pass indexed token restoration (`restoreIndexedTokens`) across all eight EVCrate target projection adapters, replacing repetitive quadratic $O(M \times N)$ `replaceAll` loops while preserving legacy substitution semantics.

## Onboarding Requirements
- **Environment Variables:** None. No new environment variables required.
- **API Keys / Secrets:** None. This optimization is strictly algorithmic and self-contained within the TypeScript control plane.
- **Dependencies:** None. Zero new runtime or development dependencies added to `package.json`.
- **System / Runtime Requirements:** Unchanged. Node.js `>=22.19.0` and npm remain authoritative.
- **Configuration Flags:** None. The linear restoration helper automatically runs on all standard adapter projection builds. No feature flags or configuration overrides are needed.

## Verification for Developers
To verify local build and projection performance after pulling Phase 01:
```bash
# 1. Compile TypeScript control plane
npm run build

# 2. Run adapter test suite with differential regressions
npm run test:adapters

# 3. Run URI scaling benchmark (5,060 URIs on 242 KB schema)
node scripts/benchmark-uri-restoration.mjs
```

## Next Steps
Proceed to Phase 02: Single-Projection Manifest Reuse (reusing projected target outputs across individual and aggregate manifests to eliminate duplicate adapter invocations).
