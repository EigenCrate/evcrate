# Code Review — Phase 04 Portable Sonar Evidence Actor (Cycle 3)

## Scope
- Files: `ext/sonarqube-test-quality/agents/sonar-evidence.md` (497 LOC), `references/remediation-cycles.md` (251), `tests/sonar-evidence-actor.test.mjs` (266). Cross-read: `run-guidance.md`, `project-discovery.md`, phase-04 plan.
- Focus: Cycle 2 fixes + new defects. Plan file NOT updated (Critical open; phase todo still unchecked).

## Score: 7/10

## Verdict
All 10 Cycle-2 warnings verifiably addressed (enum fix, Outcome Authority Invariant, blocker set, trigger table, actor_id roles, JSON-block tests). 48/48 tests pass. But the §5.4 resume fix introduced a contradiction with the policy owner, and several contract gaps remain.

## Critical (MUST FIX)
1. **§5.4 step 2 resume binds on SUCCESS before drift check** (`sonar-evidence.md:239-240`). Step 2: "If task already completed SUCCESS, bind analysisId and proceed"; drift re-verify (step 3) only runs when task still pending. `remediation-cycles.md:155` says on source mismatch: read-only poll only to record terminal status, mark `dirty_tree_state: drift-invalidated`, halt `resume-checkpoint-drift`; drift-invalidated result can never satisfy verification. Actor lets a drifted tree reach analysis bind → gate → findings → possible `complete`. Fix: reorder — (1) load checkpoint, (2) re-verify commit_sha/active_input_digest/generated_input_digest vs `pre_scan_*`, (3) read-only status check always allowed; on mismatch record terminal status only, mark drift-invalidated, halt; on match, SUCCESS→bind, pending→resume poll. Add a trace/test (E-TR-08b: task SUCCESS + drifted tree → halt).

## Warnings (SHOULD FIX)
1. **Prerequisite evidence binds to SHA only** (`:160`, `test_execution_checkpoint`). Fix rounds run on uncommitted tree (`remediated-uncommitted`): SHA equals pre-edit HEAD, so test/review evidence from a prior tree state satisfies the gate. Bind to `active_input_digest` + `generated_input_digest` too (and review artifact must carry same digest). Same for aggregate_review/commit evidence at F.
2. **Guidance candidate example violates run-guidance.md** (`:386-401`). Example is a spec fixture but declares `provenance: "actual-run"`, `confidence: "observed"` — §3 ceiling requires synthetic fixtures `hypothesized`. Also omits required fields: `skill_command_actor_versions`, `toolchain_scanner_versions`, `owner_reviewer_id`, `run_outcome`, `prerequisites`, `discovery_rationale`, `expected_effects`; no per-step confidence. Test title says "matching run-guidance §3" but checks 9 names via substring only. Fix example (`synthetic`/`hypothesized`) + complete fields, or state candidate is partial and parent completes; make test assert required-field set from run-guidance.
3. **Mode↔stage matrix not enforced** (§2, §3.2). Valid stages per mode only implied (snapshot has none; verify-upload list, verify-final list). No pre-exec rule rejecting e.g. `snapshot`+`CK_UPLOAD`, `verify-upload`+`F_*`, `verify-final`+`CK_*`. E-TR-14 title says "stage mismatch rejected" but body only covers role. Also §1.3 role check and `actor_role` check absent from §3.2 validation list. Add rule + blocker mapping (e.g. reuse `unauthorized-upload-attempted`/new closed blocker) + trace.
4. **Request `stage` semantics undefined**: request `CK_UPLOAD` yet one invocation runs build/test/upload/wait/evaluation and result reports `CK_EVALUATION`. Define request=entry stage, result=terminal/halt stage.
5. **`scanner_command` outside approved profile** (`:112,118` vs `ordered_commands` `:129-145`). Example profile has no scanner step but result has `SCANNER_EXECUTION` (`:320`); §1.2/plan require executing only approved commands. State scanner commands are part of `approved_execution_profile` (per target), validated pre-exec (no plaintext token args, `-Dsonar.token`), or drop per-target field. Result lists one scanner run for two targets.
6. **Multi-target example internally inconsistent**: request has 2 targets; result `per_target_evidence` has 1; `submission_evidence`/`quality_gate`/`findings_summary`/`coverage_report_path` are singular (test even asserts length 1, `:262`). Contradicts atomic-assessment rule; DRY: top-level singulars duplicate per-target. Make per-target the only home, example with 2 entries.
7. **Findings capture not bound to submitted analysis** (§6.3.1). "Record analysisId before retrieval" — must equal the CE-task `analysisId` from §5.5, else a concurrent newer scan before capture start is accepted as ours. Also no API named for latest-analysis lookup.
8. **Resume checkpoint trust** (§5.4.1). `resume-checkpoint.json` loaded without cross-check against request `resume_context`, `target_server`, project keys, and `commit_sha`; `task_file_path` not constrained to scanner working dirs. Add match requirement, halt `submission-unverified`/drift on mismatch.
9. **Mapping gaps**: no row/blocker for scanner non-zero exit or single-target failure (`result_status "failed"` def covers it; no blocker). `target-failure:<key>` used in E-TR-13 absent from §7.2 mapping table. `result_status: "failed"` definition (non-zero exit) doesn't cover drift/stale/analysis-changed uses (E-TR-04/06/11). Role/unauthorized → `test-or-build-failed` is semantically odd but forced by closed enum; note it in table as intentional.
10. **Tests mostly substring presence** (`test.mjs:36-206`). 14-trace test checks IDs only; `halting_trigger` mapping table, closed blocker set vs traces, `§7.2` result_status definitions untested. Add: parse each trace's `result_status/canonical_outcome/halting_trigger/blockers` and assert closed enums + mapping-table consistency; assert blockers set from §7.2 ⊇ every blocker used; assert `actor_id` request==result.

## Suggestions
- DRY: enums (outcomes/triggers/blockers) triplicated across actor, cycles, run-guidance; add single pointer to cycles as owner and have test enforce equality, rather than copy semantics.
- Add `schema_version`/profile version to request (plan step 2 lists "profile/version").
- Snapshot mode needs defined valid stages and whether `independent_roles` required (baseline exemption mentions snapshot but §1.3 fail-closed "any required role").
- Scanner JRE auto-provisioning download vs "NEVER download toolchain binaries" — clarify (approved profile / pre-provisioned).
- Specify page size (ps≤500) and facet-free full pagination detail; hotspot unsorted ordering note OK.
- `no-host-binding` test uses `includes('tools:')` — false-positive prone on prose; anchor to frontmatter only.
- Tests: `node --test tests/` (dir arg) fails on Node 24 (`MODULE_NOT_FOUND`); document `tests/*.test.mjs` glob in package script if any.

## Positive
- Strong fail-closed posture; clear NEVER list; explicit not-a-sandbox invariant; no-blind-reupload crash windows; two-factor freshness + pre/post drift; exact analysis gate with no latest fallback; Outcome Authority Invariant; evidence actor cannot certify F_FINAL_AUDIT; embedded JSON parsed and enum-checked against references.
- Cycle-2 items 1-9 confirmed resolved; remediation-cycles blocker names (`consistency-unknown-blocked`, `window-exceeded-blocked`, `analysis-changed-invalidated`) match actor.

## Validation
- `cd ext/sonarqube-test-quality && node --test tests/*.test.mjs` → 48 tests, 4 suites, 48 pass, 0 fail.
- `node --test tests/` → MODULE_NOT_FOUND (Node v24 dir-arg behavior; not a code defect).
- No build/lint script run (docs-only spec + node test).

## Metrics
- Test coverage: n/a (spec-content tests); Linting: not configured/run.

## Unresolved Questions
1. Should phase-04 own edits to `remediation-cycles.md` (plan says exclusive `agents/sonar-evidence.md`)? Untracked in git, ownership unclear.
2. Should guidance example in actor spec be synthetic fixture or real-run shape? (W2)
3. Is mode-stage mismatch blocker a new closed blocker or reuse of existing? (W3)
