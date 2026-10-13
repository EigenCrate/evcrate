# Phase 04 Documentation Integration Report — Deterministic Advice Activation

**Status:** Cycle 2 review score 9.8/10; ordinary Phase 04 user approved completed 2026-10-06T14:13:41+07:00 / 9.8 review, no durable completion/provider release/commit claim. All W1–W5 findings and S1–S2 refactorings validated. Bounded observed native qualification recorded across six OMP scenario classes. No durable parent advice completion, provider release, or live publication claim.  
**Role:** Sole designated integration writer for shared documentation.  
**Branch:** `feature/deterministic-advice-activation`  
**Package:** `evcrate` 2.9.0 (observed in `package.json`)  
**Date:** 2026-10-06  

---

## 1. Executive Summary and Authority Transition

This report records the complete consolidation and integration of the deterministic advice activation subsystem into the five repository-shared documentation files, incorporating authoritative parent acceptance evidence from `plans/261004-2012-deterministic-advice-activation/reports/phase-04-parent-acceptance.md` and resolving all findings (W1–W5) from Cycle 1 code review (`plans/261004-2012-deterministic-advice-activation/reports/phase-04-review-cycle-1.md`). Deterministic advice activation Phases 01–03 are ordinary user-approved complete with no durable parent run or receipt.

Under explicit single-writer ownership authorized for Phase 04, all five shared documentation files have been updated to reflect the actual implemented code, canonical workflows, multi-target packaging, controller closure boundaries, and bounded observed native qualification.

### Before vs. Current Authority

| Target / Boundary | Before Authority | Current Integrated Authority |
|---|---|---|
| Shared Architecture | Plan-local Phase 01–03 deltas (deferred shared edits) | `docs/system-architecture.md` (3-contract canonical architecture, packaged helper asset distinction, 46-file closure, bounded native scope) |
| Requirements & PDR | FR-11 legacy final-flag & automatic guidance | `docs/project-overview-pdr.md` FR-11 (helper activation, structured handoffs, fail-closed, bounded native scope) |
| Implementation Standards | General bans and legacy 44-file closure | `docs/code-standards.md` (bans on off-mode mentoring / synthetic flags, helper wire contract, 46-file closure, launch invariant) |
| Source Map & Inventories | 44-file closure, legacy 22 canonical paths | `docs/codebase-summary.md` (46-file closure, 30 canonical paths, neutral workflow anchors, multi-target projection owners) |
| Project Changelog | Phase 09/10 historical records, no activation entry | `docs/project-changelog.md` (dated 2026-10-06 implementation facts, bounded native scope, no DONE claim) |

---

## 2. Actual Changed Paths, Line Counts, and Docs Validator Audit

### 2.1 File Line Counts ($\le 800$ LOC Budget)
All edited files satisfy the strict `docs.maxLoc` limit.

#### Latest Terminal Tester Validation Receipt (Authoritative Newline Counts)
Observed in `plans/261004-2012-deterministic-advice-activation/reports/phase-04-review-corrections-validation.md` (tester toolResult `acfe214f`):

| File Path | Role | Authoritative Newlines | Limit Status |
|---|---|---:|---|
| `docs/system-architecture.md` | Core architecture authority | 775 | PASS (<= 800) |
| `docs/project-overview-pdr.md` | Product development requirements | 628 | PASS (<= 800) |
| `docs/code-standards.md` | Code standards and architectural bans | 750 | PASS (<= 800) |
| `docs/codebase-summary.md` | Source-of-truth and module map | 686 | PASS (<= 800) |
| `docs/project-changelog.md` | Project changelog mirror | 792 | PASS (<= 800) |
| `plans/reports/phase-04-documentation-integration.md` | Shared plan integration report | <250 | PASS (<= 800) |
| Total (5 shared docs) | Shared documentation baseline | 3,631 | PASS (all <= 800) |

*Historical count convention note (Cycle 2 Review L1): An earlier pre-correction audit recorded `776, 629, 751, 687, 793` lines due to a newline/split counting convention that reported counts one higher. The terminal tester validation receipt (`acfe214f`) and current post-finalization measurements establish the authoritative newline counts above (`775, 628, 750, 686, 792`). Both conventions confirm all files remain strictly under 800 LOC.*

### 2.2 Documentation Validator Output
Authoritative tester validation receipt (`node .evcrate/source/.claude/scripts/validate-docs.cjs docs/`, toolResult `591de560`):
- **Exit code:** 0 (12 files audited).
- **Passing checks:** 18 code references validated; **485 internal links working** (improved from 483 in pre-correction run).
- **Observed validator warnings only (baseline not established; not claimed as zero warnings):**
  - 99 code reference warnings (design terms and historical classes).
  - 6 broken internal links (pointing to historical phase review reports).
  - 105 config key warnings (non-env config constants flagged by env scanner).
- Current finalization edits maintain these verified counts without requiring new test runs or formatters.
---

## 3. Implemented Subsystem Details and Source Citations

### 3.1 Packaged Helper and Deterministic Activation Flow
- **Helper binary / asset:** `.evcrate/source/.evcrate/bin/evcrate-advice-mode` (shebang: `#!/usr/bin/env node`). Package metadata in `package.json` declares npm bins only `evcrate` and `evcrate-advisor`; `evcrate-advice-mode` is packaged in the controller closure as a HOME-owned asset, not an npm CLI binary on PATH (W3).
- **Core modules:**
  - `lib/advisor/activation.cjs`: exports `parseAdviceArguments`, `parseActivationRequest`, `evaluateActivation`, and byte limits (`MAX_INPUT_BYTES = 64 KiB`, `MAX_RAW_BYTES = 32 KiB`, `MAX_OUTPUT_BYTES = 256 KiB`).
  - `lib/advisor/errors.cjs`: sanitized routing error catalog containing seven activation diagnostics (`ADVICE_MODE_INVALID`, `ADVICE_MODE_OVERSIZED`, `ADVICE_MODE_DUPLICATE_FLAG`, `ADVICE_HANDOFF_INVALID`, `ADVICE_CONTEXT_MISMATCH`, `ADVICE_HANDOFF_STALE`, `ADVICE_RUN_COMPLETED`).
- **Execution invariant:** Executed with supported Node (`>=22.19.0`) with absolute HOME path (`node "$HOME/.evcrate/bin/evcrate-advice-mode"`), zero positional options, and canonical project cwd.
- **Wire and exit rules:**
  - Standard input: max 64 KiB UTF-8 JSON (`protocol: "evcrate-advice-mode"`, version 1).
  - Terminal output: max 256 KiB JSON. Input and output have 2-second deadlines.
  - Process exit: 0 on successfully delivered `status: "MODE_READY"`; 1 on failure or undeliverable output.
  - Fail-closed: missing/unreadable helper, unsupported Node, malformed input, context mismatch, or stale revisions halt routing immediately with a sanitized four-key diagnostic (`{ code, category, action, message }`). No fallback parser, auto-install, retry loop, or heuristic mode inference.
- **Mode evaluation & Helper vs. Workflow distinction:**
  - `off` (reason: `NO_FINAL_FLAG`): The `evcrate-advice-mode` helper performs zero state init, zero get (`L=0`), and never loads mentoring. The canonical workflow in off mode preserves ordinary execution; neutral historical progress inspection can perform identified `state get` via `plan-progress.md` without activating advice.
  - `explicit` (reason: `EXPLICIT_FINAL_FLAG`): Exactly one whitespace-delimited standalone final `--advice` token; duplicate tokens reject; quoted/embedded/non-final tokens remain work text. Mentoring loads only after helper confirms explicit mode.
  - `inherited`: Structured caller handoff without synthetic flags or eager run creation.
    - `INHERITED_PRE_RUN`: Routers (`/cmd-cook`, `/cmd-fix`) forward context with `run: null`, preserving known plan/phase selections without synthetic flags or eager router state init.
    - `INHERITED_SAME_RUN`: Continuation delegates forward verified binding; lazy get validates project/phase/revisions; completed or abandoned runs fail closed (`ADVICE_RUN_COMPLETED`).

### 3.2 Canonical Three-Contract Workflow Architecture
Under `.evcrate/source/.claude/workflows/`, authoring separates concerns across three contracts (W4):
1. `advice-activation.md`: Neutral activation helper invocation, bounded transport, mode evaluation (`off`, `explicit`, `inherited`), conditional mentoring loading prerequisite, and fail-closed escalation.
2. `plan-progress.md`: Neutral historical progress inspection via `state get` only. No `init`, `checkpoint`, `claim`, `attach`, `inference`, `disposition`, `complete`, or lifecycle writes. Existing get may acquire/release locks and reap provably dead locks, but durable state/ledger is unchanged. Association requires matching project identity, repo-relative plan/phase paths, controller phase, and snapshot digest (UUID alone is not authority). Completed scope is a verified no-op; controlled unresolved scope pauses cleanly without automatic resumption, replacement UUID, or gate bypass.
3. `advisor-mentoring.md`: Loaded conditionally ONLY upon resolved `explicit` or `inherited` mode. Section `#caller-lifecycle-binding` governs active advice checkpoints; off mode forbids eager mentoring through navigation, loops, or fallback prompts; off mode preserves ordinary debugging, reviewer corrections, validation, approvals, and command-scoped Git policy without advice lifecycle calls (L=0).

Total canonical production paths: **30** (22 commands under `commands/`, 6 workflows under `workflows/`, 2 agents under `agents/`).

### 3.3 Exact 46-File Controller Closure Parity
The controller closure is verified at **exactly 46 files**:
- 38 shared/Windows entries: `evcrate-advisor`, `evcrate-advice-mode`, and 36 `lib/advisor/` CommonJS/generated/data files (including `activation.cjs`, `errors.cjs`, `windows-native.cs`, `windows-native.ps1`).
- 8 Darwin assets: `lib/advisor/darwin-platform.cjs`, native source files (`advisor-native.c`, `advisor-native.h`, `process.c`, `storage.c`), provenance `artifacts.json`, and prebuilt addons (`darwin-arm64/advisor-native.node`, `darwin-x64/advisor-native.node`).
- Verification authorities:
  - `scripts/generate-controller-inventory.mjs`: declares all 46 files.
  - `src/manifests/controller-inventory.generated.ts`: generated frozen list.
  - `src/manifests/controller.ts`: validates closure and verifies `#!/usr/bin/env node` shebang on both entrypoints (`evcrate-advisor` and `evcrate-advice-mode`).

### 3.4 Multi-Target Packaging and Transports
- **OMP:** Native custom-command gate (`src/adapters/omp/activation.ts`, `src/adapters/omp/commands.ts`) admits commands via `execute(args, ctx, rawArgs)` before model turn; instruction resources in `evcrate/commands/<mapped-name>.md`; headless stderr diagnostics.
- **Pi:** Installation-root contained resources (`command-files.js`, `command-tool.js`, `paths.js`), manifest-owned `type: module` package boundary for extension `.js`, static TypeBox imports (`import { Type } from "typebox"`), zero production dependencies.
- **Copilot:** Unconditional workflow preload removed in `src/adapters/copilot/prompts.ts`; conditional activation reads.
- **Gemini:** Standalone transformed instruction files (`GEMINI.md`) generated via `src/adapters/gemini/runtime.ts`.
- **Claude, Codex, Antigravity, VS Code Local:** Neutral workflows projected, shared workflow lookup.

---

## 4. Exercised Parent Validation Evidence

### 4.1 Build and Closure Validation (`phase-04-build-validation.md`)
Parent executed:
```text
npm run build && npm run generate:registry && npm run generate:manifests && npm run distribute:check -- --target claude --target codex --target gemini --target antigravity --target omp --target pi --target copilot --target vscode && npm run release:check
```
- **Exit code:** 0 (elapsed 46.00 seconds).
- **Registry:** 144 resources verified.
- **Manifests:** 9 manifests across 8 targets generated and verified.
- **Distribution check:** All 8 explicit targets passed (`status: ok`).
- **Release closure:** Exit 0.

### 4.2 Deduplicated Regression Suite (`phase-04-regression-validation.md`)
Parent executed Checks 1–5 across 9 test invocations:
- **Deduplicated total:** **604 passed**, **24 Windows-only platform skips**, **0 failed** across **628 unique cases** (100% pass on Linux runnable tests; duration: ~549 seconds).
- **Breakdown by suite tier:**
  - Check 1 (Focused Activation): 40 passed (7 qualification, 16 activation, 17 CLI).
  - Check 2a (Advisor Controller): 309 total (285 passed, 24 Win32 skips; contains Check 1 subset).
  - Check 2b (Protocol incl. Parity): 53 passed (contract parity verified inline).
  - Check 2c (Adapters): 139 passed (OMP native activation, VS Code projection/lifecycle, mentoring).
  - Check 3 (Phase 10 Distribution): 16 passed (CLI cautions, evaluation rubric, human gate, state history).
  - Check 4a (Pi Target Runtime): 16 passed (command files 11, command tool 4, packed runtime integration 1).
  - Check 4b (Installed Integration): 11 passed (advice activation installed 7 with spaces/Unicode HOME, VS Code runtime 4).
  - Check 5a (Manifests & Publication): 48 passed (manifests, adapter runtime identity, plan, apply, parity, shared JSON, VS Code).
  - Check 5b (Release Orchestration): 36 passed (`npm run test:release`).

### 4.3 Installed-Resource Host Probes (`phase-04-host-ledger.md`)
- **Probes executed:** **17 passed / 0 failed** across all eight disposable targets.
- Verified target registry schema 2, materialization, and helper execution in disposable project/HOME roots. Pi user/model API dispatch tested separately; these are API-tier host checks, not eight vendor model sessions (W1).

---

## 5. Bounded Observed Native Qualification (Linux OMP 18.6.1)

Authoritative parent acceptance observations on Linux x64 OMP 18.6.1 with active route `openai-codex/gpt-6.1-sol` establish bounded qualification across six scenario classes:

| Scenario / Command | Actual Result | Observed Behavior and Concrete Limit |
|---|---|---|
| `s01` (`/cmd-code plans/test/plan.md phase-01`) | `off / NO_FINAL_FLAG`, exit 0 (34.55s) | Neutral workflow reads; no mentoring read or state creation (`L=0`). Selected plan/phase bytes unchanged. Step 0 cap only. |
| `s02` (`/cmd-code plans/test/plan.md phase-01 --advice`) | `explicit / EXPLICIT_FINAL_FLAG`, exit 0 (48.79s) | Exact work bytes preserved; actual successful mentoring resource read after pre-prompt helper admission. No fresh run created. |
| `s03` (`/cmd-cook plans/test/plan.md --advice`) | Router explicit; real child inherited `INHERITED_PRE_RUN`; both exit 0 (83.23s) | Router autonomously supplies exact pre-run context for `code`; child raw input `plans/test/plan.md`, no synthetic flag, run null, `phase_path: null`, `phase_id: null` in handoff. Model later selected `phase-01` from fixture plan (not an originally supplied phase binding; W5). Child completes Step 0; no state initialization. |
| `s05` (Stale same-run revision handoff) | Helper FAILED `ADVICE_HANDOFF_STALE`, helper exit 1; model exit 0 (26.08s) | Mode null; model reports blocked, no selected implementation/mentoring/write/new UUID. Neutral resource/directory reads occurred. State and selected-file hashes unchanged. |
| `s07` (`/cmd-code__auto plans/test/plan.md phase-01`) | `off`, identified `state get`, exit 0 (90.90s) | Real completion operation/revision/hash, accepted disposition/resolved outcome and file digests inspected. State bytes unchanged. Model reports missing retained checkpoint/result/validation artifacts; historical dependency proof incomplete. No silent next-phase execution. |
| `s11` (Two retained matching default blockers) | `off`, exit 0 (45.80s) | Model reconciles controlled retained compiler-failure records and reports ordinary escalation; no mentoring, hard checkpoint, retry or state creation. Proves bounded reconciliation branch, not a complete compiler loop. |

### 5.1 Prerequisite Admission Gate Limitations (W1)
- **`s10` (Missing HOME helper):** Session-only event, zero tool calls, exit 0. Supports bounded zero-turn observation, but exact stderr diagnostic was uncaptured in retained trace.
- **`s12` (Missing neutral workflow):** Timed out after 15,000 ms with exit null and status FAIL. It is not an observed completed native pre-prompt rejection or qualified gate.
- **Host probes:** Factory gate results in host probes are API-tier only; historical Phase 03 gate receipts are separately dated, not current proof.

### 5.2 Concrete Qualification Limitations
1. **Step 0 Cap:** All model executions deliberately capped at Step 0; feature implementation was not executed.
2. **Historical Dependency Proof Limit (A02 / A22):** Original historical verification artifacts were incomplete; dependency proof remains limited, not fabricated verified success.
3. **Escalation Scope (A12):** Exercises retained-record reconciliation and escalation; does not execute an authentic compiler/debugger loop.
4. **Unexercised Native Branches (A13 / A16):** A13 authorized advice blocker threshold (two-matching-terminal-blockers in advice mode) and A16 missing-receipt parent reconstruction branches were not run natively.
5. **Other Vendor Model Loops Unqualified:** Claude, Codex, Gemini, Antigravity, Copilot, and VS Code vendor model loops remain unqualified; Antigravity standalone binary is absent from PATH.
6. **Windows and macOS Exclusion:** Native Windows and macOS platforms are explicitly excluded by user direction (not acceptance blockers or qualified outcomes). Unrelated historical Windows (Phases 01–04) and Darwin (Phase 05) documentation is preserved.
7. **No Read-Only Auth/HOME Immutability Guarantee (W2):** No deliberate live settings/policy/auth changes authorized; live HOME/auth-cache write behavior was not exhaustively audited. No immutability/read-only guarantee.
8. **No Provenance Guarantee:** Native user invocations provide `handoff: null` and initial null plan/phase selections; context headers are cooperative consistency, not authenticated user intent or session-token provenance.
9. **No Production API or CAS Schema Changes:** Direct controller/library APIs, V1 compatibility checkpoint envelopes, and V2 CAS/evidence/human gates remain strictly preserved without mutation.

---

## 6. Review Corrections (W1–W5 & S1–S2) Verification

| Finding | Area | Description of Implemented Resolution | Verification |
|---|---|---|---|
| **W1** | Shared docs & report | Removed claims of "plus two observed native prerequisite gates" across `system-architecture.md:676`, `project-overview-pdr.md:255`, `codebase-summary.md:8`, `project-changelog.md:19`, and report. Preserved `s10` diagnostic uncaptured and `s12` timeout as explicit gate limits; labeled host probes as API-tier. | Verified in docs and report |
| **W2** | Integration report | Replaced affirmative auth/HOME immutability assertion in Section 5.2 with explicit disclaimer: "No deliberate live settings/policy/auth changes authorized; live HOME/auth-cache write behavior was not exhaustively audited. No immutability/read-only guarantee." | Verified in report |
| **W3** | Architecture & summary | Clarified in `system-architecture.md:22-36` and `codebase-summary.md:6` that package metadata exposes npm CLI bins `evcrate` and `evcrate-advisor`, while `evcrate-advice-mode` is a packaged HOME asset invoked via Node (`node "$HOME/.evcrate/bin/evcrate-advice-mode"`), not an npm CLI bin on PATH. Reinforced in `code-standards.md:293`. | Verified in docs and report |
| **W4** | Codebase summary | In `codebase-summary.md:586-588`, replaced deleted `advisor-mentoring.md#argument-mode` link with neutral contracts: linked activation to `advice-activation.md`, history to `plan-progress.md`, and restricted mentoring link to explicit/inherited `#caller-lifecycle-binding`. | Verified in `codebase-summary.md` |
| **W5** | Integration report | Corrected documented `s03` router command in Section 5 table to `/cmd-cook plans/test/plan.md --advice` (plan only, no phase argument; child `phase_path: null`, `phase_id: null`). Clarified that model autonomously selected `phase-01` from fixture plan. | Verified in report |
| **S1** | Test helper safety | Refactored `activation-qualification-helpers.cjs` (156 to 92 lines) to use `createIsolatedFixture(t)` with immediate `t.after` cleanup registration upon temp root creation before fallible setup. All callers (`A02`, `A14`, `A17`) pass `t`. Reaps disposable roots cleanly on induced init failure. | Verified in tests and throwaway smoke |
| **S2** | Deadweight removal | Replaced duplicate envelope/claim/disposition/outcome machinery in `completeStateFixtureWithBaseline` with existing real `completeStateFixture`. Removed duplicate `operate` helper and unused assert/exports. | Verified in tests and throwaway smoke |

---

## 7. Unresolved Questions & Finalization Status

1. **Independent review cycle 2 & user approval:** All W1–W5 findings and S1–S2 suggestions are resolved (Cycle 2 review score 9.8/10, 0 critical / 0 high / 0 medium / 0 blocking warnings; 1 optional bookkeeping suggestion L1 addressed above). Ordinary Phase 04 user approved completed 2026-10-06T14:13:41+07:00 / 9.8 review, no durable completion/provider release/commit claim.
2. **No blocking issues:** Shared documentation files are fully integrated under single-writer authority, all within strict $\le 800$ LOC limits, and synchronized with parent acceptance evidence.
3. **Explicit qualification limits preserved:** Prerequisite gates (`s10` diagnostic uncaptured, `s12` 15s timeout / exit null), historical artifact limits (incomplete A02/A22 proofs), A12 escalation without compiler loops, unexercised A13/A16 native branches, unqualified Linux vendor model loops, and excluded Windows/macOS platforms remain documented qualification boundaries, not defects. No unresolved product decisions.
