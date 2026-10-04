# Phase 03 Completion Receipt

- **Project Root:** `/home/loidinh/WS/worktrees/evcrate-advisor-node-only-launch`
- **Project ID:** `a3976b5dfce8008e49196d55afa1ec0e0d44ecea17f6f9d87d95b6ce2df75e72`
- **Plan:** `plans/261003-1527-advisor-node-only-launch/plan.md`
- **Phase ID:** `phase-03`
- **Phase Title:** `Phase 03 — Linux real-launch verification and portable fixtures`
- **Task Run ID:** `0ef7af0d-8ee1-4c9b-9f32-df134e89ba9b`
- **Consultation ID:** `588374ed-5fbe-4081-b01e-88ce933a2e40`
- **Action ID:** `6288b40d-5747-4fbd-b90d-69f8e6e13c00`
- **Episode ID:** `episode-261004-1533-phase-03-finalization`
- **Completion Revision:** 7
- **Evidence Revision:** 1
- **Scope Revision:** 0
- **Gate Status:** `completed`
- **Checkpoint Digest:** `35385899b70ccca2b274f169d4e3944a3de3754616d57a7c68794e9e6b608c88`
- **Disposition:** `accept` (User approved Phase 03 code review score 9.9/10 and advisor counsel)
- **Outcome Result:** `resolved`
- **Commit SHA:** `d6fa5061` on branch `feat/advisor-node-only-launch`
- **Declared Validation Command:** `npm run test:cli`

---

## Approved Scope & Delivery Basis

1. **Package-Shaped Fake Backends & Portable Fixtures:**
   - `tests/advisor-controller/fixtures/provider-fixture.cjs`: Real package layout for `@openai/codex` and `omp` fake backends (`node_modules/<pkg>/bin`), platform-specific launchers (`.cmd` on Windows, `0o755` executable wrapper on POSIX), native path delimiters (`path.delimiter`), deduplicated case-insensitive `PATH`, and recursion-marker scrubbing (`EVCRATE_ADVISOR_ACTIVE`, `EVCRATE_ADVISOR_DEPTH`, `EVCRATE_SESSION_ID`).
   - `tests/advisor-controller/fixtures/node-launch-helpers.cjs`: Modular harness for disposable roots with spaces and non-ASCII Unicode characters (`evcrate-lnx-sp ace-🚀-`), dual git repositories, and Node `spawnSync` invocation wrapper with timeout.

2. **Isolated Private-HOME Real Node Lifecycle Regressions:**
   - `tests/advisor-controller/node-launch.test.cjs`: Comprehensive 9-test suite:
     - **N02–N04, N07:** Private-HOME publication into path with spaces and Unicode (`h ome-🏠`, `proj ect-alpha-α`, `proj ect-beta-β`, `b in-⚙️`) preserves routing policy and installs controller closure (`.evcrate/bin/evcrate-advisor`). No controller copied into project roots.
     - **N02, N08:** Complete 7-step V2 consultation lifecycle (`init` → `checkpoint` → inference → `get` → `disposition` → `outcome` → `complete`). Exactly 1 provider launch, UTF-8 JSON prompt with canonical mentor instructions verified, and durable history record confirmed under `.evcrate/advisor-history/<project_id>/<task_run_id>/<consultation_id>/execution.json`.
     - **N11:** History CLI operations verified on installed controller: `list`, `show`, `metrics`, `export` (dry-run and apply), and `prune` (dry-run).
     - **N03, N04, N07:** Cross-project isolation: distinct project SHA-256 hashes prevent state or history leakage across projects under the same HOME.
     - **N08:** Non-executable Linux controller script (`0o644`, all execute bits removed) succeeds cleanly via explicit Node launch for both `state init` and `state get`.
     - **N05, N06:** Missing installed controller never searches or executes decoy script placed in project directory.
     - **N07:** Explicit empty, relative, or absent HOME fails closed with error envelope and writes nothing to fallback roots.
     - **N12, N13:** Unlaunchable Node, malformed JSON stdin, and oversized input (>32 KiB) fail closed without completing gates.
     - **N15 Automated Negative:** Unattended `human-decision` request fails closed with `HUMAN_EVENT_REQUIRED` when executed without a controlling TTY.

3. **Interactive Console Challenge-Response Verification (N15):**
   - `tests/advisor-controller/interactive-console-verification.py`: Real Linux pseudo-terminal (`pty`, `setsid`, `TIOCSCTTY`) verification against installed controller:
     - Scenario A: Wrong or replayed nonce refuses with `HUMAN_EVENT_REQUIRED`.
     - Scenario B: Current exact challenge accepts (`authorize <run_id> <rev> <nonce>`), transitions state to completed, and records source `local-terminal-confirmation`.
     - Scenario C: Abort cancels with failure status.

4. **Health Diagnostic Caller Boundary Regressions:**
   - `tests/cli/health.test.mjs`: Added 4 diagnostic regression tests:
     - `runHealth` executes controller with `cwd: context.packageRoot` even when `context.projectRoot` differs.
     - `runHealth` succeeds with non-executable controller script (`0o644`) via explicit Node launch.
     - `runHealth` fails closed with `DIAGNOSTIC_INVALID` when Node runtime is missing or unlaunchable.
     - `runHealth` succeeds when package and controller directories contain spaces and Unicode characters.

5. **Validation & Reconciled Test Coverage:**
   - **Total Tests Passed:** 331 passed, 0 failed.
     - `npm run test:cli`: 68 passed, 1 skipped.
     - `npm run test:advisor-controller`: 243 passed, 24 skipped.
     - Cross-suite integration (`phase08-mentoring-integration`, `phase10-controller-scenarios`, `phase10-human-gate`): 16 passed.
     - Acceptance smoke (`tests/advisor-controller/smoke-30s.cjs`): 1 passed (31s silence handled).
     - Interactive Linux console (`interactive-console-verification.py`): 3 passed.
   - **Skips Disclosed (25 total):**
     - 1 CLI skip: `Windows native context and reparse contract suite` (Windows-only).
     - 24 advisor-controller skips: Windows-only Job Object supervision, pinned-file CAS, and Windows-specific launch record suites (skipped on Linux as intended cross-platform boundary tests; zero Linux tests skipped).
   - **Independent Review:** Score 9.9/10, 0 critical issues, 0 warnings.
   - **Advisor Mentoring Checkpoint:** `review:step-4` completed with `ADVICE_READY`.
   - **User Approval:** Explicitly granted.
   - **Durable Task State:** Sealed via controller task run `0ef7af0d-8ee1-4c9b-9f32-df134e89ba9b` at revision 7.
