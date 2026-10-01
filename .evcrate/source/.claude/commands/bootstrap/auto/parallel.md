---
description: "Bootstrap project with parallel execution"
argument-hint: "[user-requirements] [--advice]"
---
**Ultrathink parallel** raw input: <raw-user-requirements>$ARGUMENTS</raw-user-requirements>

## Canonical checkpoint routing

Named checkpoints use the canonical `evcrate-advisor-checkpoint/v2` dispatcher block in
`.claude/workflows/advisor-mentoring.md`; this command supplies bounded evidence
and does not duplicate route or adapter selection.

## Advice Mode

A final standalone `--advice` activates explicit review mentoring.
Before research, read `.claude/workflows/advisor-mentoring.md` and derive
`WORK_ARGUMENTS` plus explicit/default advice mode. Use `WORK_ARGUMENTS` as the
user requirements and apply the shared default stuck-escalation contract.
When explicit advice mode is active, caller lifecycle follows
`## Caller lifecycle binding` in `.claude/workflows/advisor-mentoring.md`.
**IMPORTANT:** Activate needed skills. Ensure token efficiency. Sacrifice grammar for concision.
**YAGNI, KISS, DRY** principles apply.

## Workflow

### 1. Git Init
- Check if Git initialized, if not: use `git-manager` (main branch)

### 2. Research
- Use max 2 `researcher` agents in parallel
- Explore requirements, validation, challenges, solutions
- Keep reports ≤150 lines

### 3. Tech Stack
- Use `planner` + multiple `researcher` agents in parallel for best fit tech stack
- Write to `./docs` directory (≤150 lines)

### 4. Wireframe & Design
- Use `ui-ux-designer` + `researcher` agents in parallel
- Research: style, trends, fonts, colors, spacing, positions
- Describe assets for `ai-multimodal` generation
- Create design guidelines at `./docs/design-guidelines.md`
- Generate wireframes HTML at `./docs/wireframe`
- Generate logo with `ai-multimodal` if needed
- Screenshot with `chrome-devtools` → save to `./docs/wireframes/`
- Ask user to approve (repeat if rejected)

### Decision Checkpoints

- At each existing bootstrap approval/action site, branch explicitly: if the
  decision is irreversible, security-sensitive, or go/no-go and is not covered
  by terminal review:
  1. If no earlier active run exists, the parent (sole durable-state owner) initializes
     task state immediately before checkpoint reservation (never at arbitrary command
     start). Scope planned writable deliverables into `authorized_paths`, and scope the
     union of `authorized_paths` and selected `evidence.files/artifacts` (cited read-only
     contracts/specifications not writable) into `baseline_paths`.
  2. Enter the canonical checkpoint dispatcher exactly once at `decision:<workflow-step>`
     with bounded evidence from `advisor-mentoring.md`, forward prior counsel and owner
     disposition, and wait for the terminal result (`ADVICE_READY`) before approval or
     action. Freeze all baseline paths during reservation, inference, and disposition.
  3. The parent records owner disposition before proceeding to approval, implementation,
     or action: for accepted writes, require `accept` with a registered action (action ID,
     episode ID, declared validation command) before mutating files; resume an already-registered
     action without duplicating it. For disputed counsel (`reject-with-evidence`, `need-evidence`,
     or `reconcile`) without active work, collect read-only evidence or an explicit resolution
     while keeping the captured baseline unchanged, and obtain fresh same-run counsel before any
     corrective mutation or resolved outcome; do not invent an action or outcome for this
     evidence-only branch.
  4. Retain this active run identity (`task_run_id`, phase, project root, state revision,
     prior counsel/disposition/outcome, and correction counters) through subsequent
     workflow steps. Child agents (`fullstack-developer`, `ui-ux-designer`, `tester`, etc.)
     report terminal artifacts and actual changed paths; never operate controller state or
     stage behind the parent.
  5. When an already-active action or authorized implementation, testing, and reports settle
     under an active run, run actual declared validation and record a truthful `outcome` with
     actual changed paths advancing the baseline and evidence revision BEFORE any subsequent
     `review:<workflow-step>` reservation; resume an existing action without duplicating it.
     For disputed guidance without active work, do not force or invent an action/outcome
     prerequisite before re-consulting under the same run. Never initialize a new UUID to
     bypass stale evidence or reset correction counters.
- Routine stack, plan, and design approvals are excluded unless explicitly classified as
  irreversible, security-sensitive, or go/no-go. Otherwise continue the existing
  approval/action without a dispatcher checkpoint.
### 5. Parallel Planning & Implementation
- Trigger `/plan:parallel <detailed-instruction>` for parallel-executable plan
- Read `plan.md` for dependency graph and execution strategy
- Launch multiple `fullstack-developer` agents in PARALLEL for concurrent phases
  - Pass: phase file path, environment info
- Use `ui-ux-designer` for frontend (generate/analyze assets with `ai-multimodal`, edit with `imagemagick`)
- Run type checking after implementation

### 6. Testing
- Write real tests (NO fake data/mocks)
- Use `tester` subagent
- If fail: `debugger` → fix → repeat

### 7. Code Review
- Use `code-reviewer` and wait for its terminal report
- Enforce a writer barrier: child agents and implementation/test writes must settle before review checkpoint handling.
- In explicit advice mode:
  - If an active run exists (from an earlier decision or stuck checkpoint): retain its identity (`task_run_id`, phase, state revision, prior counsel/disposition/outcome). If a registered action remains, finish its authorized work, actual declared validation, and truthful matching `outcome` before the next reservation; resume an existing action without duplicating it. For disputed guidance (`reject-with-evidence`, `need-evidence`, `reconcile`) without an active action, collect read-only evidence or an explicit resolution while keeping the baseline unchanged, and obtain fresh same-run counsel before corrective mutation or a resolved correction outcome; do not invent an action or outcome prerequisite for this evidence-only branch.
  - If no earlier active run exists (fresh review): initialize task state immediately before reservation with `baseline_paths = authorized writable paths UNION selected evidence.files/artifacts` (cited read-only references not writable), with no intervening captured path or Git index mutations.
  - Immediately follow every terminal review with exactly one blocking `advisor` call at `review:<workflow-step>` using the canonical checkpoint dispatcher with bounded evidence, relevant prior counsel, and owner disposition. Dispatcher failure (`FAILED`, nonzero, malformed) leaves the review gate incomplete. Freeze all baseline paths during reservation, inference, and disposition.
  - Review/advisor cycle cap: at most three terminal reviewer/advisor cycles; at the cap, stop without another reviewer/advisor call or cycle reset before asking the user for direction. Durable `needs_human` gate cannot be bypassed by chat approval text.
  - On `ADVICE_READY`, evaluate counsel and inspect remaining whole-phase mutations BEFORE selecting disposition:
    - If fixes are required: for accepted corrections, the parent records owner disposition (`accept`) with a registered bounded action and declared validation command before writes (or resumes an existing registered action without duplicating it), implements fixes, runs actual validation, records a truthful `outcome` advancing the baseline, and re-reviews under the cycle cap (at most three reviewer/advisor cycles).
    - If guidance is disputed: record supported canonical disposition `reject-with-evidence`, `need-evidence`, or `reconcile` without an action or outcome; collect read-only evidence or an explicit resolution while keeping the baseline unchanged, and obtain fresh same-run counsel before any corrective mutation or resolved outcome.
    - If review is clean (no code fixes required): inspect remaining whole-phase mutations before selecting disposition:
      * If substantive finalization remains (planned documentation, roadmap, status updates, onboarding configuration, or selected Git staging/commit): do NOT record a premature no-change outcome. Instead, register ONE bounded action (`accept` with `action_id`, `episode_id`, `validation_command`) covering all remaining finalization work (docs/status/config/selected Git) with matching declared validation BEFORE the first finalization mutation. Proceed to user approval and authorized finalization.
      * If the entire phase has zero remaining file/index/status mutations, actual declared validation passed, and counsel has no `must_fix` or `unresolved_questions`: record an `accept` disposition with `correction: null` (cautions/assumptions alone require no invented edits). DELAY outcome and completion to the finalization exit. Since no substantive finalization writes are needed, skip docs/config/index writers (no fake action; do not mutate documentation, configuration, or Git index). Proceed directly to user approval before exit.
- When all tests pass, code is reviewed, and tasks are completed, report back to user with a summary of the changes and explain everything briefly, ask user to review the changes and approve them before exit seal.
  - If user requests fixes / rejects:
    * In explicit advice mode: rejection and fixes are handled before seal under the active context (resume an existing registered action without duplicating it, or record owner disposition/registered action for accepted fixes, implement fixes, run actual validation, record outcome advancing the baseline, and re-review under the cycle cap). Never seal a rejected or unresolved run.
    * In default mode: ask user to explain the issues, fix all of them, and repeat the process.
  - If user approves the changes: proceed to finalization.
### 8. Documentation
- In default mode: use `docs-manager` to create/update:
  - `./docs/README.md` (≤300 lines)
  - `./docs/project-overview-pdr.md`
  - `./docs/code-standards.md`
  - `./docs/system-architecture.md`
  - Use `project-manager` for `./docs/project-roadmap.md`
- In explicit advice mode:
  - Remaining-work branch (registered finalization action): execute authorized documentation and roadmap writes under the registered action. Planned documentation, roadmap, and status deliverables are scoped into `authorized_paths` and captured in `baseline_paths` upfront (captured as absent if planned writable outputs).
  - Clean nochange branch (`correction: null`): skip documentation and roadmap writers entirely (no substantive finalization writes needed; no fake action).
- Subagents report terminal artifacts and actual changed paths; subagents never operate controller state or stage behind the parent

### 9. Onboarding
- In default mode:
  - Guide user to get started (1 question at a time)
  - Help configure (API keys, env vars, etc.)
- In explicit advice mode:
  - Remaining-work branch: execute phase-owned onboarding configuration step by step under the registered finalization action.
  - Clean nochange branch: skip configuration mutations (provide readonly onboarding guidance only; no workspace mutations).

### 10. Final Report
- Summary, guide, next steps
- In default mode: explicitly preserve existing default-mode behavior: ask user if they want to commit (use `git-manager` if yes), without controller state operations.
- In explicit advice mode, converge BOTH clean registered finalization and nochange paths at ONE finalization exit after required human approval:
  - Enforce writer barrier: all documentation/roadmap writes, onboarding configuration, and Git staging/commit settle before recording final outcome.
  - Choose the ONE truthful outcome matching disposition:
    * If clean nochange branch (`correction: null`): skip substantive finalization writes (no fake action); record the ONE truthful no-change `resolved` outcome with `action_id: null`, `episode_id: null`, and `actual_changed_paths: []` per canonical schemas (`correction` is not an outcome field; validation status passed).
    * If remaining-work branch (registered finalization action): run declared validation across all finalized deliverables, then record the ONE truthful `state outcome` matching the registered finalization action, reporting all actual changed paths and declared validation status.
  - Complete ONCE: Seal the task run via `state complete`. The durable completion receipt is authoritative. Complete exactly once; ensure no early seal, no fallthrough, no duplicate completion, no second disposition using consumed counsel, and no hidden extra review cycle or reinit.
  - After sealing, freeze all captured baseline paths: never mutate captured evidence, documentation, reports, or index after complete, and never prescribe copying DONE into captured files after sealing. Any post-completion administrative receipt must be outside the captured snapshot and identify the approved snapshot without claiming later unreviewed edits.
  - Emit readonly summary; do not execute Git commands or mutations after seal.
