# Phase 07 Behavioral Qualification Report

## 1. Executive Summary & Verification Context

- **Date:** 2026-10-13
- **Phase:** Phase 07 — Behavioral evals and installed host smoke
- **Component:** `@evcrate/sonarqube-test-quality` (v1.0.0)
- **Scope:** Complete offline behavioral scenario matrix, acceptance-to-evidence traceability ledger, lifecycle models, security/auth refusals, and boundary assertions.
- **Verification Boundary & Honest Gate Status:**
  - **Catalog Specification & Assertion Integrity:** **PASSED / VERIFIED** (114/114 automated package tests pass, 64 scenarios, 195 prose assertion entries validated for structure/non-empty content; live behavioral satisfaction unexercised; 0 leaked credentials or unauthorized TLS bypasses).
  - **Offline State Machine & Transition Simulation:** **PASSED / VERIFIED** (15 state transitions in `tests/cmd-sonar-remediate.test.mjs:235–675` exercising resume, no-progress, correction limit, role independence, and stage gates).
  - **Live LLM Host & Independent Child Execution:** **BLOCKED / UNEXERCISED** (requires external runtime LLM host harness execution environment which is not active in this offline build/test context; per Phase 07 steps 7, 9, 12, this is honestly documented as blocked rather than fabricated).
  - **Live Server Qualification Boundary:** Actual consumer server-success separately requires committed inputs, final actual submission, exact per-target tasks/analysis/gates/full consistent findings/hotspots/coverage, and independent final audit.

---

## 2. Acceptance Matrix Traceability & Scenario Mapping

Every acceptance criterion ID defined in `acceptance-matrix.md` maps directly to at least one concrete scenario in `evals/evals.json` with explicit prose assertions. All 38 acceptance IDs (9 A-series, 9 D-series, 12 C-series, 8 E-series) are verified against the specification and catalog assertions.

| ID | Core Requirement | Mapped Scenarios | Catalog Specification & Assertions | Live Host / Child Execution |
|---|---|---|---|---|
| **A01** | Neutral entrypoint; optional Java recipes | 1, 8, 23 | **VERIFIED** (Scenarios test build-integrated Java & non-Java; no forced Maven/Jenkins defaults) | **UNEXERCISED** (Host Required) |
| **A02** | Portable extension; approved dual roots | 19, 20, 21, 22 | **VERIFIED** (Explicit `--target agents\|claude\|both`, 2 entrypoints/root, no settings writes) | **UNEXERCISED** (Host Required) |
| **A03** | No universal pins/upgrades/corporate defaults | 4, 5, 28, 38 | **VERIFIED** (Discovered project properties and profile settings; no hardcoded thresholds) | **UNEXERCISED** (Host Required) |
| **A04** | N maximum, prompt when absent | 28, 29, 30 | **VERIFIED** (Omitted/invalid N prompts immediately; N=1 consumes entered round) | **UNEXERCISED** (Host Required) |
| **A05** | Separate commit authorization; no auto-push | 14, 44 | **VERIFIED** (Declined commit leaves workspace in awaiting-commit; no git reset, stash, or push) | **UNEXERCISED** (Host Required) |
| **A06** | Full configured success, no invented coverage threshold | 2, 59 | **VERIFIED** (Gate-pass with active issue or hotspot pending is not success; profile metrics enforced) | **UNEXERCISED** (Host Required) |
| **A07** | Both skills/nested assets; transactional installer | 19, 20, 21, 22 | **VERIFIED** (18 agents, 18 claude, 36 both destinations; repeat no-op; collision guards) | **UNEXERCISED** (Host Required) |
| **A08** | Retained specialized/ordinary/Jenkins routes | 1, 6, 7, 8 | **VERIFIED** (Local JUnit fix requires no auth/N; explicit Jenkins push-to-scan route isolated) | **UNEXERCISED** (Host Required) |
| **A09** | Guidance for every outcome; no self-edit/sharing | 27, 30, 43, 50 | **VERIFIED** (Emits sanitized guidance for success, failure, declined, and exhausted outcomes) | **UNEXERCISED** (Host Required) |
| **D01** | Discover scripts/tools; discovery is not approval | 47 | **VERIFIED** (Discovery of scripts like `sudo` prep scripts does not authorize execution) | **UNEXERCISED** (Host Required) |
| **D02** | Repository/branch-or-PR and multi-target mapping | 9, 26, 51 | **VERIFIED** (Rejects combined branch+PR; maps multi-target modules explicitly) | **UNEXERCISED** (Host Required) |
| **D03** | 4 lifecycle differences / fresh coverage before import | 23, 24, 25, 26 | **VERIFIED** (Covers build-integrated, standalone, prep/build/end, and multi-target lifecycles) | **UNEXERCISED** (Host Required) |
| **D04** | Scanner changes native semantics | 42 | **VERIFIED** (Instrumented builds require separate clean native test verification first) | **UNEXERCISED** (Host Required) |
| **D05** | Requirements separate from availability/results | 37, 38 | **VERIFIED** (Rejects 0 executed tests; requires preflight proof for justified zero-test profile) | **UNEXERCISED** (Host Required) |
| **D06** | Report metrics/formats/maps/freshness | 2, 10, 39, 40, 41 | **VERIFIED** (Rejects stale coverage; forbids synthesizing branch coverage; rejects unweighted average) | **UNEXERCISED** (Host Required) |
| **D07** | Safe actual-input identity | 13, 57 | **VERIFIED** (Preserves dirty workspace; generator/untracked input drift invalidates checkpoint) | **UNEXERCISED** (Host Required) |
| **D08** | All targets same checkpoint, N global | 26, 36 | **VERIFIED** (All targets must pass at shared checkpoint; partial target success rejected) | **UNEXERCISED** (Host Required) |
| **D09** | Auth separation/capabilities/scope frozen | 3, 4, 45, 52 | **VERIFIED** (Differentiates CLI login from scanner token; missing capability/CE failure blocks) | **UNEXERCISED** (Host Required) |
| **C01** | Approved local route and fresh C0 | 60 | **VERIFIED** (Baseline C0 discovery and scan excluded from fix budget N, enteredRoundCount = 0) | **UNEXERCISED** (Host Required) |
| **C02** | Failed/incomplete entered rounds consume N | 30 | **VERIFIED** (N=1 test failure consumes sole round, yields blocked/incomplete test-or-build-failed) | **UNEXERCISED** (Host Required) |
| **C03** | One correction + retest + independent rereview | 32, 33 | **VERIFIED** (Exactly 1 correction allowed in round; second correction prohibited) | **UNEXERCISED** (Host Required) |
| **C04** | Persist stage/tasks and resume waits | 31, 53 | **VERIFIED** (Interrupted task resumes polling known task ID without re-upload or budget cost) | **UNEXERCISED** (Host Required) |
| **C05** | No-progress recovery boundaries | 34 | **VERIFIED** (Two consecutive rounds with identical findings halt with `two-round-no-progress`) | **UNEXERCISED** (Host Required) |
| **C06** | Scope/profile/gate/filter changes rebaseline | 56 | **VERIFIED** (Quality profile change requires fresh C0 baseline without resetting spent N budget) | **UNEXERCISED** (Host Required) |
| **C07** | Final aggregate review & committed-source validation | 13, 27, 44, 57 | **VERIFIED** (Verifies all inputs committed before Stage F; dirty files outside analysis preserved) | **UNEXERCISED** (Host Required) |
| **C08** | Mandatory actual final submission and audit | 27 | **VERIFIED** (Rejects early-round local success; demands actual final submission & independent audit) | **UNEXERCISED** (Host Required) |
| **C09** | Exhaustion not success; final not free fix | 30, 35 | **VERIFIED** (Budget exhaustion leaves residual findings; post-budget code edits strictly forbidden) | **UNEXERCISED** (Host Required) |
| **C10** | Real independent roles and terminal gates | 46 | **VERIFIED** (Implementer != Reviewer != Auditor; pairwise identity overlap fails closed) | **UNEXERCISED** (Host Required) |
| **C11** | Actor request/result/mode bounds | 49, 62 | **VERIFIED** (Actor snapshot mode forbids upload; actor forbidden from editing code or status) | **UNEXERCISED** (Host Required) |
| **C12** | Serial same-checkout scans | 61 | **VERIFIED** (Strictly forbids concurrent scans or builds on the same working tree checkout) | **UNEXERCISED** (Host Required) |
| **E01** | Exact task → analysis → gate per target | 23, 24, 25, 52 | **VERIFIED** (Binds CE task to analysis to gate; CE failure halts with `task-failed`) | **UNEXERCISED** (Host Required) |
| **E02** | Full paging/totals and mutable capture consistency | 11, 54, 55 | **VERIFIED** (Partial paging rejected; concurrent analysis returns `consistency unknown`) | **UNEXERCISED** (Host Required) |
| **E03** | Authoritative JSON + native artifacts | 11, 12 | **VERIFIED** (Retains compact JSON as authoritative; Markdown is inspection view only) | **UNEXERCISED** (Host Required) |
| **E04** | Issue-ID history/disappearance/owner hotspots | 58, 59 | **VERIFIED** (Disappearing issue without code fix is `disappeared-unknown`; hotspots block gate) | **UNEXERCISED** (Host Required) |
| **E05** | Bounded-write actor not sandbox | 48, 49, 62 | **VERIFIED** (Bounded file inspection; no direct status mutation; prompts not OS sandbox) | **UNEXERCISED** (Host Required) |
| **E06** | Secret/TLS safety | 3, 45, 48 | **VERIFIED** (Placeholders used; forbidden `NODE_TLS_REJECT_UNAUTHORIZED=0`; no token logging) | **UNEXERCISED** (Host Required) |
| **E07** | Provenance/applicability/confidence/privacy | 43, 50, 63 | **VERIFIED** (Sanitizes hostile prompt injection in issue text; guidance uses confidence ceilings) | **UNEXERCISED** (Host Required) |
| **E08** | Owner-reviewed future promotion | 50, 64 | **VERIFIED** (Reusable edits require human owner review across usefulness, applicability, privacy) | **UNEXERCISED** (Host Required) |

---

## 3. Four Lifecycle Shapes Verification

The catalog explicitly verifies four distinct scanner integration lifecycles:

1. **Build-Integrated Lifecycle (Scenario 23, Maven/Gradle):**
   - Context: Scanner execution is an intrinsic phase or goal of the build toolchain (`mvn clean verify sonar:sonar`).
   - Order: Clean native compilation and test verification run first. Scanner goal executed next. Resulting Compute Engine task ID bound to subsequent gate verification.
   - Non-effects: No worktree creation; no unapproved parameters; no skipping native tests.

2. **Standalone-After-Native Lifecycle (Scenario 24, TypeScript/npm/LCOV):**
   - Context: Native build and test suite run independently to produce a coverage artifact (e.g. `npm test` producing `coverage/lcov.info`), followed by an independent `sonar-scanner` CLI execution.
   - Order: Verify tests pass; check report timestamp freshness (`report_mtime > test_start`); execute standalone scanner; poll task and verify gate on analysis ID.

3. **Preparation/Build/Submission Lifecycle (Scenario 25, .NET / C++ Build Wrapper):**
   - Context: Three-stage sequence requiring begin hook (`dotnet sonarscanner begin`), native compilation (`dotnet build`), and final submission (`dotnet sonarscanner end`).
   - Order: Enforces strict sequential dependency: begin -> build/test -> end. Prohibits running begin/end out of order as ad-hoc cleanup or retry mechanism.

4. **Mixed-Module / Multi-Target Lifecycle (Scenario 26, Backend Go + Frontend TS):**
   - Context: Multi-language repository with distinct analysis targets and separate project keys.
   - Order: Changes mapped to target module; all modules share the identical Git commit checkpoint; verification requires all targets to pass their quality gates at that shared checkpoint before repository success can be declared.

---

## 4. Contract-Aligned State Machine & Budget Invariants

- **Round Failure Contract (Scenario 30):**
  - Concludes with outcome `blocked/incomplete` and trigger `test-or-build-failed` (aligned with `remediation-cycles.md:113` and `:249`).
  - Prohibits hidden retries or server uploads after test failure with exhausted $N=1$.
- **Declined Authorization Contract (Scenarios 43, 44):**
  - User declines upload at Ck: concludes with outcome `blocked/incomplete` and trigger `declined-upload` (aligned with `remediation-cycles.md:249`).
  - User declines commit at Stage F: concludes with outcome `awaiting commit` and trigger `declined-commit`; workspace preserved dirty without reset, stash, or push.
- **Disappearing Issue Contract (Scenario 58):**
  - Finding disappearing without code fix is recorded with canonical disposition `disappeared-unknown` (aligned with `remediation-cycles.md:220`).
- **Omitted or Invalid Budget N (Scenarios 28, 29):**
  - Omitted N prompts user immediately; never defaults to 3, 5, or any arbitrary constant.
  - Invalid N (<= 0) is rejected; positive integer strictly required.
- **Task Resume (Scenario 31):**
  - Resuming a known in-flight Compute Engine task (`AX98765`) does not rerun scanner upload or consume additional budget from N.
- **Single Correction Constraint (Scenarios 32, 33):**
  - Exactly one corrective batch allowed per entered round. Second correction in the same round is prohibited; terminates round with `failed-rereview`.
- **No-Progress Detection (Scenario 34):**
  - Two consecutive comparable rounds with identical findings halt with `two-round-no-progress` trigger.
- **Role Independence (Scenario 46):**
  - Implementer != Reviewer != Auditor. Overlap fails closed with `role-independence-violation`.

---

## 5. Security Audit & Guidance Governance

- **Zero Credential Leaks:** Catalog contains zero SonarQube token prefixes (`squ_`, `sqp_`, `sqa_`), bearer tokens, or password strings.
- **TLS Security:** `NODE_TLS_REJECT_UNAUTHORIZED=0` appears exclusively in Scenario 48 as a strictly forbidden bypass.
- **Hostile Prompt Neutralization (Scenario 63):** External issue descriptions containing injection payloads (`rm -rf /`) are treated as untrusted data and sanitized.
- **Reusable Edit Promotion Governance (Scenario 64):** Candidate rules require human owner review across 3 evaluation dimensions (usefulness, applicability, privacy); automated self-modification is prohibited.

---

## 6. Qualification Synthesis

- Total scenarios in catalog: **64**
- Scenarios with explicit prose assertions: **64 (100%)**
- Total prose assertion entries validated: **195** (validated for schema and non-empty content; live model behavioral satisfaction unexercised).
- Automated test suite execution: `tests/evals.test.mjs` passed 15/15 subtests (114/114 total package tests passing).
- State transition simulations: 15 scenarios in `tests/cmd-sonar-remediate.test.mjs:235–675` verified.
- **Specification and catalog schema verification: PASSED.**
- **Live LLM host harness execution: BLOCKED / UNEXERCISED** (honest gate status: requires runtime host harness integration).
