# Code Review — Phase 07 VSIX/build integration (cycle 3)

Score: 8.5/10 (c1 6.5, c2 7.5). No critical. Cycle-2 fail-open findings fixed; residual = DRY/hardening, no blockers.

## Cycle-2 findings status
- FIXED: staging requires desc+receipt+VSIX declared always (no gating); VSIX tied to `descriptor.version`/`vsixRelativePath`; single read → hash → stage same buffer (TOCTOU closed, lstat dev/ino/size recheck).
- FIXED: closure throws on bad EOCD, corrupt manifest JSON, zero JS files, VSIX sha != descriptor; inflate `maxOutputLength`; inspects VSIX bytes in dev checkout too. Probed: corrupt manifest throws (closure + pack).
- FIXED: pack-inventory: corrupt manifest throws; projection VSIX required + sha vs descriptor (probed: missing projection throws).
- FIXED: verifier allowlist of entries, path guard (`..`, drive, NUL, `\`, abs), CRC32, size caps; prepare-release passes `--mode=development-checkout`.
- FIXED: tests now hermetic overlay (happy/collision/bad basename/undeclared), closure fail-closed, parse rejects traversal/unexpected entry, version-parity (owned_paths vs package version), pack missing-descriptor. 12/12.
- FIXED: xml escape, `PINNED` tuple for engine range, code-point sort.

## Critical
none

## Warnings
1. Closure `validateVscodeCompanionClosure` = 3rd ZIP parser copy (verifier `parseZipEntries` = 1st, ad-hoc here). Weaker than verifier: no CRC, no entry allowlist, no recordCount-vs-parsed check (loop silently ends if CD short), no local-header signature check. Packed-mode release path (closure + pack hash) never runs full `verifyVscodeCompanion`. DRY + defence gap. Fix: shared cjs zip reader, or call verifier in packed mode from release.
2. Fail-open if `overlay_root` removed from vscode manifest: closure/pack return `skipped`/pass (probed). vscode is a required target → release should hard-require, not conditional. Conditional exists only for fixture roots.
3. `overlay-staging.ts` validates only 3 known files; any other declared `owned_paths` file present on disk gets staged unvalidated (e.g. `files/x.sh`, 2nd `.vsix`). Restrict vscode to exact trio or assert no extras. Also scan uses `overlayRoot`, load uses `sourceRoot` + `files/`; not asserted `overlayRoot === join(sourceRoot,'files')`.
4. Hash-only trust: staging accepts self-consistent forged descriptor+VSIX+receipt (receipt buildIdentity == descriptor only). BuildManifest hash is the real anchor — document. 
5. Builder emits every non-`.d.ts`/`.tsbuildinfo` file in dist; verifier allows only `extension/dist/[A-Za-z0-9._-]+.js`. A `.map` or subdir would produce VSIX builder accepts, verifier rejects. Builder should reuse same allowlist/skip non-`.js` (DRY).
6. `owned_paths` hardcodes version; only parity test guards bump (acceptable; message clear). Builder could rewrite manifest but YAGNI.
7. Builder closure ignores non-literal `require(x)`/`import(x)`; closure hand list uses `isBuiltin` now (ok). Verifier `mode` unvalidated in script (relies on layout contract).
8. Plan phase-07 todos still unchecked: 1,2,3,4 now substantively met; 5 (real VS Code install/activation smoke) not performed → leave unchecked. Plan.md status Pending 0%.

## Suggestions
- Single shared `zip-reader.cjs` (verifier/closure/pack).
- Overlay merge: derive required paths from manifest overlay contract not `id === 'vscode'`; fold shared lstat/bounded-read with `pi/index.ts copyOwnedOverlay`.
- `foundUnderOverlay.includes` → Set (trivial).
- Add negative tests: verifyVscodeCompanion w/ tampered ZIP/CRC; closure CRC/zip-bomb; `--jobs 1/2` byte parity for companion explicitly (existing parity suite passes).
- Prepare-release ordering ok (needs `build:all` for dist contracts); no change.

## Positives
- Deterministic VSIX (rebuild byte-identical, sha256 diff empty); identity excludes outputs; Node major pin.
- Verifier thorough, dev/packed modes explicit; zip hardening (bounds, CRC, caps, allowlist).
- Staging: symlink ancestor, regular-only, bounded read, collision, undeclared-file rejection, hash-before-stage; read-once.
- No new asset/schema; seven-asset boundary untouched; `files` glob packs overlay + projection.

## Validation
- `npx tsc -p tsconfig.json --noEmit` → clean.
- `node scripts/verify-vscode-companion.mjs` (dev) + `--mode=packed-package` → pass (sha dc407810…, identity 7f809ba8…).
- `node --check` pack-inventory.cjs, runtime-closure.cjs → ok.
- `node --test tests/distribution/vscode-companion-vsix.test.mjs` → 12/12.
- `node --test --test-concurrency=1` private-release-artifacts, input-snapshot-safety, single-projection-manifest-reuse, bounded-worker-staging → 47/47.
- `node scripts/build-vscode-companion.mjs` rerun → artifacts identical (sha256 diff empty), dist re-emitted (50 files).
- Probes: corrupt manifest closure/pack → throw; missing projection VSIX → throws; manifest w/o overlay_root → skipped/passes (warning 2).
- Not run: real VS Code install, npm pack archive e2e, release orchestration.

## Unresolved questions
- Is BuildManifest output hash the sole trust anchor (hash-only staging intended)?
- Should release hard-require companion for vscode (drop conditional skip)?
- Is packed-mode `verifyVscodeCompanion` expected in `release:check`, or closure/pack hash enough?
- Who flips plan todos 1–4 (reviewer left unchanged)?
