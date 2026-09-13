# Advisor Review: Phase 02 Context and Manifest Project Bindings

## 1. recommendation

**APPROVE. Proceed to Step 5 Finalize.** All Phase 02 architectural requirements, invariants, and security boundaries are fully satisfied. All 174 test suite cases pass cleanly, checked-in projections are synchronized with zero drift, and code reviewer awarded 9.5/10 with zero critical findings.

## 2. rationale

- Bounded evidence integrity confirmed: verified source files (`src/manifests/types.ts`, `src/filesystem/paths.ts`, `src/manifests/manifest.ts`, `src/manifests/registry.ts`, `src/scopes/identity.ts`, `src/context/invocation-context.ts`, `tests/context/invocation-context.test.mjs`).
- Immutable descriptors: `ProjectDirectoryDescriptor` and `ProjectDocumentDescriptor` preserve target ID, relative destination, local/generated source under `.evcrate/source`, and exact manifest declaration order.
- Complete overlap protection: `pathOverlaps` and `assertNoDescriptorOverlap` reject equal, ancestor/descendant, root/doc, and duplicate document destinations at both intra-manifest (`loadTargetManifest`) and cross-target (`validateManifestSet`, `resolveInvocationContext`) levels before destination reads or mutations.
- Mutation-grade security boundary: `canonicalProjectRoot` enforces real directory, non-symlink ancestry, owner control (`process.getuid()` or root), and native `realpath` canonicalization. `projectIdentity` computes lowercase 64-hex SHA-256 of the validated canonical absolute path.
- Non-publication safety: `resolveInvocationContext` preserves lexical project root resolution and independent `projectId` for general inspection commands.
- Projection neutrality preserved: `ProjectionBuildContext` in `src/adapters/types.ts` remains byte-for-byte shape-compatible; adapters receive no scope or transaction context.
- Verification passed: 174/174 tests passed across primitives, cli, adapters, publication, and protocol suites; `npm run distribute:check` status ok with zero drift.

## 3. must_fix

- None.

## 4. cautions

- Phase 03 and Phase 04 must consume `projectDirectoryDescriptors` and `projectDocumentDescriptors` strictly in declaration order without alphabetical reordering.
- Root documents (`AGENTS.md`, `GEMINI.md`) must be treated as individual root-level files, never traversed as directory bindings during phase planning.
- Full aggregate `npm test` release-asset regeneration is scheduled under Phase 08; do not prematurely mutate release assets before Phase 08.

## 5. assumptions

- Linux environment is the authoritative runtime target; Windows builds remain supported for archive creation but runtime equivalence is not claimed.
- Target manifest declaration order remains deterministic and immutable across all targets.

## 6. success_checks

- [x] Immutable project directory-root and document descriptors added to SelectedTargetContext and InvocationContext
- [x] Manifest and declaration order preserved without mutation
- [x] Intra-manifest and cross-target overlap rejections pass before inventory reads
- [x] Canonical project root and owner-controlled identity enforced at publication boundary
- [x] Lexical invocation context and projectId remain independent for general operations
- [x] ProjectionBuildContext public shape and adapter construction remain unchanged
- [x] 174/174 tests passing across cli, primitives, adapters, publication, and protocol suites
- [x] distribute:check status ok with zero drift

## 7. unresolved_questions

- None.
