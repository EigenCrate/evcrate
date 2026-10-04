---
title: "Advisor Node-only launch and cross-platform runtime"
description: "Standardize advisor invocation on Node; implement on Linux, enable untested macOS behavior, and qualify the same candidate on native Windows."
status: in-progress
priority: P2
effort: not-estimated
branch: main
tags: [refactor, backend, cross-platform, advisor]
created: 2026-10-03
---

# Advisor Node-only launch

## Goal and decisions

- One maintained launch contract: `node <absolute HOME-owned evcrate-advisor> [args]`; UTF-8 JSON stdin. **No Linux/direct-execution fallback.**
- Scope is `evcrate-advisor`, not redesign of `dist/cli/evcrate.js` or provider executables.
- Linux first; qualify native Windows using the exact Linux-qualified candidate, not WSL.
- User confirmed actual macOS advisor enablement, not launcher-only allowance. User approved macOS **build-only** native helper packaging; no macOS addon/advisor execution or tests.
- Keep entrypoint name/shebang/bin metadata; no new outer wrapper, input API, daemon, or protocol version.
- Preserve Linux/Windows process, storage, human-gate and provider-policy guarantees. Node-only launch is not removal of OS-native internals.

## Design authorities

[Common contract](architecture-contract.md) · [Darwin runtime contract](darwin-runtime-contract.md) · [Acceptance matrix](acceptance-matrix.md) · [Progress overview](progress.md)

Current-state evidence: [repository baseline](research/repository-baseline.md), [caller inventory](research/caller-inventory.md), [platform qualification](research/platform-qualification.md), [Darwin storage](research/macos-storage-design.md), [Darwin process identity](research/macos-process-design.md).

## Phases

Phases 01–05 are complete; Phase 06 is reopened for candidate regeneration after the Phase 07 Rule 94 handback. Phase 07 audit is recorded, but formal qualification is incomplete; Phase 08 remains pending.

| Phase | Deliverable | Status / progress |
|---|---|---|
| [01 — Baseline and contract](phase-01-baseline-contract.md) | Approved source snapshot, exact caller inventory, architecture and ownership boundaries | Review ready / 100% |
| [02 — Node-only callers](phase-02-node-only-callers.md) | Canonical workflows/skills, retained scripts and test launchers use explicit Node | Complete / 100% |
| [03 — Linux launch verification](phase-03-linux-launch-verification.md) | Real isolated lifecycle smoke, launch/error regressions, Windows-safe fixtures prepared | Complete / 100% |
| [04 — Darwin native build](phase-04-darwin-native-build.md) | Safe native primitive contract, arm64/x64 compile-only artifacts and provenance | Complete / 100% |
| [05 — Darwin runtime integration](phase-05-darwin-runtime-integration.md) | State/baseline/history/process/workspace integration; Linux regressions, Darwin untested | Complete / 100% |
| [06 — Package and Linux qualification](phase-06-package-linux-qualification.md) | Generated projections, full Linux gates and hash-identified transfer bundle | Reopened — prior candidate rejected; regenerate and requalify / in progress |
| [07 — Native Windows qualification](phase-07-native-windows-qualification.md) | Same-bundle tests on PowerShell 5.1/7 × Node 22.19.0/24.21.0 | Audit complete; formal qualification invalidated and handed back to Phase 06 under Rule 94 (2026-10-05) |
| [08 — Documentation and handoff](phase-08-documentation-handoff.md) | Evidence-bounded docs, final gates and precise support labels | Pending / 0% |

## Execution and dependency rules

01 → 02 → 03 → 04 → 05 → 06 → 07 → 08. Each phase lists disjoint parallel units; shared-file edits have one integration owner. Research/phase authoring may run in parallel; implementation respects produced contracts/artifacts. Parent runs gates after workers settle; workers skip gates/formatters.

No implementation during plan creation. Preserve existing user dirty work: initial snapshot has 48 modified/32 untracked entries, including VSCode target integration. Current target manifest contains eight targets; do not hardcode historical seven-target docs. Resolve a coherent approved source snapshot before implementation; a commit SHA alone cannot identify dirty candidate bytes.

## Completion boundary

- Every maintained advisor caller and generated instruction uses Node; launch failure is terminal, not direct-exec retry.
- Linux and native Windows receipts identify candidate bytes, runtime versions, scenarios, exit codes and limitations.
- Darwin includes real built artifacts and complete integration; label **implementation present, untested/unqualified**, never "macOS passed".
- No real-HOME rollout, commit, production release, all-provider qualification, or macOS test is implied.
- If later implemented under advice-controlled state, preserve sealed paths and publish completion receipts/live progress outside captured baselines per canonical workflow. Ordinary uncaptured plan status can update normally.

## Confirmed validation decisions

1. macOS: enable actual runtime behavior; no tests.
2. Native helper: controlled macOS build-only packaging permitted; no runtime compilation/download.

## Unresolved prerequisites

Owner-approved snapshot; native Windows runner access; trusted Apple build producer and reviewed compiler/SDK/Node-header/process-API source pins. Missing prerequisites block their future phase, not permission to drop a deliverable. Optional live vendor checks require separate authorization and are not required to finish this plan.

## Planning status

Execution is underway. Phases 01–05 are complete. Phase 06's original task run is sealed, but Phase 06 is reopened to regenerate and Linux-requalify the candidate after Phase 07 found a stale `.omp` build-manifest hash. On 2026-10-05, Phase 07 recorded 111/111 passing native test assertions in the three reachable suites; the separate `node-launch-behavior` gate failed, invalidating formal qualification under Rule 94. The frozen candidate cannot be patched on Windows. Phase 06 owns regeneration and requalification; Phase 08 remains pending. See the [progress overview](progress.md) and [Phase 07 report](reports/phase-07-windows-qualification.md).
