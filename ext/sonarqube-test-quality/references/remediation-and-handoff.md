# Remediation and Handoff

## Workspace and state preservation

- Default remediation operates in the requested existing checkout. Verify CWD and branch match the target before editing.
- Worktree execution is optional and opt-in only ([Worktree remediation](worktree-remediation.md)); require explicit user-supplied branch name and destination path before creation.
- Preserve dirty working tasks: never run `git stash`, `git reset`, `git checkout`, or copy dirty changes wholesale.
- If uncommitted changes in the active checkout touch target files requiring remediation, pause immediately and request user direction before proceeding.
- Confine all code edits, Maven builds, test runs, and coverage outputs (`target/`, `jacoco.exec`) to the selected execution checkout (active checkout by default, or isolated worktree if opted in).
## Triage and edits

- Prioritize blocker/critical findings (blocker/high in MQR), then major reliability or maintainability issues (medium in MQR), then remaining in-scope findings. Assess actual impact, not severity alone.
- Confirm each finding against code in the execution checkout before editing. Fix root causes in production code; keep unrelated cleanup out.
- For security hotspots, explain the relevant data flow, operational context, and threat assumptions for human owner review. Subagents must never mark hotspots resolved or accepted on the server; server resolution is performed exclusively by the human project owner.
- Use small, valid synthetic fixtures. Do not use customer or production data.
- Keep test assertions meaningful. Prefer AssertJ extraction/chaining or JUnit `assertAll` for related assertions rather than brittle assertion noise.

## Result record

Use the same private approved `<evidence-destination>/sonar-report.md` for each coherent batch; initialize once from [the report template](../templates/remediation-cycle-report.md). Parent alone writes; other roles return evidence inline.

- Run/resume: source/execution checkout, branch/PR and SHA, digests, scope and approvals. For ordinary local fixes, N and cycle-role fields are `not-applicable`; do not acquire Sonar credentials merely to edit from a saved report.
- Issues and hotspots: merge by `(target, finding ID)` into `Issue | File | Detail | Local status | Server status | Next action`. Preserve root causes, local changes, tests/review receipts and historical rows; retain explicit causation/owner disposition in Detail/Next action and all transitions by ID in Cycle history. Hotspot next action includes human owner review.
- Coverage and checks: `Target / file | Metric / check | Value | Requirement | Status / next action`; append cycle/analysis-tagged observations, retaining baseline/prior values, focused/clean-suite commands, actual test counts/results, fresh coverage/scope and gate/query results. Missing/failed remote evidence never implies zero issues.
- Cycle history and Blockers: retain batch result, checkpoint, task/certified and pre/post capture analysis IDs/gate, all finding transitions, incomplete paging/consistency and next action. Ordinary local results never certify server success.

Batch once per stage/batch result, except bounded-cycle pre-edit accounting, pre-dispatch upload intents and immediate task-ID durability. API JSON is transient; no raw bundle, separate checkpoint, YAML mirror, actor summary, guidance document or file per cycle. Native logs/coverage/scanner scratch remain tool outputs.

## Iterative cycles and resume

For multi-round, budget-governed remediation across local scanner lifecycles or polyglot targets:
- Consult [Remediation cycles](remediation-cycles.md) for N accounting, the 17 stages, one-correction limit, independent roles, resume and final success contract.
- Use the same sonar-report.md and [template](../templates/remediation-cycle-report.md). Persist budget/correction accounting before edits, per-target in-flight intent before any C0/CK/F upload-capable dispatch, and verified task ID immediately after upload; parent acknowledges durability before actor polling/next target. Resume known tasks read-only; an intent without verified fresh native task-file provenance blocks submission-unverified, never resubmits. Revalidate source/frozen context.
- Optional useful failure/recovery notes belong inline under [privacy rules](run-guidance.md), not a mandatory guidance/promotions catalog.

**Ordinary local fix preservation:** Single-batch local fixes from saved reports remain lightweight: no required N, Sonar authentication, independent child roles, scanner upload or server qualification.

## Handoff and cleanup boundaries

- Do not implicitly commit, merge into the source branch, or assign upstream tracking (`git push -u`).
- Source branch push-to-scan authorizations never transfer to a separate fix branch or worktree; pushing requires explicit user authorization naming the target remote and branch.
- When an optional worktree is used, retain it for user review. Safe cleanup requires explicit user authorization after delivery; never use `git worktree remove --force`.
- Do not include secrets, tokens, customer data or raw credential-bearing output. A failed or unavailable remote check is not evidence that no issues remain. Keep durable evidence in the one private sonar-report.md; do not create an extra handoff file. Public response contains only the needed sanitized summary; sharing any excerpt requires owner permission.