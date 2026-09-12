# Phase 02 — Context and Manifest Project Bindings

## Context links

- [Master plan](./plan.md)
- [Design contracts §§1, 3–4](./design-contracts.md)
- [Acceptance A02, A09–A13](./acceptance-matrix.md)
- [Pre-plan §§2.1–2.5](../reports/pre_plan_scope_distribute.md)
- [CLI/adapter research §§Invocation context and manifests](./research/researcher-01-cli-protocol-adapters.md)
- Current: `docs/system-architecture.md` §§2–4; `docs/project-overview-pdr.md` FR-2/FR-10

## Overview

- **Date:** 2026-09-12
- **Description:** Normalize manifest-derived project destinations and enforce canonical project identity at the publication boundary without changing projection context.
- **Priority:** P2
- **Implementation status:** Completed (2026-09-12)
- **Review status:** Approved (2026-09-12)

## Key Insights

- Loader already normalizes `output_root` plus `additional_roots` into `TargetManifest.outputRoots`; `projectDocs` is distinct and root-only.
- `SelectedTargetContext` currently exposes generated absolute roots and HOME bindings, but no project descriptors.
- `resolveProjectRoot` is lexical invocation context. Mutation-grade real-directory/owner checks belong later at publication entry.
- Existing `projectIdentity` hashes a resolved root after non-symlink/real-directory checks; publication additionally requires owner control and one canonical path representation.
- Current manifests give Codex `.codex`, `.agents`, `AGENTS.md`; Gemini `.gemini`, `GEMINI.md`; other targets directory roots only.

## Requirements

1. Add immutable project directory-root descriptors and project document descriptors to each selected target context.
2. Source descriptors only from normalized manifest output/additional roots and `projectDocs`; no filesystem ancestor search.
3. Keep documents distinct from directories and preserve manifest/declaration order.
4. Validate duplicate, equal, nested, cross-target, and root/document overlap before publication inventory reads.
5. At project publication/recovery boundary require an existing canonical real, non-symlink, owner-controlled directory.
6. Compute lowercase SHA-256 identity from that canonical absolute directory-root; correlate supplied identity.
7. Preserve `homeBindings`, generated roots, `projectId`, and lexical project-root behavior for non-publication operations.
8. Keep `ProjectionBuildContext` unchanged.

## Architecture

### Dataflow

`schema-2 manifest → loadTargetManifest normalization → targetContext → {homeBindings, projectDirectoryBindings, projectDocumentBindings} → publication-boundary root validation → canonical root + identity → phase planner`

### State transitions

| State | Event | Next state |
|---|---|---|
| lexical project root | non-publication operation | unchanged invocation context |
| lexical root | project publish/recover | validate existence/type/symlinks/owner; canonicalize |
| valid canonical root | hash UTF-8 absolute root | identity-bound project context |
| invalid/overlapping descriptor | normalization/preflight | fail closed before destination read/write |

## Related code files

- **Modify** `src/context/invocation-context.ts`: `SelectedTargetContext`, `InvocationContext`, `targetContext`, `resolveInvocationContext`.
- **Modify if descriptor types belong at manifest boundary** `src/manifests/types.ts`: reuse `TargetManifest.outputRoots`/`projectDocs`; avoid parallel schema.
- **Modify** `src/manifests/manifest.ts`: `loadTargetManifest`, root/doc overlap validation while retaining `output_root`/`additional_roots` compatibility.
- **Inspect/modify** `src/context/target-registry.ts`: preserve selected manifest order and reject registry-level overlap where currently owned.
- **Modify** `src/scopes/identity.ts`: `projectIdentity`, `validateProjectIdentity`; canonical root/owner contract.
- **Reuse/modify narrowly** `src/filesystem/paths.ts`: `assertNoSymlinkAncestors`, `assertRealDirectory`, `assertOwnerControlledDirectory`, containment helpers.
- **Do not modify shape** `src/adapters/types.ts`: `ProjectionBuildContext`, `createProjectionBuildContext`.
- **Modify later in Phase 07** `tests/context/invocation-context.test.mjs`, manifest/publication tests.

No new module is justified: context, manifest loader, identity, and path policies already own each concern.

## Implementation Steps

1. Define one readonly descriptor union or two readonly interfaces for directory roots versus root documents, including target ID, local/generated source, relative destination, and declaration index.
2. Build descriptors in `targetContext` from already-normalized `outputRoots` and `projectDocs`; freeze arrays and records.
3. Centralize overlap comparison on normalized relative paths. Reject equal or ancestor/descendant directory pairs and any document collision across selected targets.
4. Preserve deterministic selected manifest order; never alphabetically reorder declarations unless existing registry policy already does so.
5. Extend `projectIdentity` boundary to obtain and retain a canonical root, verify owner control and non-symlink ancestry, then hash its UTF-8 string.
6. Add a publication-only resolver returning canonical root/identity; general invocation resolution remains lexical.
7. Wire protocol context correlation to the canonical publication identity without repurposing optional `projectId`.
8. Confirm `ProjectionBuildContext` public fields and adapter construction are unchanged.

## Todo list

- [x] Add normalized directory/document descriptors.
- [x] Preserve target and declaration order.
- [x] Reject all descriptor overlap before inventory.
- [x] Add mutation-grade canonical root/identity resolver.
- [x] Keep general invocation semantics and `projectId` independent.
- [x] Assert projection build context unchanged.

## Success Criteria

- All seven contexts expose exact manifest-derived project destinations.
- Codex/Gemini root documents are files and never traversed as directories.
- Invalid root, symlink, owner mismatch, identity mismatch, or overlap fails before plan/state reads.
- HOME and state roots remain independent from project root.
- Projection adapters compile against the unchanged context contract.

Planned focused verification after implementation:

```sh
npm run test:cli
npm run test:primitives
npm run test:adapters
npm run test:publication
```

## Risk Assessment

- **Failure:** descriptor normalization duplicates manifest parsing. **Mitigation:** derive from `TargetManifest` only; no raw JSON reparse.
- **Failure:** canonicalization changes ordinary scope identity. **Mitigation:** use publication-only resolver; leave `projectId` and lexical root behavior intact.
- **Performance:** overlap checks can become quadratic. **Mitigation:** seven fixed targets and bounded roots make a simple sorted interval check or bounded pair scan sufficient.
- **Compatibility:** generated root/doc behavior changes unintentionally. **Mitigation:** descriptors are additive to invocation context; adapter context unchanged.

## Security Considerations

- Owner/non-symlink/real-directory checks are publication authorization, not advisory validation.
- Identity must bind canonical path, not user spelling.
- Reject overlaps before reading destination bytes to avoid information exposure and ambiguous ownership.
- Never search parents for a project marker.

## Next steps/handoffs

- Phase 03 uses descriptors only for tests; adapters remain scope-neutral.
- Phase 04 consumes descriptors to create project harness bindings.
- Phase 05 consumes canonical root/identity for state/workspace descriptors.
- Phase 07 adds context and unsafe-root fixtures.
