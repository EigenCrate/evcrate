# Phase 04 Companion Provider Runtime — Project Manager Status Report

- **Date:** 2026-10-12
- **Phase:** `plans/261011-2349-vscode-runtime-model-bindings/phase-04-companion-provider-runtime.md`
- **Status:** **DONE (100%)**
- **Quality Score:** Approved (Code Review Cycle 3: 7/10, 0 critical issues; Test Suite Cycle 3: 100% pass, 245/245 tests green)

---

## 1. Achievements

- **Prerequisite Contract Hardening (`W-A`, `W-B`, `W-C`)**:
  - `validateLocalRootUri` canonical serialization round-trip idempotent across spaces, `%`, `?`, `#`, Unicode, Windows drive letters (`/c:/...`); control characters rejected (`W-A`).
  - Extracted leaf module `binding-contracts.ts` breaking circular value-import dependency between `contracts.ts` and `diagnostics-contracts.ts` (`W-B`).
  - Bound actor count `<=512`, enforced string length limits, and verified coherence between `contributed`/`withheld` selectors and reason codes in `validateRuntimeDiagnosticsV1` (`W-C`).
- **Guarded Extension Activation (`extension.ts`, `installation-roots.ts`)**:
  - Implemented `inspectHostGuard`: validates workspace trust, `registerCustomAgentProvider` proposed API availability, and non-remote authority.
  - Fail-closed isolation: unsupported remote authorities (`ssh-remote`, `dev-container`, `wsl`) and untrusted workspaces reject cleanly without fallback to local HOME.
- **Candidate Root Resolution (`installation-roots.ts`)**:
  - Strict precedence: single-folder project > HOME.
  - Inspects `.evcrate-vscode/evcrate/agent-templates/` and `.evcrate-vscode/evcrate/agent-intent.json`.
  - Workspace state approval enforcement (`evcrate.approvedRoots`).
- **Secure Generation Loader (`generation-loader.ts`)**:
  - Manifest parsing with traversal defenses: `validateSafeTemplatePath` checks NUL bytes, directory traversal (`..`), path resolution prefix, and realpath containment.
  - Mandatory SHA-256 verification per template; file size ceiling (`<= 256 KiB`); symlinks rejected.
  - Per-actor error isolation: invalid actors recorded into `withheldReasons`, unaffected actors staged normally.
  - Generation deduplication: template inventory SHA-256 skips staging when unchanged.
- **Agent Template Renderer (`agent-renderer.ts`)**:
  - Injects model selectors into YAML frontmatter; preserves description, tools, arguments, and metadata.
  - Protects fenced code blocks from modification.
  - Re-bases structured relative references without mutating external URLs.
- **Atomic Storage & Single-Instance Provider (`resource-storage.ts`, `agent-provider.ts`)**:
  - Staged in temporary directories and atomically renamed into extension storage (`stageAgentGeneration`).
  - Storage budget bounds (`STORAGE_AND_SOURCE_BOUNDS`) strictly enforced.
  - `CompanionAgentProvider` registers proposed `vscode.chat.registerCustomAgentProvider`; deduplicates change events; honors cancellation tokens.

---

## 2. Testing & Quality Verification

| Target | Command | Status | Details |
|---|---|---|---|
| **Core Build** | `npm run build` | PASS | 0 errors, 1.58s wall |
| **Companion Build** | `npx tsc -p extensions/vscode-model-bindings/tsconfig.json` | PASS | 0 errors, 0.77s wall |
| **Companion Tests** | `node --test tests/vscode-companion/*.test.mjs` | PASS | 13/13 passed (contracts, prerequisite regressions, provider runtime, storage) |
| **Core Adapters** | `npm run test:adapters` | PASS | 232/232 passed (22 test suites) |
| **Total Automated** | All 4 targets | PASS | **245 passed, 0 failed, 0 skipped** |

---

## 3. Plan & Documentation Synchronization

- **Plan Files Updated**:
  - `plans/261011-2349-vscode-runtime-model-bindings/plan.md`: Phase 04 marked DONE (100%, 2026-10-12).
  - `plans/261011-2349-vscode-runtime-model-bindings/phase-04-companion-provider-runtime.md`: Status updated to DONE (100%), todo checklist completed, scope transfers and unresolved items documented.
- **Core Documentation Updated**:
  - `docs/project-roadmap.md`: Updated milestone status line and added Phase 04 entry in Phase and Gate Status table.
  - `docs/system-architecture.md`: Updated section header to reflect Phases 01–04 implemented; added detailed architectural breakdown for Phase 04 components.
- **Docs Manager Coordination**: Coordinated with `EvcDocsManagerPhase04` peer who owns `docs/codebase-summary.md` and `docs/project-changelog.md`.

---

## 4. Risk Assessment & Technical Debt

- **Withdrawal Deduplication Defect**: `activeInventorySha256` is not cleared on `withdrawInventory()`. Restoring identical configuration after withdrawal causes deduplication to skip staging while the provider remains withdrawn/empty. Requires a blocking test regression covering `publish → withdraw → republish identical inventory` and fix during Phase 05 initialization.
- **Scope Transfer (Enrollment & Multi-Root UI)**: Core candidate root inspection/containment and project > HOME rules are implemented in `installation-roots.ts`, but interactive HOME enrollment in `evcrate.selectInstallation` and persisted multi-root window selection are transferred to Phase 05 runtime bindings/picker.
- **Storage Retention Policy**: Confirmed policy is maintained: bounded retention (up to 32 generations / 16 MiB) and manual closed-editor cleanup when safe automatic reclamation is unproven. Exhaustion blocks new derivation without deleting active or potentially referenced resources.
- **Deferred Qualification**: Live native VS Code editor qualification (cross-source plugin hooks, live model invocation, cached-selection races, profile installation) remains deferred to Phase 09 per 2026-10-12 user gate amendment.

---

## 5. Next Steps

- **Phase 05 Priorities (Runtime bindings and picker)**:
  - Implement runtime bindings resolution (`root.actor > user.actor > canonical.inherit > root.tier > user.tier > unresolved`).
  - Interactive model picker UI (`evcrate.configureAgentModels`, `evcrate.configureActorModel`).
  - Address Phase 04 follow-ups: fix withdrawal dedup reset (`publish → withdraw → republish identical inventory`), add HOME candidate quickpick, and persist explicit multi-root window selection.
  - Persist bindings into `.evcrate-vscode/evcrate-bindings.json` (workspace) and global state (user).
- **Execution Call**:
  - Implementation of Phase 04 companion provider runtime is recorded with explicit enrollment/lifecycle follow-ups. Main Agent should review the findings and proceed with Phase 05 execution to implement runtime model bindings and pickers according to the plan specifications.

---

## 6. Unresolved Questions

1. When will HOME root approval UI be integrated into `evcrate.selectInstallation`—Phase 05 runtime bindings picker or separate flow?
2. Should `tests/vscode-companion/*.test.mjs` be wired into root `package.json` scripts (`npm run test:companion`) during Phase 05 or deferred to Phase 07 build integration?
3. Will the 11 untracked companion files and test suites be staged and committed under an atomic Phase 04 git commit before Phase 05 begins?
