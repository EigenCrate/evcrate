# Phase 05 — Generic Transaction Engine, Locks, Fsync, and Retention

## Context links

- [Master plan](./plan.md)
- [Design contracts §§6–7](./design-contracts.md)
- [Acceptance A28–A32, A37–A38](./acceptance-matrix.md)
- [Publication/recovery research §§Transaction, locking, and filesystem findings](./research/researcher-02-publication-recovery-release.md)
- Current: `docs/system-architecture.md` §4; `docs/code-standards.md` filesystem/publication rules

## Overview

- **Date:** 2026-09-12
- **Description:** Parameterize the existing journaled promotion engine for HOME and project transactions while preserving lock, durability, CAS, and cleanup invariants.
- **Priority:** P2
- **Implementation status:** DONE (2026-09-13; 100%)
- **Review status:** Approved (2026-09-13; blocking review correction resolved in the advisor state gate at revision 11; user approved finalization)

## Key Insights

- `publication.ts` now owns one immutable `TransactionDescriptor`-driven stage/backup/promote/CAS engine for HOME and project transactions; no second project publisher exists.
- Project durable state and transaction workspace intentionally remain on different roots: journals live under `<stateRoot>/project-publication/<identity>/`, while stage/backups use the direct project child `.evcrate-publish-<releaseId>` for same-volume rename.
- The engine writes and fsyncs the staged journal before creating the workspace, then records durable workspace identity, promotion progress, marker state, and committed cleanup in order.
- The lock protocol is HOME-outer: project publication acquires the identity-keyed project lock second and holds the HOME lock through shared commit and project harness publication; reverse acquisition is not exposed.
- HOME keeps bounded backup retention; project transactions remove workspace/backups after commit and report no retained release. Intended modes remain source-derived per operation; no global file-mode relaxation was introduced.

## Requirements

1. Introduce an immutable generic transaction descriptor with logical phase, scope, destination root, durable state root, workspace root, selected targets/bindings, identity, retention, and per-source intended-mode provenance.
2. Reuse one stage/backup/promote/CAS engine; do not add a project publisher.
3. HOME scope applies shared+harness in one transaction/release under `<home>/.evcrate/publication`.
4. Project orchestrator preflights both plans and all roots/collisions/volume relationships before any mutation.
5. Acquire HOME lock first and retain it across shared commit and project harness. Acquire project identity lock second; no reverse path.
6. Project durable state: `<stateRoot>/project-publication/<identity>/`; workspace: `<project>/.evcrate-publish-<releaseId>`.
7. Validate destination/state/workspace root, fixed name, owner, containment, device/inode, and same-volume promotion relationships.
8. Write and fsync staged journal before creating workspace; preserve marker, per-operation snapshot/backup/rename, fsync, committed ordering.
9. HOME retains at most one bounded release; project retains none and returns null retained release.
10. Preserve modes, hashes, managed JSON behavior, CAS, and abort/error safety; enforce intended modes per source operation without global file-mode relaxation.

## Architecture

### Dataflow

`PhasePlan + TransactionDescriptor → descriptor/root preflight → ordered lock acquisition → durable staged journal → workspace/stage → CAS backup/promote → touched-dir fsync → intended verification → committed marker → retention/cleanup`

### Transaction states

| State | Durable artifacts | Allowed next state |
|---|---|---|
| absent | none | staged journal |
| staged | journal; workspace absent or newly created; no promoted operations | promoting or safe discard |
| promoting | journal/marker/workspace; operation progress snapshots | recovered rollback or committed |
| committed | committed journal/global marker | finalize retention/cleanup |
| complete | marker only plus optional HOME retained release | next transaction |

### Lock state

`HOME lock acquired → [HOME transaction or shared project prephase] → project lock acquired if project → project harness → project lock released → HOME lock released`.

## Related code files

- **Modify** `src/distribution/publication.ts`: generic descriptor, complete preflight, staged journal/workspace sequencing, promotion, fsync/marker ordering, retention, and HOME/project orchestration.
- **Modify** `src/distribution/publication-recovery.ts`: generic journal fields, workspace identity/progress checks, destination/state/containment validation, fail-closed recovery, and schema-1 HOME compatibility.
- **Modify** `src/distribution/publication-plan.ts`: shared/project phase plans, neutral project materialization, per-source mode provenance, and complete descriptor preflight.
- **Modify** `src/distribution/publication-inventory.ts`: mode-aware snapshots and HOME/project marker validation.
- **Verify** `tests/distribution/publication-apply.test.mjs`: project two-phase apply, preflight, identity, retention, and oversized-result regressions.
- **Verify** `tests/distribution/publication-recovery.test.mjs`: staged/promoting/committed recovery, workspace substitution, operation evidence, and fail-closed compatibility regressions.
- **Reuse unchanged** `src/filesystem/locking.ts`, `src/filesystem/atomic.ts`, and `src/filesystem/paths.ts` for lock, fsync/atomic-write, volume, and containment primitives; no global file-mode relaxation.

No parallel transaction module is justified. If `publication.ts` must be split for file-size maintainability, extract generic helpers once and have both scopes call them; no HOME/project duplicates.

## Implementation Steps

1. Define/freeze descriptor and validate internal invariants (`project` requires identity/no retention/direct-child workspace; `home` requires null identity/HOME state/workspace).
2. Refactor journal generation, staging, backup, promote, verification, and cleanup functions to accept descriptor/phase plan rather than implicit HOME.
3. Add root preflight that records canonical destination/state/workspace parent identities, same-volume relationships, owner control, and containment before locks/mutation.
4. Construct both project descriptors and plans before entering mutation; reject any conflict action or unusable root.
5. Compose locks in one orchestrator: HOME outer, project inner. Ensure recovery/migration callers use the same total order.
6. Change apply sequence to write+fsync staged journal before workspace creation. Record exact workspace name/path derived from release ID.
7. After workspace creation, validate its type, owner, device/inode, name, and containment; stage files with existing bounded/mode-aware writers.
8. Preserve promotion order and per-operation before/intended snapshots. Fsync destination and backup parents before committed transition.
9. Write durable committed journal and global marker before cleanup.
10. Run HOME `cleanupReleases` with one-release bounds. For project, remove stage/backups/workspace after marker commit, set retained ID null, fsync project and state parents.
11. Ensure abort/error path distinguishes no-promotion cleanup from recovery-required state without deleting uncertain artifacts.
12. Hand generic engine ownership of `publication.ts`/`publication-recovery.ts` to Phase 06 for schema-2 orchestration.

## Todo list

- [x] Freeze generic transaction descriptor and invariants.
- [x] Parameterize existing stage/backup/promote/CAS engine.
- [x] Add complete preflight before mutation.
- [x] Enforce HOME-then-project lock order.
- [x] Make staged journal durable before workspace.
- [x] Validate project workspace identity and same-volume behavior.
- [x] Preserve fsync/marker/operation ordering.
- [x] Implement HOME bounded retention and project no-retention cleanup.
- [x] Preserve uncertain-state recovery artifacts.
- [x] Preserve per-source intended-mode provenance without global file-mode relaxation.

## Success Criteria

- [x] HOME shared+harness remains one release and one atomic ordered transaction.
- [x] Project shared and harness use independent releases while the HOME lock remains held across both.
- [x] Complete preflight failures create no journal/workspace and do not mutate HOME/project.
- [x] Reverse lock acquisition is impossible through public/internal entrypoints.
- [x] Every project workspace is the exact direct child `.evcrate-publish-<releaseId>` and same-device with its destination.
- [x] The staged journal is durable before workspace creation; crash windows lead to deterministic recovery.
- [x] Successful project apply leaves no workspace/backups and reports null retention; HOME retains at most one bounded release.
- [x] Recovery and error paths fail closed, preserving uncertain artifacts rather than guessing or deleting them.
- [x] Existing schema-1 HOME recovery compatibility remains available and required.
- [x] Intended file modes are captured and verified per source operation; no global file-mode relaxation was made.

## Completion evidence

- Implementation is complete at 100%; the generic engine covers reusable HOME/project transactions, complete preflight-before-mutation, ordered locks, durable workspace identity, fsync/marker sequencing, bounded HOME retention, project no-retention cleanup, and fail-closed recovery/error handling. Existing schema-1 HOME recovery compatibility remains required.
- The blocking review correction was resolved in the advisor state gate at revision 11, and the user approved finalization.
- **Direct repository evidence:** `npm run build` passed; `npm run test:publication` passed 66/66; `npm run test:integration` passed 14/14.
- Focused recovery regressions in `tests/distribution/publication-recovery.test.mjs` and the oversized-result regression in `tests/distribution/publication-apply.test.mjs` passed.
- Generated projections, manifests, registries, and live operator architecture docs remain outside Phase 05 and were not hand-edited. No live vendor qualification, production HOME publication, or unrun project-wide suite is claimed.

## Risk Assessment

- **Failure:** generalization weakens existing HOME behavior. **Mitigation:** descriptor defaults reproduce current HOME roots/order; retain legacy fixtures.
- **Failure:** journal on state device cannot atomically describe project workspace. **Mitigation:** durability is per filesystem; identity/device/inode validation and explicit partial boundary, not cross-volume atomicity.
- **Failure:** nested lock deadlock. **Mitigation:** one outer orchestrator and no project-first helper.
- **Performance:** copying/staging complete project trees adds I/O. **Mitigation:** preserve bounded traversal and no-op detection; avoid extra source copies/hashes beyond safety checks.

## Security Considerations

- Owner-only state/workspace modes and non-symlink ancestry are mandatory.
- Workspace substitution, device change, inode change, or containment mismatch fails closed.
- CAS before promotion and intended verification after rename remain non-optional.
- Source-derived intended modes are persisted per operation and checked during promotion/recovery; no global file-mode relaxation is permitted.
- Existing schema-1 HOME recovery remains compatible; malformed or ambiguous state fails closed.
- Never delete an uncertain transaction workspace based on name/age alone.

## Next steps/handoffs

- Phase 06 takes serialized ownership of `publication.ts` and `publication-recovery.ts` to add schema 2, migration, isolated recovery, and partial orchestration.
- Phase 07 remains the subsequent focused contract/runtime proof gate; the Phase 05 publication/apply and recovery regressions are complete and recorded above.
