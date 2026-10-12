# Code Review — Phase 07 VSIX/build integration (cycle 2)

Score: 7.5/10 (cycle 1: 6.5). No critical. Cycle-1 High findings mostly resolved; residual fail-open edges in release-side checkers + thin tests.

## Cycle-1 findings status
- FIXED: staging validates descriptor schema, VSIX sha vs descriptor, receipt buildIdentity (overlay-staging.ts); tamper test added.
- FIXED: missing descriptor/VSIX/receipt throws in pack-inventory when manifest has overlay_root; closure throws for missing descriptor/VSIX.
- FIXED: buildIdentity uses node major + `ts.version`; rebuild produced byte-identical VSIX/descriptor/receipt (sha256 diff empty).
- FIXED: verifier recomputes identity from receipt, live input digests, unrecorded `src/*.ts` detection, VSIX-vs-compiled-dist compare, `pathToFileURL`, ZIP: maxOutputLength, CRC32, duplicate, bounds, size caps; verifier reuses builder closure/CRC/identity (DRY).
- FIXED: atomic writes, stale VSIX cleanup, dist clean before compile, code-point sort.

## Critical
none

## Warnings
1. `runtime-closure.cjs validateVscodeCompanionClosure` still fail-open (probed):
   - garbage VSIX + descriptor → `{valid:true, companionVerified:true, filesChecked:0}` (EOCD not found = silent; zero files accepted).
   - corrupt `vscode/manifest.json` → `catch {ignore}` → `{skipped:true}`.
   - dev checkout checks `.cache/.../dist` not VSIX bytes; no VSIX sha vs descriptor; `inflateRawSync` w/o maxOutputLength, no CRC/bounds (zip-bomb); 3rd ZIP parser copy (DRY vs verifier). Fix: require filesChecked>0, throw on bad EOCD/manifest JSON, always inspect VSIX bytes, reuse verifier `parseZipEntries` (dynamic import / shared cjs module).
2. `pack-inventory.cjs verifyPackCompanionArtifacts`: manifest JSON parse error swallowed → overlay check skipped; `projVsixRecord` optional (projection copy absence undetected; manifest `outputs` should require it); no ZIP inspection (hash-only vs descriptor; descriptor+VSIX tampered together passes); receipt presence only; still odd indentation lines 52-54 (nit).
3. `overlay-staging.ts`:
   - integrity block gated by `descOwned && vsixOwned`; receipt check gated by `receiptOwned`. Removing entries from `owned_paths` skips validation (fail-open). Should require all three for vscode.
   - VSIX picked by `endsWith('.vsix')` — not tied to `descriptor.version`/`vsixRelativePath`.
   - bytes verified (read #1) ≠ bytes staged (read #2 in copy loop): TOCTOU gap; read once, hash, write same buffer.
   - hash-only: self-consistent descriptor+VSIX forgery passes staging (no ZIP/identity inspection); acceptable only if BuildManifest hash is trust anchor — state in docs.
   - hardcoded `manifest.id !== 'vscode'` + hardcoded paths in generic overlay helper; duplicates lstat/bounded-read/TOCTOU logic from `pi/index.ts copyOwnedOverlay` (DRY); scan prefix `files/` assumes overlayRoot basename `files` under sourceRoot, not asserted; `foundUnderOverlay.includes` O(n²) trivial.
4. `.evcrate/targets/vscode/manifest.json owned_paths` hardcodes `evcrate-model-bindings-2.11.0.vsix`; version bump → mismatch ("Undeclared/missing owned path") with no generator/test. Either builder updates manifest or test asserts equality with extension version.
5. Builder: closure builtin list hand-written (runtime-closure.cjs uses `isBuiltin`) — drift; non-literal `require(x)` ignored; VSIX manifest engine `[1.140.0,)` hardcoded (use PINNED tuple); id/version unescaped in XML.
6. Verifier ZIP path guard misses `x/..`, drive letters, NUL, absolute Windows; no entry allowlist (extra top-level files OK). Mode auto-detect by `src/` presence; release should pass `--mode` explicitly (prepare-release-assets passes none).
7. `prepare-release-assets.cjs`: companion check runs after `distribute:check` earlier steps? Fail-fast order — run before expensive steps; no producer run.
8. Tests (`vscode-companion-vsix.test.mjs`): non-hermetic (reads live repo artifacts; tmp dir inside repo `.cache`); no overlay merge happy path/collision/symlink/undeclared file/missing owned/descriptor-missing-from-owned; no negative verifier tests (tampered ZIP, wrong identity, stale digest through `verifyVscodeCompanion`); no closure.cjs tests (garbage VSIX); no bump test; no explicit companion `--jobs 1/2` byte parity test (existing parity suite passes though).

## Suggestions
- Single shared ZIP reader module (cjs) used by verifier, closure, pack-inventory.
- Move overlay merge to adapter/shared helper; derive required paths from manifest `overlay` contract instead of vscode id.
- Plan todo 5 (actual packed VSIX install/activation, `code --install-extension`) open; hand-rolled VSIX unvalidated by real VS Code. Phase todos 1,2,4 largely met; 3 met via existing parity suite; 5 open → leave unchecked.
- Prefer `.d.ts` exclusion from VSIX (bloat).

## Positives
- Deterministic ZIP; reproducibility proven; identity excludes self/outputs; Node major pin.
- Verifier thorough; layout-contract reuse; dev/packed modes explicit.
- Staging: symlink-ancestor, regular-only, bounded read, collision, undeclared-file rejection; hash check before projection.
- No new asset/schema; seven-asset boundary untouched.

## Validation
- `npx tsc -p tsconfig.json --noEmit` → clean.
- `node scripts/verify-vscode-companion.mjs` (dev) + `--mode packed-package` → pass.
- `node --check scripts/release/pack-inventory.cjs` → ok.
- `node --test tests/distribution/vscode-companion-vsix.test.mjs` → 9/9 pass.
- `node --test tests/distribution/private-release-artifacts.test.mjs` → 18/18 pass (173s).
- `node --test --test-concurrency=1 input-snapshot-safety single-projection-manifest-reuse bounded-worker-staging` → 29/29 pass.
- Rebuild `node scripts/build-vscode-companion.mjs` → artifacts byte-identical (sha256 diff empty).
- Probes: garbage VSIX → closure valid/filesChecked 0; corrupt manifest → skipped (warning 1).
- Not run: real VS Code install, npm pack/archives end-to-end, release-orchestration.

## Unresolved questions
- Is BuildManifest output hash the sole trust anchor for VSIX (making hash-only staging check intended), or should staging inspect ZIP/identity?
- Should owned_paths version be generated by builder?
- Is `release:check` expected to be authoritative for companion closure, or only verifier?
