---
name: cmd-fix-logs
description: Analyze logs and fix issues
user-invocable: true
disable-model-invocation: true
argument-hint: "[issue] [--advice]"
---

**IMPORTANT:** Analyze the skills catalog and activate the skills that are needed for the task during the process.

## Mission
<raw-issue>$ARGUMENTS</raw-issue>

## Canonical checkpoint routing

Named checkpoints use the canonical `evcrate-advisor-checkpoint/v2` dispatcher block in
`.evcrate-vscode/evcrate/workflows/advisor-mentoring.md` if present; otherwise read `~/.evcrate-vscode/evcrate/workflows/advisor-mentoring.md` (the published install) only under explicit or inherited advice mode.
This command supplies bounded evidence and does not duplicate route or adapter selection.

## Advice Mode

Before discovery or routing, resolve the HOME helper per `.evcrate-vscode/evcrate/workflows/advice-activation.md` if present; otherwise read `~/.evcrate-vscode/evcrate/workflows/advice-activation.md` (the published install) with original `$ARGUMENTS`, canonical `context.command: "fix/logs"`, the current root and any direct caller handoff.
Preserve known direct-caller selections; use `work_target: "fix/logs"` only when no caller target exists, and null plan/phase fields only when unknown.
Set `WORK_ARGUMENTS = result.work_arguments` and `ADVICE_MODE = result.mode`; use the returned work input everywhere below.
Apply neutral `.evcrate-vscode/evcrate/workflows/plan-progress.md` if present; otherwise read `~/.evcrate-vscode/evcrate/workflows/plan-progress.md` (the published install) in every mode. Only resolved `explicit` or `inherited` loads `.evcrate-vscode/evcrate/workflows/advisor-mentoring.md` if present; otherwise read `~/.evcrate-vscode/evcrate/workflows/advisor-mentoring.md` (the published install) and follows its `## Caller lifecycle binding`; `off` keeps ordinary gates and only identified historical get, never hard lifecycle or inference.
Activation failures and repeated blockers follow the shared activation contract; neither history nor a checkpoint activates advice.

Under `explicit` or `inherited` advice mode, this command directly implements and validates fixes and binds its durable lifecycle to `.evcrate-vscode/evcrate/workflows/advisor-mentoring.md` if present; otherwise read `~/.evcrate-vscode/evcrate/workflows/advisor-mentoring.md` (the published install) and `.evcrate-vscode/evcrate/workflows/plan-progress.md` if present; otherwise read `~/.evcrate-vscode/evcrate/workflows/plan-progress.md` (the published install):
1. **Single durable-state owner**: The main agent owns all state controller
   operations (`init`, `checkpoint`, `disposition`, `outcome`, `complete`). Child
   agents (`debugger`, `scout`, `planner`, `tester`, `code-reviewer`) report
   terminal artifacts and actual changed paths within parent-authorized paths; they
   receive strict ownership, writable path, protected path, and delta destination constraints,
   and never operate controller state or stage files behind the main agent.
2. **Active run retention & pre-mutation disposition**: If invoked with an active advice run (`task_run_id`,
   phase, state revision, prior counsel/disposition/outcome), retain that run
   identity across fix and review cycles without initializing a new UUID or using
   scope revision as implicit refresh to bypass stale evidence or counters.
   Before first mutating instructions (logging script config or fix implementation),
   inspect active counsel/action. Resume an already-registered action without
   duplicating it; otherwise require current `accept` with registered correction
   (`action_id`, `episode_id`, `validation_command`) within `task.authorized_paths`
   before writers touch files. For disputed guidance without an active action
   (`reject-with-evidence`, `need-evidence`, `reconcile`), collect read-only evidence
   or an explicit resolution while keeping the baseline unchanged, and obtain fresh
   same-run counsel before corrective mutation or a resolved correction outcome
   (never force an invented action or outcome prerequisite). Finish registered work
   and declared validation/truthful outcome before the next reservation.
3. **Baseline freeze & readonly evidence union**: Freeze all baseline paths
   (`authorized_paths` UNION selected `evidence.files` UNION selected `evidence.artifacts`)
   during reservation, inference, disposition, and final outcome -> complete.
   Read-only reference files and artifacts are captured in baseline for verification and
   integrity, never write authority; only `task.authorized_paths` authorize mutations.
4. **Dynamic revision binding**: Never use deterministic hardcoded revision numbers
   or overrides (such as assuming `task_revision: 2` or `expected_revision: 2`). Always
   use actual revisions returned by `state init` or `state get`/`outcome`, and pass
   the exact reserved checkpoint JSON to inference.
## Workflow
0. **Active-run inspection before mutating instructions**:
   - Under `off` advice mode, apply neutral progress/protection with only separately identified historical get; never initialize state, adopt a discovered run as continuation, or register actions.
   - Under `explicit` or `inherited` advice mode with an active run (`task_run_id`, active phase, state revision, prior counsel/action/disposition):
     - Inspect active counsel and action via `state get`.
     - **Resume existing action**: If an action is already registered (`action_id`, `episode_id`), resume that action without duplicating it; complete its authorized bounded work, run its declared validation (`tester`), and record a truthful matching `state outcome` (with `actual_changed_paths`) before reserving the next checkpoint.
     - **Accepted action registration**: If counsel requires disposition and changes are accepted, record `state disposition` with `action: "accept"`, causal rationale, and canonical `correction: { action_id, episode_id, validation_command }` BEFORE any writer touches files (such as logging config edits or fix implementation). Intended paths are declared in the checkpoint's `proposal.intended_changed_paths` and write authority is strictly bounded to `task.authorized_paths`. Then complete authorized work, run declared validation (`tester`), and record a truthful matching `state outcome` before reserving the next checkpoint.
     - **Disputed counsel without active action**: If counsel is disputed (`reject-with-evidence`, `need-evidence`, or `reconcile`), record `state disposition` with that action, causal rationale, and `correction: null`. Do NOT perform corrective writes and do NOT force an invented action or outcome prerequisite. Collect read-only evidence or an explicit resolution while keeping captured baseline paths unchanged, then obtain fresh same-run counsel via checkpoint reservation and controller inference BEFORE any corrective mutation or resolved correction outcome.
     - **Terminal inference failure or no active work**: Do not force an invented action or outcome; keep baseline unchanged and resolve the advice gate before mutation.
   - If fresh first review under `explicit` or `inherited` mode (no active run yet): do NOT initialize state at command start just to track logging config, discovery, or initial execution.
1. Check if `./logs.txt` exists:
   - In `explicit` or `inherited` advice mode with an active run, mutating logging script configs requires an ACCEPT registered action (`action: "accept"` with registered `correction: { action_id, episode_id, validation_command }`) within `task.authorized_paths` before modifying files. Mutating script configs under a disputed or unregistered disposition is forbidden. In `off` mode, configure logging normally with user approval.
   - If missing, set up permanent log piping in project's script config (`package.json`, `Makefile`, `pyproject.toml`, etc.):
     - **Bash/Unix**: append `2>&1 | tee logs.txt`
     - **PowerShell**: append `*>&1 | Tee-Object logs.txt`
   - Run the command to generate logs
2. Use `debugger` subagent to analyze `./logs.txt` and find root causes:
   - Use `Grep` with `head_limit: 30` to read only last 30 lines (avoid loading entire file)
   - If insufficient context, increase `head_limit` as needed
3. Use `scout` subagent to analyze the codebase and find the exact location of the issues, then report back to main agent.
4. Use `planner` subagent to create an implementation plan based on the reports, then report back to main agent. Reconcile plans and phase status via `.evcrate-vscode/evcrate/workflows/plan-progress.md` if present; otherwise read `~/.evcrate-vscode/evcrate/workflows/plan-progress.md` (the published install). For advice-controlled plans, link navigation to `<plan-dir>/progress.md` before capture; old sealed plans remain untouched.
5. Start implementing the fix based the reports and solutions.
6. Use `tester` agent to test the fix and make sure it works, then report back to main agent.
7. Code Review:
   - **Under `off` advice mode**: Use `code-reviewer` subagent to review the code changes and wait for its terminal report. On a second consecutive matching terminal blocker without progress, escalate through ordinary debugger/user handling before another attempt; do not invoke a checkpoint.
   - **Under `explicit` or `inherited` advice mode**: Use `code-reviewer` subagent to review the code changes and wait for its terminal report, then enter the canonical checkpoint dispatcher at `review:fix-logs` under `.evcrate-vscode/evcrate/workflows/advisor-mentoring.md` if present; otherwise read `~/.evcrate-vscode/evcrate/workflows/advisor-mentoring.md` (the published install):
     * **Fresh first review (no active run yet)**: Settle fix implementation, test validation, reviewer report, and selected evidence artifacts. Enforce a writer barrier (no intervening file edits or Git index mutations). `baseline_paths` = `authorized_paths` (writable fix files) UNION selected read-only `evidence.files` (e.g. `logs.txt`, test output, review report) UNION selected `evidence.artifacts`. Read-only reference files and artifacts are captured for verification but MUST NOT be included in `authorized_paths` (readonly evidence union, not write authority). Run `state init` immediately before reservation (`checkpoint`). Remove numeric overrides; use actual returned revision from `init` as `expected_revision` and `task_revision` for the reservation, and pass the exact reserved checkpoint JSON directly to inference via the central controller. Never initialize at command start just to track implementation. Obtain terminal `ADVICE_READY` counsel before fixing, approving, or reporting findings.
     * **Existing active run (repeat review cycle)**: Retain the same `task_run_id`, phase, revisions, and prior counsel/disposition/outcome. If a registered action remains, finish its authorized work, actual validation, and truthful matching outcome before the next reservation; never duplicate that action. Disputed guidance without an active action follows step 8's read-only evidence/resolution and fresh-counsel branch, without an invented outcome. Reserve with actual returned state revisions and pass the exact reserved checkpoint to inference.
     * **Review/advisor cycle cap**: At most three terminal reviewer/advisor cycles. At the cap, stop without another review/advisor call or cycle reset, then ask the user if issues remain. If durable correction exhaustion occurs (`correction_count === 3`), the state transitions to `needs_human` and requires interactive terminal authorization; conversational approval cannot forge completion.
8. If there are issues, failed tests, or reviewer/advisor must-fix findings:
   - Accepted counsel in `explicit` or `inherited` advice mode: record `state disposition` with
     `action: "accept"` and canonical `correction: { action_id, episode_id, validation_command }`
     before writes (bounded to `task.authorized_paths` and declared
     `proposal.intended_changed_paths`), or resume that action if already active.
     Repeat step 3 (or step 5) within authorized paths, run actual declared validation,
     and record its matching truthful `state outcome` with `actual_changed_paths`
     before the next same-run review within the cap.
   - Disputed counsel in `explicit` or `inherited` advice mode: record `reject-with-evidence`,
     `need-evidence`, or `reconcile` (with `correction: null`); collect read-only
     evidence or an explicit resolution while keeping the baseline unchanged,
     then obtain fresh same-run counsel before corrective mutation or a resolved
     correction outcome. Do not invent an action or outcome for this branch.
   - In `off` mode, repeat step 3 (or step 5), re-run `tester`, and repeat review within the existing cap without controller operations.
9. Finalization and Completion:
   - In `off` mode, finalize only after ordinary approval and validation; skip the durable disposition/outcome/complete branches below. Apply neutral progress/protection and administrative reporting.
   - The following registered-action, no-change-outcome and durable-completion branches apply only in `explicit` or `inherited` mode under `## Caller lifecycle binding`.
   - **Distinguish no-change closure from registered bounded finalization**:
     - **No-change outcome**: Requires 0 actual changed paths (`actual_changed_paths: []`),
       passed declared validation, `accept` disposition, and no `must_fix` or
       `unresolved_questions` in counsel; cautions/assumptions alone do not require
       invented edits or index mutations.
     - **Registered bounded finalization action**: Any substantive doc/report/status
       writes (e.g. summary report) OR selected Git index transitions (staging or
       committing selected captured paths) change baseline content or index
       identities and MUST occur BEFORE final outcome and completion as part of a
       registered bounded action with matching validation and a truthful `state
       outcome` advancing the baseline.
   - **Durable completion**: Call `state complete` (with `expected_revision`) only
     after the final truthful outcome settles the baseline. Do NOT mark durable
     phase complete or claim DONE prematurely in captured files before `state
     complete` succeeds (controller abandonment sets `gate_status: completed` but
     is never successful completion; completion requires a matching resolved outcome).
    After `state complete` succeeds, parent writes mandatory immutable completion receipts outside the captured baseline snapshot and updates the derived live overview `<plan-dir>/progress.md` (uncaptured, outside baseline; never captured or cited as evidence/authorized substantive paths; if already captured, cannot overwrite progress, surface blocker) per shared receipt rules in `.evcrate-vscode/evcrate/workflows/plan-progress.md` if present; otherwise read `~/.evcrate-vscode/evcrate/workflows/plan-progress.md` (the published install). Preserved historical snapshot protection applies across runs even without `--advice`; prior sealed paths remain immutable, while current-run registered pre-seal writes within parent-authorized paths remain permitted. Never direct edits to sealed plans or metadata/roadmap after seal.
  - **Sealed baseline**: Do NOT stage, commit, or mutate captured baseline files or their Git index state after `state complete` seals the run; only bounded administrative receipt and progress publication outside baseline is permitted per `.evcrate-vscode/evcrate/workflows/plan-progress.md` if present; otherwise read `~/.evcrate-vscode/evcrate/workflows/plan-progress.md` (the published install).
  - **Administrative reporting**: Respond back to user with a summary of the changes and explain everything briefly, guide user to get started, and suggest next steps. In `off` mode, if executing in an advice-controlled plan with prior historical advice phases, save an uncaptured immutable phase receipt explicitly marked `default approval/validation; not durable advice completion` and update `progress.md` per `.evcrate-vscode/evcrate/workflows/plan-progress.md` if present; otherwise read `~/.evcrate-vscode/evcrate/workflows/plan-progress.md` (the published install). For advice-controlled plans or preserved snapshots, point output to `<plan-dir>/progress.md`; old sealed `plan.md` remains untouched. Normal default plans with no history do not require, read, or output nonexistent progress links. Any optional post-completion administrative receipt must be strictly OUTSIDE the captured baseline snapshot, identify the approved snapshot, and cannot claim unreviewed edits.
