# Phase 5: Target projection adapters

## Context links

- [Plan overview](./plan.md)
- `.evcrate/targets/manifest.json`, `.evcrate/targets/*/manifest.json`
- `migrate_claude_to_*.py`, `copilot_adapter/`, `omp_adapter/`, `pi_adapter/`
- [Copilot/OMP research](../260830-2116-advisor-routing-copilot-omp-control-plane-revalidation/research/researcher-02-copilot-omp-sources.md)

## Overview

Implement seven destination projection adapters behind one staging-only interface in the validated parity order: Claude -> Gemini -> Antigravity -> Codex -> Pi -> OMP -> Copilot. Prove TypeScript output against current Python behavior per target before switching that target.

**Status:** COMPLETE | **Validated:** 2026-09-01 | **Boundary:** staging-only in
the feature worktree; not merged to `main`.

Python migrators remain authoritative for target generation, build/check, HOME
publication, and recovery until each target has a later target-specific cutover
gate.

## Key distinctions

- Persisted targets: `claude`, `codex`, `gemini`, `antigravity`, `pi`, `omp`, `copilot`; `agy` parser alias only.
- All consume canonical `.evcrate/source/.claude/` plus target manifest/adapter sources; generated trees are never adapter inputs.
- These are **projection adapters**, not advisor backends. Do not place CommonJS backend adapters under `src/adapters` or route advisor calls.
- OMP projection adapter and `.evcrate/bin/lib/advisor/adapters/omp.cjs` are independent contracts. Copilot has no advisor backend.

## Adapter interface

Each adapter declares target ID, aliases, capabilities, canonical inputs, manifest/adapter-source closure, output roots, HOME policy, `build(stage)`, and `validate(stage)`. It emits only into isolated staging; shared code owns locks, manifest authorization, promotion, and recovery.

## Completion evidence

All seven adapters are implemented and registered in the fixed order Claude ->
Gemini -> Antigravity -> Codex -> Pi -> OMP -> Copilot. Python snapshot parity is
asserted by `tests/adapters/python-parity.test.mjs`; exact explicit delta counts
and reasons are recorded in `tests/adapters/parity-deltas.mjs` and summarized in
the [master plan completion evidence](./plan.md#phase-5-completion-evidence).

Each adapter writes only its declared isolated staging roots: Claude `.claude`;
Gemini `.gemini` and `GEMINI.md`; Antigravity `.antigravity`; Codex `.agents`,
`.codex`, and `AGENTS.md`; Pi `.pi`; OMP `.omp`; and Copilot `.copilot`.
Validation rejects traversal, graph mutation, missing/extra/hash/mode/symlink/
special outputs, and generated controller markers. OMP command maps and Copilot
managed settings remain target-specific.

`npm run test:phase5` passed with a clean build and **12/12** tests (0 failed,
cancelled, skipped, or todo; cleanup clean). This is staging/parity evidence
only; it does not qualify installed vendor CLIs or authorize HOME publication.

## OMP projection contract

- Input/declarations: `.evcrate/targets/omp/manifest.json`, `migrate_claude_to_omp.py`, `omp_adapter/{__init__,agents,commands,hooks,resources,skills}.py`, shared `pi_adapter/{__init__,frontmatter}.py`, manifest-listed distribution modules.
- Output `.omp`: flattened `cmd-*` commands; agents/skills/hooks; `.omp/evcrate` support; `evcrate/command-name-map.json` (`evcrate-omp-command-map-v1`) as sole mapping authority.
- Local support paths `.omp/evcrate/...`; HOME fallback/global workflow paths `~/.omp/agent/evcrate/...`.
- HOME binding `.omp` -> `.omp`, promotion order 30. No shared JSON/managed-settings merge equivalent.

## Copilot projection contract

- Input/declarations: `.evcrate/targets/copilot/manifest.json`, `migrate_claude_to_copilot.py`, `copilot_adapter/{__init__,agents,commands,bridge,hooks,instructions,inventory,prompts,resources,skills,styles,support}.py`, shared manifest-listed modules.
- Output `.copilot`: `copilot-instructions.md`, `evcrate-cmd-*` user command skills, namespaced `evcrate-*` native agents/skills, hooks, `.copilot/evcrate` support/workflows, inventory, and `evcrate/managed-settings.json`.
- HOME binding `.copilot` -> `.copilot`, promotion order 40, unmanaged collision rejection.
- Merge only `includeCoAuthoredBy`, `effortLevel`, `statusLine` into `$HOME/.copilot/settings.json`, preserving unrelated JSONC bytes/comments.

## Other target requirements

Preserve current Claude, Codex (`.codex` + `.agents`), Gemini, Antigravity, and Pi roots, path rewriting, agent-frontmatter/model transforms, inventories, hooks/scripts, Pi settings/package merge, and publication policies exactly as declared by schema-2 manifests. Model transformation is agent-resource content only; commands and workflows have no mutable model-binding contract in this phase.

## Related code files

- Implemented: `src/adapters/` projection modules only
- Read/compare: current migrators, adapter packages, manifests, generated projections, migration tests
- Never modify/import as adapter: `.evcrate/source/.evcrate/bin/**`

## Implementation steps

1. Define normalized resource graph and staging-only adapter contract.
2. Port Claude and prove byte/hash/error parity.
3. Port Gemini, then Antigravity, then Codex, each behind its independent parity gate.
4. Port Pi with settings/package merge and native-root parity.
5. Port OMP using its command map/path contract and no-shared-JSON policy.
6. Port Copilot last using namespacing, bridge/support, inventory, collision, and managed-key contract.
7. Cut over each target independently; leave its Python adapter authoritative until green and reject mixed-engine atomic transactions.
8. Verify every generated target contains no advisor controller copy.

## Success criteria

- Each target passes file-list, byte, mode, manifest/hash, diagnostics, local projection, and HOME-policy parity or has an approved intentional delta.
- OMP and Copilot are independently selectable and never share path/merge assumptions.
- No projection adapter contains lock/publication code or advisor backend logic.
- Implementation and parity-gate order is exactly Claude, Gemini, Antigravity, Codex, Pi, OMP, Copilot.

## Risks and security

- Parser normalization can alter bytes; use target golden fixtures.
- Treat generated hooks/scripts as inert data during build; reject output outside staging.
- Never generalize Copilot managed JSON or advisor status to another target.

## Resolved planning decision

Adapter order is fixed: Claude, Gemini, Antigravity, Codex, Pi, OMP, Copilot.

## Phase 6 handoff: registry and imports

The next phase is [Resource registry and explicit imports](./phase-06-registry-and-imports.md):

1. Persist the seven target IDs and input-only `agy` normalization through a
   versioned registry that references schema-2 manifests and adapter/helper
   hashes without duplicating target HOME policy.
2. Import only explicit skill, agent, workflow, command, and hook resources into
   canonical `.evcrate/source/.claude/`, recording provenance, compatibility,
   capabilities, and content hashes; reject generated projections, controller
   files, policy files, traversal, symlinks, and unsupported formats.
3. Bind `resources` and `imports` previews/applies to registry revision, source
   hashes, selected target manifests, adapter hashes, projected output hashes,
   expiry, and CAS; request projections through the Phase 5 adapter registry
   while keeping publication in Phase 8.
4. Add duplicate, changed-source, hook-capability, traversal, generated-tree,
   controller/policy exclusion, and stale-preview coverage before any import
   mutation.
