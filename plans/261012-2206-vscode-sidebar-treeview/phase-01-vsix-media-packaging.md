# Phase 01 — VSIX media packaging

Priority P2 · Status completed — DONE (100%; 2026-10-12) · Effort 2h · Wave 1, parallel with Phase 02
Completion evidence (2026-10-12): final VSIX SHA-256 `033f0b54466af9ba0ea4828c692cb7538bfbc14ba4c6389b7b2b236d93f4ff5a`; Companion `buildIdentity` `3285fa1e52d6f500095506b3c5b007828cac7646ed27e5aad3c52491aa58fdbe`; integrated tests 163/163 passed.

## Context and ownership
- [Overview / dispatch gate](plan.md); [Phase 03 consumer](phase-03-manifest-wiring-and-tests.md).
- Create `extensions/vscode-model-bindings/media/evcrate-icon.svg`, `scripts/vscode-companion-media.mjs`.
- Modify only `scripts/build-vscode-companion.mjs`, `scripts/verify-vscode-companion.mjs`.
- Read `scripts/release/runtime-closure.cjs` and `tests/distribution/vscode-companion-vsix.test.mjs`; do not edit them. No deletions; no manifest/provider/test/generated-output writes.

## Architecture and constraints
One media inventory feeds both source input enumeration and VSIX records. Preserve existing deterministic ZIP generation, hashing, schemas, and verifier modes. Media helper is build tooling, never an extension runtime dependency. The entrypoint line-limit gate is resolved through the dedicated helper, which remains `<200 LOC`.

Suggested minimal helper contract, fixed in handoff:
- `listCompanionSvgMedia(projectRoot)` returns sorted records `{ sourcePath, archivePath, data }`, with repository-relative source and forward-slash archive paths.
- `assertCompanionMediaEntries(entries)` requires the exact icon archive entry.
- `assertRecordedCompanionMediaInputs(projectRoot, inputs)` checks every current SVG is recorded; existing verifier digest comparison detects edits/deletions of recorded files.
Use existing Node APIs, code-point ordering, and digest functions; no glob/XML/ZIP package or new dependency.

## Completed implementation
1. Add a compact, legible monochrome SVG with `viewBox` and `currentColor` fill/stroke. No fixed theme colors, scripts, external references, embedded raster data, or animation. Intended Activity Bar glyph must work in light/dark/high-contrast themes.
2. Enumerate only flat `media/*.svg` files, with safe basename policy `[a-zA-Z0-9._-]+\.svg`; reject unsafe SVG names rather than silently skipping an icon. Do not recursively broaden archive paths. Require `evcrate-icon.svg` for packaging.
3. In build input enumeration, add all SVG source paths before identity computation; add `scripts/vscode-companion-media.mjs` itself to tracked tooling inputs. Preserve manifest, ambient API, all `src/*.ts`, and existing tooling inputs.
4. Add exactly `<Default Extension="svg" ContentType="image/svg+xml" />` to `[Content_Types].xml`. This is generated XML; no new XML parser or dependency.
5. Append each inventory record to `vsixRecords` as `extension/media/<basename>.svg` with original bytes. Preserve existing record sorting, timestamps, mode, CRC, and embedded `buildIdentity`. Do not place SVG under `extension/dist/`.
6. Extend verifier `isAllowed` with `/^extension\/media\/[a-zA-Z0-9._-]+\.svg$/u`; retain all existing path-safety checks and allowed entries. Require `extension/media/evcrate-icon.svg` in `requiredFiles` / helper assertion in both modes.
7. In `development-checkout`, enumerate current SVG files and reject unrecorded inputs. Reuse live receipt digest checks so changed or deleted recorded SVGs fail freshness. Packed-package mode still validates archive/receipt without looking for extension checkout sources.
8. Hand off owned files plus helper API, exact archive/source paths, and input-tracking details. No build/test/formatter execution; no generated receipts written manually.

Acceptance criteria (met in the integrated parent verification, 2026-10-12)
- Built VSIX contains exactly one `extension/media/evcrate-icon.svg`; its bytes equal the source icon. Embedded manifest's Activity Bar icon path resolves to this entry after Phase 03.
- `[Content_Types].xml` contains the SVG default; existing required entries remain present.
- Every current media SVG and the new helper appears in receipt `inputs` with actual digest; media-only changes change `buildIdentity`. An unchanged rebuild produces identical VSIX bytes.
- Checkout verification rejects an unrecorded newly added SVG, stale modified SVG, and missing recorded SVG. Both modes reject missing icon, nested/unexpected assets, traversal, duplicates, and corrupt ZIP data; safe flat SVG is allowed.
- Packed-package verification needs no media source directory. New `sidebar-tree-provider.js` remains covered by existing JS enumeration after Phase 03.
- Release companion closure accepts static media without scanner changes; compiled extension imports still satisfy zero external runtime dependencies.
- Every new module `<200 LOC`; all touched code complies with the parent-resolved baseline gate. No weakened ZIP allowlist, receipt schema change, generated-output edit, or new outer release artifact.

## Risks / side effects
- A permissive media regex could broaden the ZIP attack surface: retain flat basename allowlist and prior unsafe-path checks.
- Input omission makes an icon-only edit invisible to identity/freshness: use one inventory and track helper source too.
- Existing distribution regression tests may assume the old archive entry set: Phase 03 owner inspects expectations; parent authorizes ownership before any additional test edits.
- Release closure only scans `extension/dist/*.js`; static SVG is data, not an executable/imported module. Keep `runtime-closure.cjs` untouched.

## Dependency and handoff
Phase 01 handoff and Phase 03 integration are complete. The parent final verification completed on 2026-10-12; evidence is recorded above. Live VS Code UX qualification is separate and is not claimed here.

## Unresolved questions
None. Pre-existing packaging entrypoint baseline resolved in [overview](plan.md): keep `scripts/vscode-companion-media.mjs` `<200 LOC` and delegate from the two entry scripts without unrelated refactoring.
