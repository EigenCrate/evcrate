# Code Review — Phase 07 VSIX/build integration

Score: 6.5/10. Scope: untracked/modified files listed by Main; tsc --noEmit clean; verifier + new 7 tests pass. Release suites timed out (200s) — not verified.

## Critical
(none exploitable; but 2 plan success-criteria gaps below are High)

## High
1. Distribution build never validates companion bytes. `overlay-staging.ts` checks path set only; no descriptor/receipt/VSIX hash check. Tamper `.vsix` + descriptor-consistent edits => `distribute build` publishes. Plan: "Tampered/stale companion bytes reject before publication". Only `check:vscode-companion` (release prep) guards. Fix: call verifier contract (descriptor.vsixSha256 vs staged VSIX bytes, version in ownedPaths) inside merge.
2. Missing artifact silently skipped (violates "missing required packed artifact fails"): `verifyPackCompanionArtifacts` `if (!descRecord) return;`; `validateVscodeCompanionClosure` returns `{skipped:true}` when descriptor absent (verified by probe on empty dir). Manifest declares owned_paths, so presence should be mandatory.
3. `validateVscodeCompanionClosure` scans `.cache/.../vscode-model-bindings-dist`, which is NOT in npm `files` => in packed package it checks nothing; never opens VSIX. Pack inventory also never runs ZIP/identity verification of VSIX. Archive proof (npm pack + Linux/Windows archives) only compares sha256 to descriptor. Should invoke verifier packed-mode / parse VSIX entries.
4. Reproducibility: `buildIdentity` hashes `process.version` => embedded `extension/package.json` and VSIX bytes differ across Node patch versions; `prepack` rebuilds after manifests generated => stale vs committed build manifests. Also `typescript` identity read from `devDependencies` range (`^5.9.3` stripped), not installed `ts.version`/lockfile. Drop node version from identity (or from embedded bytes) and use ts.version.
5. Verifier weaker than contract: (a) never recomputes buildIdentity from receipt inputs/tools — packed mode trusts self-consistent descriptor+receipt; (b) dev-mode `liveInputDigests` built only from receipt keys so the "unrecorded input" branch is dead; new `extensions/.../src/*.ts` added after build undetected (build globs `src/*.ts`, tsconfig `src/**`); (c) VSIX content not compared to compiled output.

## Warnings (Medium)
- ZIP parser: no `maxOutputLength` on `inflateRawSync` (zip-bomb), duplicate entry names silently overwritten (Map.set), no CRC check, no bounds check on `dataOffset+compressedSize`, no drive-letter/NUL/dir entry check, no allowlist for unexpected entries. Extra top-level files allowed.
- `import(`file://${path}`)` in verifier breaks on Windows; use `pathToFileURL`.
- Builder: non-atomic write (vsix → descriptor → receipt); stale old-version VSIX left in outDir on bump (then overlay scan fails "Undeclared file"); dist dir not cleaned => deleted-source stale `.js` land in VSIX (clean only if option). `localeCompare` sort => locale-dependent ordering; use code-unit compare.
- `owned_paths` hardcodes `evcrate-model-bindings-2.11.0.vsix`; version bump needs manual manifest edit with no generator/test (plan: "no hand-edits").
- DRY: `overlay-staging.ts` copies `pi/index.ts copyOwnedOverlay` (lstat/bounded read/TOCTOU) — extract shared helper. `manifest.id !== 'vscode'` hardcode in generic helper; merge called from two sites (serial + worker) — pi precedent does it inside adapter.build, avoiding seams. Scan root (`overlayRoot`) vs read root (`sourceRoot/files`) not asserted equal. No aggregate size bound; `foundUnderOverlay.includes` O(n²) (trivial).
- DRY: closure rules duplicated 3x (builder `validateExtensionJsRuntimeClosure`, runtime-closure.cjs, verifier import) with differing builtin lists (hand-listed vs `isBuiltin`). Closure ignores non-literal `require(x)`.
- XML manifest: engine `[1.140.0,)` hardcoded instead of from `extPkg.engines`/PINNED tuple; id/version unescaped. Hand-rolled VSIX never exercised by `code --install-extension` (plan Todo 5 unchecked). `.d.ts` shipped in VSIX (bloat). Two copies of VSIX in package (targets/files + source projection).
- `prepare-release-assets.cjs`: companion check runs after `distribute:check` and no producer run; order should be companion check first (fail fast). Dev-mode auto-detect by presence of `src` dir; release must pass `--mode` explicitly.
- Tests thin vs plan: no overlay merge happy path/collision/symlink/undeclared/post-snapshot mutation, no serial vs `--jobs 2` parity, no packed-mode-without-sources, no tampered/duplicate/traversal ZIP, no stale-digest-through-verifier, none of the listed existing suites (input-snapshot-safety, bounded-worker-staging, private-release-artifacts…) extended; new tests read live repo artifacts (not hermetic).
- `pack-inventory.cjs` odd indentation of `verifyPackCompanionArtifacts(records…); return records; }` (syntax OK, `node --check` pass); eslint/prettier-style nit. `projVsixRecord` optional => projection copy absence not detected.

## Suggestions (Low)
- Generated files mode 0600 (umask) — pack normalizes, ok.
- Consider `@vscode/vsce`-free is KISS-ok but add test vs `unzip -t`/real vsce parse.
- Descriptor/receipt/VSIX as one verified directory digest in build manifest note.
- Phase 07 file Todo list/status not updated by this review (Main owns); mark todos 1-2 partial, 3 unverified, 4 partial, 5 open.

## Positives
- Deterministic ZIP (fixed DOS date, sorted, stored), receipt excludes self/outputs, host tuple pinned/frozen.
- Overlay merge: symlink ancestors, regular-file only, bounded read, TOCTOU recheck, collision reject, undeclared-file reject, runs before `adapter.validate`.
- Contract validators reused (`verifyCompanionLayoutContract`) incl. explicit mode; commands wired into generate:all/prepack; no 8th asset / schema change.

## Validation
- `node scripts/verify-vscode-companion.mjs` → pass (dev + packed).
- `node --test tests/distribution/vscode-companion-vsix.test.mjs` → 7/7 pass.
- `npx tsc -p tsconfig.json --noEmit` → clean.
- `node --check scripts/release/pack-inventory.cjs` → ok.
- Probe `validateVscodeCompanionClosure(emptyDir)` → `{valid:true, skipped:true}` (bypass confirmed).
- `node --test private-release-artifacts + release-orchestration` → timed out at 200s, unverified. Not run: build:vscode-companion (mutates artifacts), jobs 1/2 parity, npm pack, actual VS Code install.

## Unresolved questions
- Should merge validate descriptor/VSIX hash at staging (High 1) or is release-only gating intended?
- Is Node patch version meant to be part of buildIdentity (cross-machine reproducibility vs provenance)?
- Is ownership of `owned_paths` version string meant to be generated by `build:vscode-companion`?
