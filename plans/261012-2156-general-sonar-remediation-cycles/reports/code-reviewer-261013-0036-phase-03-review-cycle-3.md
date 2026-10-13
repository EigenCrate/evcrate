# Code Review — Phase 03 (Review Cycle 3)

Score: **8.0/10**. Critical: 0. Warnings: 8. Suggestions: 7.

## Scope
Files: `references/remediation-cycles.md` (251 L), `references/run-guidance.md` (119), `templates/remediation-cycle-report.md` (204), `templates/run-guidance-report.md` (105), `references/remediation-and-handoff.md` (diff +10/-1), `references/report-formats.md` (unchanged, boundary retained), `reports/phase-03-synthetic-walkthroughs.md` (73). Contracts: phase-03, design-contracts §§4–6, acceptance-matrix (A04/A06/A09, C02–C06, C09, D05, D08, E02–E04, E07–E08).

## Validation
- Relative links + anchors in 6 shipped docs: 0 broken (ad-hoc node check).
- `npm test` in `ext/sonarqube-test-quality`: 28/28 pass.
- Stage enum 17, local-stage enum 10, 18-col §5 table, 4 outcomes W-01..W-04 match prose.
- Vendor check (SonarQube 10.4 issues doc): statuses Open/Accepted/Fixed/False Positive/Confirmed(deprecated); legacy closed/removed/fixed resolutions. No MQR "CLOSED".

## Critical
None. No secrets, no executable-instruction leaks, raw/sanitized split + data-only notices intact, no fabricated server evidence (all samples labeled).

## Warnings
1. **Halting-trigger enum incomplete vs policy-defined blockers.** 10-value enum (templates + run-guidance; not defined in remediation-cycles, which claims sole ownership) lacks triggers for: partial pagination/`window-exceeded-blocked`, `analysis-changed-invalidated`, mid-lifecycle `drift-invalidated` (only `resume-checkpoint-drift` exists), missing capability/auth, declined upload, `unknown-blocked`/unapproved manual transition, pending owner hotspot review, failed F committed-input check/final audit. Fields can't record real halts. Define one enum in remediation-cycles §2/§5; templates/guidance reference it.
2. **Declined upload unspecified.** design §4: "Declined upload stops dependent qualification". remediation-cycles only handles declined commit; template records `Declined` auth but no outcome/trigger.
3. **Run-level outcome selection ambiguous on exhaustion.** "`server-verified residual findings` or `blocked/incomplete`" (§1) with no rule. Round-N halted pre-upload (CK_TEST/rereview fail) has no server capture of current source, yet could be labeled "server-verified". Define: residual only when latest completed capture exists; else blocked/incomplete.
4. **Round outcome vs run outcome conflated.** Diagram "[Consume Ck; halt/next Ck]", W-02 "blocked/incomplete; enter C2". `blocked/incomplete` is set terminal at round halt but run may continue. Add per-round result field vs run outcome, or state who decides continue/halt.
5. **Two-round no-progress undefined for pre-upload rounds / non-issue progress.** Rounds halted before capture have no finding count; hotspots/coverage/gate progress ignored. W-08 only covers two uploaded rounds. Specify: counts only rounds with complete capture, or define treatment.
6. **Observation-state enum violated.** Template §4 uses `not-applicable` as Observation State (line 158); project-discovery §3 allows only `available/passed|available/failed|unsupported|unavailable/misconfigured` (D05 separation). Move N/A to Requirement Level only.
7. **Plan-ID leak into shipped template.** Template line 158 cites `(D04)` — acceptance-matrix ID in installed payload; tracked/installed docs must be self-contained.
8. **Status mapping table partly unsupported.** Raw "MQR" column lists `CLOSED (REMOVED)`/`FIXED (CLOSED)`; vendor `issueStatus` set is OPEN/CONFIRMED/FALSE_POSITIVE/ACCEPTED/FIXED; hotspot rows have no MQR notion. REMOVED vs FIXED must come from legacy `resolution` when present; state `UNKNOWN` fallback explicitly for new-vocab-only servers. Table also contradicts "never hardcoded defaults" unless labeled illustrative/discovered-first.

## Suggestions
1. Sanitized guidance storage location unspecified (ledger `Guidance: <sanitized-path>`). Default outside checkout/approved ignored path to prevent accidental commit; sharing gate alone is weak.
2. `pending_tasks` lacks `pre_scan_generated_digest` though resume compares `generated_input_digest`.
3. Auditor independence: add `auditor_id != evidence_actor_id` (auditor certifies actor output). Currently only `!= implementer`.
4. Define re-baseline cycle ID (`C0-R<n>`); W-07 invents `C0'`, template cycle_id set is `C0|C1..CN|F`.
5. Walkthrough gaps: §3 matrix (new/reopened/unknown) and §4 checks table (failed/unavailable/zero-denominator) not exercised for W-02/W-03; guidance template never populated, only summary table; no raw→sanitized redaction example; W-06 lists two outcomes for one run; numbering skips W-05.
6. Clarify confidence ceiling: synthetic provenance caps *lesson* at `hypothesized`; `validated (offline)` applies to candidate-edit behavior via executed eval (template §5 `Candidate Edit Confidence` already separates; run-guidance §3.2 table doesn't say so).
7. C0 branch only keys on "active issues": zero issues + failing gate/coverage/pending hotspot has no path. Also "cryptographically bound" overstates digest binding (nit); "meet or exceed" vs arbitrary operators; template sample thresholds (80/70%) and Java/Maven flavor — labeled placeholder, consider neutral. Triple-duplicated enums (stages/outcomes/triggers) drift risk — own once in remediation-cycles.

## Positive
Entered-round/exclusion rules faithful to design §4; no hidden retry; one-correction rule; drift-invalidated resume; disappearance≠fixed with 7 causations; owner-only hotspot review; privacy placeholder table with structural redaction; four-gate promotion; ordinary local-fix route preserved; links/anchors clean; walkthrough clearly labeled synthetic.

## Notes
- Installed `remediation-and-handoff.md` now links to refs/templates absent from `lib/install.js` inventory and `package.json#files` → dangling until Phase 06 (documented in walkthrough; same pattern as Phase 02 refs). Gate in Phase 06.
- Plan statuses not edited (Main owns progression).

## Unresolved questions
1. Should run vs round outcome be split (warning 4), or is `blocked/incomplete` intended to be run-terminal per design? Design §4 says "Record/next Ck", implying round-level results.
2. Is "server-verified residual findings" allowed when final round never uploaded?
