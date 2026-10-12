# Phase 07 — Hashed VSIX, snapshot and package integration

## Context links
- [Plan](./plan.md); [design contracts](./design-contracts.md); [package research](./research/publication-package-contract.md).
- Dependencies: Phases 03–06 complete real extension/runtime. Never package an unfinished scaffold.

## Overview
- Date: 2026-10-12; priority P1; implementation DONE (100%; completed 2026-10-12); implementation review: Cycle 3 approved (8.5/10, [Cycle 3 review](../reports/code-reviewer-261012-1543-phase-07-vsix-build-integration-cycle-3.md)); test validation: 100% PASS (82/82 tests pass, [Cycle 3 test report](../reports/tester-261012-1539-phase-07-vsix-build-integration-round-3.md)); design-summary review: [Advisor](./reports/advisor-review.md).
- Include private VSIX as verified VS Code harness data while preserving atomic multi-manifest and seven-asset release boundaries.

## Key Insights
- Current input snapshot copies/hashes canonical source, targets tree and compiled JS runtime. An arbitrary live `.cache` VSIX read would escape this contract.
- Existing schema-2 `overlay_root` is available; current VS Code manifest does not declare it.
- CLI/public-index runtime closure does not qualify a VSIX's separate `vscode` external runtime.

## Requirements
- Locked offline compile/package; explicit input receipt and VSIX hash/version/API closure validation.
- Same artifact bytes in serial/worker, aggregate/per-target manifests, npm pack and Linux/Windows archives.
- Existing seven external core release assets, metadata v2 and harness-only journal unchanged.

## Architecture
- New generator compiles completed extension and builds normalized VSIX; writes generated target overlay `files/evcrate/companion/` plus source/closure receipt.
- Manifest declares `.evcrate/targets/vscode/files` as overlay root; snapshot copies whole targets tree. Staging merges only declared validated artifact paths before projection validation.
- Core adapter never accesses live package/cache root or extension `vscode` imports. Separate extension closure verification handles VSIX.

## Related code files
- Create: `scripts/build-vscode-companion.mjs`, `scripts/verify-vscode-companion.mjs`; generated `.evcrate/targets/vscode/files/evcrate/companion/*`.
- Modify: `package.json`, lockfile; `.evcrate/targets/vscode/manifest.json`; `src/distribution/{input-snapshot.ts,input-snapshot-tree.ts,local-build-staging.ts,manifest-view-derivation.ts,target-worker.ts}` only required input/freshness/overlay seams; shared projection expectation helpers if necessary.
- Modify: `scripts/release/{runtime-closure.cjs,pack-inventory.cjs}`, `scripts/prepare-release-assets.cjs` for explicit VSIX checks; no new external asset schema.
- Modify tests: `tests/distribution/{input-snapshot-safety.test.mjs,single-projection-manifest-reuse.test.mjs,bounded-worker-staging.test.mjs,private-release-artifacts.test.mjs,release-orchestration.test.mjs}`; dedicated VSIX closure behavior suite.
- Generate only: target overlays/projections, aggregate + seven target manifests. Delete obsolete `dist/adapters/vscode/models.js` via existing compiler-owned stale cleanup if source retired.

## Implementation Steps
1. Pin extension compiler/types/proposed declarations/VSIX tooling in root lockfile or a deliberately integrated locked extension workspace. No npm install/network during projection. Freeze supported host tuple in VSIX descriptor.
2. Compile extension separately; build VSIX with deterministic entry order/timestamps where supported. Check actual runtime closure (only allowed externals/bundled imports), expected manifest ID/version/proposals and ZIP safety.
3. Emit versioned VSIX/digest/descriptor with embedded build identity and exact source/closure receipt. Enumerate extension sources/import closure, package/tsconfig/API declarations, shared pure helpers, root package/lockfile, build/verifier scripts and pinned tool identities; exclude receipt/output self-reference. Missing development input fails. Private release version-to-build identity is immutable; dev same-version rebuild is explicitly distinguishable.
4. Add schema-2 `overlay_root`; validate containment and exact artifact paths, resolving only under snapshotted targets in both serial/worker paths. Merge with bounded copy/projection expectations before target validation; reject collisions/symlinks. Test mutation of live overlay after snapshot and assert no live-root consumption.
5. Development builds capture/recheck full source receipt at snapshot/promotion before journal. Packed consumers use explicit validated package-layout verification, not absence of sources as a bypass: compare embedded source/compiled identity and actual VSIX/descriptor with verified BuildManifest/package inventory; do not claim checkout freshness. Missing required packed receipt/artifact fails. Test both modes, missing files, stale digest/version and overlay/source mutation; retain BuildManifest v3 exact shape.
6. Integrate commands: proposed `build:vscode-companion`, `check:vscode-companion`; existing `generate:all`, prepack and release preparation call producer before snapshot. Direct distribution build/check requires current prebuilt overlay and actionable missing/stale guidance, never hidden network build.
7. Verify single-projection manifest reuse still projects seven targets once; `--jobs 1` and `--jobs 2` consume identical VSIX bytes and atomically promote all eight manifests. No hand-edits or per-target regeneration loop.
8. Extend npm pack inventory and both platform archive verification to prove VSIX/descriptor hashes. Keep exact seven release filenames/count and controller-free metadata keys; no Marketplace upload or eighth asset.
9. Exercise packed extraction/consumer verification with development sources absent by design, then offline actual profile install of exact bytes; inspect embedded installed identity/activation and proposal-disabled state. Run closure/packaging tests and distribution check after writers settle.

## Todo list
- [x] Offline pinned extension build/VSIX verifier implemented.
- [x] Generated overlay and source receipt bound to snapshot.
- [x] Serial/worker validation/promotion parity proven.
- [x] Package/archive VSIX closure and seven-asset invariants proven.
- [ ] Actual packed VSIX install/activation smoke passed (deferred to Phase 09 per 2026-10-12 user gate amendment).

## Success Criteria
- Tampered/stale companion bytes reject before publication; artifact hashes agree across build, pack and archives.
- Existing target/build/publication/release schemas unchanged; no separate HOME infrastructure install.
- Reproducible input produces byte-stable VSIX or documented tool normalization issue resolved before final package proof.

## Risk Assessment
- Overlay merge currently not guaranteed by API merely because manifest has overlayRoot; implement and test explicit common staging path.
- Build output/source self-reference can break freshness; freeze independent source receipt and exact generator-owned outputs.

## Security Considerations
- ZIP traversal/symlink/import escapes rejected; hashes are integrity, not execution consent.
- Never execute packaged code while validating archive inventory or recovering harness transaction.

## Next steps
- Phase 08 consumes verified published artifact for consented installation; Phase 09 proves integrated packaged candidate.

## Unresolved questions
- Tool normalization and exact overlay validation details settled in Phase 07 via deterministic builder, single read-hash-stage buffer, dev/ino TOCTOU check, and closure/pack inventory tests. Real packed VS Code install/activation smoke (`code --install-extension`) remains deferred to Phase 09 per 2026-10-12 user gate amendment.
