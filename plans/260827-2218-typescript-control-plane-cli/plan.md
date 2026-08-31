---
title: "TypeScript/npm EVCrate Control-Plane CLI"
description: "Deliver a one-shot Node.js control plane while preserving current distribution and advisor boundaries until gated cutover."
status: in_progress
priority: P2
effort: 112h
branch: feat/typescript-control-plane-cli
worktree: /home/loidinh/WS/evcrate-ws/typescript-control-plane-cli
tags: [feature, refactor, cli, typescript, npm, distribution, agent-store]
created: 2026-08-27
revalidated: 2026-09-01
---

# TypeScript/npm EVCrate Control-Plane CLI

## Context links

- Repository: `/mnt/data/ws/sharing/evcrate`
- Implementation destination: branch `feat/typescript-control-plane-cli`, linked worktree `/home/loidinh/WS/evcrate-ws/typescript-control-plane-cli` (created 2026-08-30 from `main` at `3876bc5`)
- Revalidation workspace: [advisor-routing, Copilot, and OMP revalidation](../260830-2116-advisor-routing-copilot-omp-control-plane-revalidation/plan.md)
- Canonical harness input: `.evcrate/source/.claude/`
- Sole authored controller input: `.evcrate/source/.evcrate/bin/`
- Target registry/manifests: `.evcrate/targets/manifest.json`, `.evcrate/targets/*/manifest.json` (schema 2)
- Architecture: `docs/advisor-distribution-architecture.md`, `docs/system-architecture.md`, `docs/codebase-summary.md`
- Related consumer plan: `/home/loidinh/dam-hopper-ws/feat-agent-store-evcrate-control/plans/260825-0051-agent-store-evcrate-control`

## Overview

Build a one-shot TypeScript CLI for resource discovery, explicit imports, scopes, model bindings, target projections, publication, locking, CAS, and recovery. Machine callers exchange bounded versioned JSON over stdin/stdout; no daemon or HTTP service.

Current Python manifests, adapters, build, verification, and HOME publication remain authoritative until each target's TypeScript replacement passes byte/hash, failure, and publication parity and is cut over atomically. The final supported npm path is Python-free.

The existing CommonJS advisor controller is not rewritten or used as a counsel proxy. It remains the sole counsel owner, with its checkpoint/result protocols unchanged, and gains only a versioned qualification diagnostic that validates closure/policy and probes the configured backend/version/auth/model/effort tuple without generating counsel. A dedicated CLI advisor-settings subsystem owns complete-policy `get|preview|apply`; it is separate from registry/scope/model and target publication.

## Current architecture invariants

1. `.evcrate/source/.claude/` is canonical harness input; `.evcrate/source/.evcrate/bin/` is the separate sole authored controller source. Build outputs are derived projections: the Claude target copies canonical input, while `.codex`, `.agents`, `.gemini`, `.antigravity`, `.pi`, `.omp`, and `.copilot` are generated transforms.
2. Persisted target IDs are `claude`, `codex`, `gemini`, `antigravity`, `pi`, `omp`, and `copilot`; `agy` remains parser-only alias for `antigravity`.
3. Build manifests are schema 2 and authorize target sources/outputs plus `controller_hashes`. The controller closure is exactly the 17 entries in `distribution/advisor_controller.py:ADVISOR_CONTROLLER_FILES`.
4. OMP projection and OMP advisor backend are distinct. The projection is generated/published as target `omp`; the enabled backend remains the external CommonJS adapter. Copilot is a generated target only, never an advisor backend.
5. Controller, advisor settings, and generated targets are separately owned artifacts. Generated harnesses contain no controller copy. The dedicated advisor-settings subsystem reads and writes the complete exact v1 policy document with single-use preview tokens, byte/revision CAS, atomic replacement/recovery, redacted output, and safe mode handling; valid manual edits remain supported and cause stale applies to conflict.
6. Copilot publication merges only `includeCoAuthoredBy`, `effortLevel`, and `statusLine` into JSONC settings. OMP has no shared-JSON equivalent. Target HOME promotion order is OMP 30, then Copilot 40.
7. HOME publish consumes a current verified build and never invokes migrators. Checks and dry-runs do not mutate.
8. TypeScript cutover is target-by-target. Python behavior stays authoritative for every uncut target; no wrapper may make unproven TypeScript behavior look authoritative.

## Public CLI scope

`version`, top-level `health`, `advisor settings get|preview|apply`, `resources list|get`, `imports preview|apply`, `scopes list|get|assign|remove|enable|disable`, `models set|unset`, `changes preview|apply`, `publish --dry-run|--apply`, `recover`, and gated `distribute build|check|publish|all|recover`. `health` always invokes the qualification-only CommonJS diagnostic and never requests or generates counsel.

## Phases

| # | Phase | Outcome | State |
|---|---|---|---|
| 1 | [Baseline and worktree](./phase-01-baseline-and-worktree.md) | Preserved baseline plus 2026-08-30 revalidation/handoff | DONE + addendum |
| 2 | [Protocol contracts](./phase-02-protocol-contracts.md) | Stable resource, advisor-settings, and qualification-diagnostic contracts | DONE — 100% |
| 3 | [CLI foundation](./phase-03-typescript-cli-foundation.md) | One-shot shell with health/settings exposure; controller logic stays CommonJS | DONE — 100% in feature worktree; not merged to `main` |
| 4 | [Distribution primitives](./phase-04-distribution-primitives.md) | Schema-2 safety, controller authorization, and bounded policy-file primitives | DONE — 100% in feature worktree; not merged to `main` |
| 5 | [Target adapters](./phase-05-adapters.md) | Seven projections in confirmed parity order, including distinct OMP/Copilot | DONE — 100% in feature worktree; staging-only; not merged to `main` |
| 6 | [Registry and imports](./phase-06-registry-and-imports.md) | Manifest/hash-bound registry; policy remains outside resource ownership | Planned |
| 7 | [Scopes, models, CAS](./phase-07-scopes-models-and-cas.md) | Resource state plus dedicated settings revision/token/apply semantics | Planned |
| 8 | [Publish and recovery](./phase-08-atomic-publish-and-recovery.md) | Separate target-HOME and advisor-settings transactions/recovery | Planned |
| 9 | [DamHopper integration](./phase-09-dam-hopper-integration.md) | External resource subprocess plus top-level qualification health | Planned |
| 10 | [Release and cleanup](./phase-10-release-and-cleanup.md) | Per-target cutover; 17-file controller package; configured-tuple gate | Planned |
| 11 | [Validation and rollout](./phase-11-validation-and-rollout.md) | Per-target matrix, settings/diagnostic proofs, unchanged counsel | Planned |

## Phase 2 completion evidence

**Status:** DONE | **Progress:** 100%

Phase 2 protocol implementation is approved. The bounded v1 contracts now cover:

- [x] Resource control request/result/error/conflict/recovery families with explicit context and the exact seven persisted targets.
- [x] Complete-document `advisor settings get|preview|apply` with redaction, single-use preview tokens, byte/revision CAS, safe modes, atomic replacement, and settings-specific recovery.
- [x] Qualification-only CommonJS diagnostic request/result with closure and exact-policy validation plus configured backend/version/auth/model/effort probes; no counsel generation.
- [x] Existing CommonJS checkpoint/controller/result counsel behavior and the authorized 17-file closure remain unchanged in membership and counsel semantics.
- [x] `agy` is accepted only as an input alias for `antigravity`; it is not a persisted target.

**Bounded validation evidence:** `npm run test:protocol` **16/16** (including TypeScript build), diagnostic **4/4**, advisor-controller **35/35**, and distribution build/CLI **22/22**; aggregate **77/77** scoped tests pass. Tester made no file edits.

## Feature worktree completion evidence

**Status:** Phases 3 and 4 are complete in the linked feature worktree only; the implementation is not merged into `main`.

- The linked worktree's Phase 3 plan (`plans/260831-phase-03-cli-foundation/plan.md`) records 100% completion on branch `feat/typescript-control-plane-cli` in `/home/loidinh/WS/evcrate-ws/typescript-control-plane-cli`.
- Phase 4 completion is recorded at commit `c6381a8` in that worktree; the validated scoped gate is **110/110** (Phase 4 29/29, protocol 18/18, CLI 28/28, Python authority 35/35).

## Phase 5 completion evidence

**Status:** DONE | **Progress:** 100% in the linked feature worktree; staging-only; not merged to `main`

All seven TypeScript projection adapters are registered in the fixed parity order:
Claude, Gemini, Antigravity, Codex, Pi, OMP, Copilot. Python parity is compared
against the current target outputs with the exact explicit records in
`tests/adapters/parity-deltas.mjs` (2,033 records total):

| Target | Python parity reference | Exact recorded deltas |
|---|---|---|
| Claude | Canonical `.evcrate/source/.claude/` | 189 directory records — `Claude generated directory-mode delta` |
| Gemini | `migrate_claude_to_gemini.py` | 797 records (249 directories, 548 files) — `Gemini target serializer or normalizer delta` |
| Antigravity | `distribution.antigravity_publish.build_antigravity_config` | 324 records (225 directories, 99 files) — `Antigravity target rewrite or generated-mode delta` |
| Codex | `migrate_claude_to_codex.py` | 362 records (232 directories, 130 files) — `Codex target serializer or guidance delta` |
| Pi | `migrate_claude_to_pi.py` | 98 file records — `Pi target transform or native-mode delta`; 14 approved `.pi/agent/extensions/evcrate` extras |
| OMP | `migrate_claude_to_omp.py` | 86 file records — `OMP target flattening or serializer delta` |
| Copilot | `migrate_claude_to_copilot.py` | 177 file records — `Copilot target namespace or support delta` |

Each adapter writes only its declared isolated staging roots: Claude `.claude`;
Gemini `.gemini` and `GEMINI.md`; Antigravity `.antigravity`; Codex `.agents`,
`.codex`, and `AGENTS.md`; Pi `.pi`; OMP `.omp`; and Copilot `.copilot`.
Validation rejects traversal, graph mutation, missing/extra/hash/mode/symlink/
special outputs, and generated controller markers.

`npm run test:phase5` passed with a clean build and **12/12** tests (0 failed,
cancelled, skipped, or todo; cleanup clean). This evidence covers staging and
parity only. Python remains authoritative for target generation, build/check,
HOME publication, and recovery until each target's later cutover gate; no
Python-free runtime, HOME publication, live qualification, or `main` merge is
claimed.


## Phase 1 evidence preserved

Baseline commit `61d90b49346e1d01a30a42a76952a3d49a3998c8`: build/check 0; focused 11/11; Python discovery 204/204; Pi 51/51; strictness 33/33; advisor 97/105 with eight expected host-dependent failures; npm audit 21 findings. Historical capture location remains evidence only; new implementation uses the branch/worktree above.

## Definition of done

- Packed `evcrate` runs the supported path on Node >=22.19 without Python, virtualenv, repository-relative imports, daemon, or shell interpolation.
- All seven targets reproduce current source, output, ownership, schema-2 manifest, and HOME behavior; each target cuts over only after its own parity gate.
- Exact 17-file CommonJS controller closure remains singleton, separately owned, and absent from every generated target; its checkpoint/counsel protocols remain fixture-identical while the narrow diagnostic path never generates counsel.
- Top-level `health` validates closure and exact policy, then live-qualifies only the currently configured backend/model/effort tuple through the versioned diagnostic.
- `advisor settings get|preview|apply` manages the complete exact v1 policy with redaction, single-use tokens, byte/revision CAS, atomic replacement/recovery, safe existing-mode preservation, restrictive create mode, and conflicts for intervening manual edits.
- OMP projection tests and OMP backend-adapter qualification remain separate; Copilot is never routed as advisor backend.
- Registry/import/scope/model/preview/apply/CAS/publish/recover contracts are versioned, bounded, deterministic, and crash-safe; advisor settings remain a dedicated non-registry subsystem.
- Copilot managed-key JSONC merge, OMP no-merge behavior, OMP 30/Copilot 40 promotion order, collision/symlink rejection, publish-without-migration, and rejection of mixed-engine atomic transactions are proven.
- DamHopper uses resource operations and top-level qualification health only through the CLI subprocess contract, never as a counsel proxy, and treats generated projections, controller, policy, manifests, and HOME roots as EVCrate-owned artifacts.
- CI/release installs the packed npm artifact, live-qualifies only the configured policy tuple, and proves the final supported runtime is Python-free; Python is removed only after all target and rollback gates pass.

## Warnings

- Do not rewrite or proxy CommonJS counsel behavior from TypeScript. The only controller extension is the boring versioned qualification diagnostic frozen in Phase 2; `health` never generates counsel.
- Do not route advisor settings through registry/scope/model or target HOME publication. Settings apply is a whole-document, exact-schema, atomic CAS transaction that respects manual edits and has distinct recovery.
- Do not treat generated `.omp`/`.copilot` as authored inputs, infer target from `.claude` paths, route Copilot as a backend, or conflate OMP projection with OMP backend qualification.
- Do not generalize Copilot JSONC merge rules to OMP.
- Preserve Phase 1 host-dependent advisor, Codex precedence, Windows process-tree, and dependency-audit gaps as validation gates, not reasons to rewrite counsel routing.

## Validation Summary

**Validated:** 2026-08-30
**Questions asked:** 7
**Recommendation:** Validation-driven revision completed. Proceed with canonical Phase 2 when implementation starts.

### Confirmed decisions

1. `evcrate health` invokes a qualification-only advisor diagnostic; it never requests, rewrites, or generates counsel.
2. The CLI owns `advisor settings get|preview|apply` for the complete exact v1 advisor policy.
3. Policy remains manually user-editable; whole-document apply uses byte/revision CAS, so intervening external edits produce a conflict rather than overwrite.
4. The diagnostic validates the exact controller closure and policy, then probes only selected backend version, authentication, model, and effort without counsel generation.
5. Projection-engine cutover is per target; any atomic transaction spanning Python- and TypeScript-owned targets is rejected.
6. Phase 5 parity order is Claude -> Gemini -> Antigravity -> Codex -> Pi -> OMP -> Copilot.
7. Stable release live-qualifies only the currently configured policy backend/model/effort tuple.

### Action items

- [x] Replaced advisor policy non-ownership assumptions with versioned `advisor settings get|preview|apply` contracts, full-policy validation, single-use tokens, CAS, atomic write/recovery, safe permissions, and redacted output.
- [x] Defined and implemented a boring versioned CommonJS diagnostic request/result boundary for qualification-only health; exact field/error fixtures are frozen in Phase 2, while checkpoint/counsel protocols stay unchanged and Copilot stays outside backend routing.
- [x] Updated phases 2–4 and 7–11, CLI scope, architecture decisions, warnings, and definition of done for the two advisor-control contracts.
- [x] Recorded the confirmed Phase 5 adapter order and configured-tuple-only release qualification gate.

## Unresolved questions

- Which compatibility-window duration and verified consumer inventory authorize final Python deletion?
