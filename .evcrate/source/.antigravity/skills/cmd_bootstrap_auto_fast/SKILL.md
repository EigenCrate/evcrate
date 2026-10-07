---
name: cmd_bootstrap_auto_fast
description: Quickly bootstrap a new project automatically
---
# cmd_bootstrap_auto_fast

Command Path: /bootstrap/auto/fast

Description: Quickly bootstrap a new project automatically

---
description: "Quickly bootstrap a new project automatically"
argument-hint: "[user-requirements] [--advice]"
---
**Think hard** to plan & bootstrap a new project follow the Orchestration Protocol, Core Responsibilities, Subagents Team and Development Rules in your `CLAUDE.md` file: 

---

## User's Objectives & Requirements

<raw-user-requirements>$ARGUMENTS</raw-user-requirements>

## Canonical checkpoint routing

Named checkpoints use the canonical `evcrate-advisor-checkpoint/v2` dispatcher block in
`.antigravity/workflows/advisor-mentoring.md` if present; otherwise read `~/.gemini/config/workflows/advisor-mentoring.md` (the published install) only under explicit or inherited advice mode.
This command supplies bounded evidence and does not duplicate route or adapter selection.

## Advice Mode

Before discovery or routing, resolve the HOME helper per `.antigravity/workflows/advice-activation.md` if present; otherwise read `~/.gemini/config/workflows/advice-activation.md` (the published install) with original `$ARGUMENTS`, canonical `context.command: "bootstrap/auto/fast"` and the current root. A user-entered command always uses `handoff: null`. A handoff exists only when built by the router delegating this exact call; never reuse or replay one from earlier turns, commands, plans, reports or transcripts.
Preserve known selections from the exact-call router; use `work_target: "bootstrap/auto/fast"` only when no such target exists, and null plan/phase fields only when unknown.
Set `WORK_ARGUMENTS = result.work_arguments` and `ADVICE_MODE = result.mode`; use the returned work input everywhere below.

Apply neutral `.antigravity/workflows/plan-progress.md` if present; otherwise read `~/.gemini/config/workflows/plan-progress.md` (the published install) in every mode. Only resolved `explicit` or `inherited` loads `.antigravity/workflows/advisor-mentoring.md` if present; otherwise read `~/.gemini/config/workflows/advisor-mentoring.md` (the published install) and follows its `## Caller lifecycle binding`; `off` keeps ordinary gates and uses only immutable in-repo receipts and sealed-path metadata, never `evcrate-advisor`, hard lifecycle or inference.
Activation failures and repeated blockers follow the shared activation contract; neither history nor a checkpoint activates advice.
---

## Role Responsibilities

- You are an elite software engineering expert who specializes in system architecture design and technical decision-making. 
- Your core mission is to find the best possible solutions while maintaining brutal honesty about feasibility and trade-offs, then collaborate with your subagents to implement the plan.
- You operate by the holy trinity of software engineering: **YAGNI** (You Aren't Gonna Need It), **KISS** (Keep It Simple, Stupid), and **DRY** (Don't Repeat Yourself). Every solution you propose must honor these principles.

- **IMPORTANT:** Sacrifice grammar for the sake of concision when writing reports.
- **IMPORTANT:** In reports, list any unresolved questions at the end, if any.

---

## Your Approach

1. **Brutal Honesty**: Provide frank, unfiltered feedback about ideas. If something is unrealistic, over-engineered, or likely to cause problems, say so directly. Your job is to prevent costly mistakes.
2. **Consider All Stakeholders**: Evaluate impact on end users, developers, operations team, and business objectives.

---

## Workflow:

Follow strictly these following steps:

**First thing first:** check if Git has been initialized, if not, use `git-manager` subagent to quickly initialize it (use `main` branch).

**IMPORTANT:** Analyze the skills catalog and activate the skills that are needed for the task during the process.

### Research & Planning: Tech Stack, Wireframe & Design

1. **Research (do these following tasks in parallel):**
* Use 2 `researcher` subagents in parallel (only read up to max 5 sources) to explore the user's request, idea validation, challenges, and find the best possible solutions.
* Use 2 `researcher` subagents in parallel (only read up to max 5 sources) to find a best fit tech stack for this project.
* Use 2 `researcher` subagents in parallel (only read up to max 5 sources) to create a design plan that follows the progressive disclosure structure:
  - Create a directory using naming pattern from `## Naming` section.
  - Save the overview access point at `plan.md`, keep it generic, under 80 lines, and list each phase with status/progress and links. Reconcile plans and phase status via `.antigravity/workflows/plan-progress.md` if present; otherwise read `~/.gemini/config/workflows/plan-progress.md` (the published install). For advice-controlled plans, link navigation to `<plan-dir>/progress.md` before capture; old sealed plans remain untouched.
  - For each phase, add `phase-XX-phase-name.md` files containing sections (Context links, Overview with date/priority/statuses, Key Insights, Requirements, Architecture, Related code files, Implementation Steps, Todo list, Success Criteria, Risk Assessment, Security Considerations, Next steps).
* Keep every research markdown report concise (≤150 lines) while covering all requested topics and citations.
   - **Research** about design style, trends, fonts, colors, border, spacing, elements' positions, etc.
   - Describe details of the assets in the design so they can be generated with `ai-multimodal` skill later on.
   - **IMPORTANT:** Try to predict the font name (Google Fonts) and font size in the given screenshot, don't just use **Inter** or **Poppins** fonts.
* **IMPORTANT:** Sacrifice grammar for the sake of concision when writing outputs.

2. **Planning (do these following tasks one after another):**
* Use `ui-ux-designer` subagent to analyze the research results and create the design guidelines at `./docs/design-guidelines.md` file & generate wireframes in HTML at `./docs/wireframe` directory, make sure it's clear for developers to implement later on.
* If there are no logo provided, use `ai-multimodal` skill to generate a logo.
* Use `chrome-devtools` skill to take a screenshot of the wireframes and save it at `./docs/wireframes/` directory.
* Use `planner` subagent to analyze all reports and create the detailed step by step implementation plan at `./plans` directory following the progressive disclosure structure above.
* **IMPORTANT:** Sacrifice grammar for the sake of concision when writing outputs.

### Decision Checkpoints

At each existing bootstrap approval/action site, branch explicitly: if the
decision is irreversible, security-sensitive, or go/no-go and is not covered by
terminal review:
- **Under `off` advice mode**: Request ordinary user review and approval via
  `AskUserQuestion` before proceeding or mutating files; do NOT initialize state,
  reserve checkpoints, or perform controller state operations.
- **Under `explicit` or `inherited` advice mode**:
  1. If no earlier active run exists, the parent (sole durable-state owner) initializes
     task state immediately before checkpoint reservation (never at arbitrary command
     start). Scope planned writable deliverables into `authorized_paths`, and scope the
     union of `authorized_paths` and selected `evidence.files/artifacts` (cited read-only
     contracts/specifications not writable) into `baseline_paths`.
  2. Enter the canonical checkpoint dispatcher exactly once at `decision:<workflow-step>`
     with bounded evidence from `.antigravity/workflows/advisor-mentoring.md` if present; otherwise read `~/.gemini/config/workflows/advisor-mentoring.md` (the published install), forward prior counsel
     and owner disposition, and wait for its terminal result (`ADVICE_READY`) before approval or
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
     workflow steps. Child agents report terminal artifacts and actual changed paths within
     parent-authorized paths; they receive strict ownership, writable path, protected path,
     and delta destination constraints, and never operate controller state or stage behind the parent.
  5. When an already-active action or authorized implementation, testing, and reports settle
     under an active run, run actual declared validation and record a truthful `outcome` with
     actual changed paths advancing the baseline and evidence revision BEFORE any subsequent
     `review:<workflow-step>` reservation; resume an existing action without duplicating it.
     For disputed guidance without active work, do not force or invent an action/outcome
     prerequisite before re-consulting under the same run. Never initialize a new UUID to
     bypass stale evidence or reset correction counters.

Routine stack, plan, and design preferences are excluded unless explicitly classified as
irreversible, security-sensitive, or go/no-go. Otherwise continue the existing
approval/action without a dispatcher checkpoint.
### Implementation

* Use `general agent (main agent)` to implement the plan step by step, follow the implementation plan in `./plans` directory.
* Use `ui-ux-designer` subagent to implement the frontend part follow the design guidelines at `./docs/design-guidelines.md` file.
  * Use `ai-multimodal` skill to generate the assets.
  * Use `ai-multimodal` (`video-analysis`, or `document-extraction`) skills to analyze the generated assets based on their format.
  * Use `Background Removal Tool` to remove background from the assets if needed.
  * Use `ai-multimodal` (`image-generation`) skill to edit the assets if needed.
  * Use `imagemagick` skill to crop or resize the assets if needed.
* Run type checking and compile the code command to make sure there are no syntax errors.

### Testing

* Write the tests for the plan, make sure you don't use fake data just to pass the tests, tests should be real and cover all possible cases.
* Use `tester` subagent to run the tests, make sure all tests pass and the app is working, then report back to main agent.
* If there are issues or failed tests, use `debugger` subagent to find the root cause of the issues, then ask main agent to fix all of them. 
* Repeat the process until all tests pass or no more issues are reported. 
* **Again, do not ignore failed tests or use fake data just to pass the build or github actions.**

### Code Review

* After finishing, delegate to `code-reviewer` and wait for its terminal report.
* Enforce a writer barrier: child agents and implementation/test writes must settle before review checkpoint handling.
* **Under `off` advice mode**:
  - Proceed with standard review report and user approval. On a second consecutive matching terminal blocker without progress, escalate through ordinary debugger/user handling before another attempt; do not invoke a checkpoint.
  - If user requests fixes / rejects: ask user to explain the issues, fix all of them, and repeat the process.
  - If user approves the changes: proceed to finalization.
* **Under `explicit` or `inherited` advice mode**:
  - If an active run exists (from an earlier decision or stuck checkpoint): retain its identity (`task_run_id`, phase, state revision, prior counsel/disposition/outcome). If a registered action remains, finish its authorized work, actual declared validation, and truthful matching `outcome` before the next reservation; resume an existing action without duplicating it. For disputed guidance (`reject-with-evidence`, `need-evidence`, `reconcile`) without an active action, collect read-only evidence or an explicit resolution while keeping the baseline unchanged, and obtain fresh same-run counsel before corrective mutation or a resolved correction outcome; do not invent an action or outcome prerequisite for this evidence-only branch.
  - If no earlier active run exists (fresh review): initialize task state immediately before reservation with `baseline_paths = authorized writable paths UNION selected evidence.files/artifacts` (cited read-only references not writable), with no intervening captured path or Git index mutations.
  - Immediately follow every terminal review with exactly one blocking `advisor` call at `review:<workflow-step>` using the canonical checkpoint dispatcher with bounded evidence, relevant prior counsel, and owner disposition. Dispatcher failure (`FAILED`, nonzero, malformed) leaves the review gate incomplete. Freeze all baseline paths during reservation, inference, and disposition.
  - Review/advisor cycle cap: at most three terminal reviewer/advisor cycles; at the cap, stop without another reviewer/advisor call or cycle reset before asking the user for direction. Durable `needs_human` gate cannot be bypassed by chat approval text.
  - On `ADVICE_READY`, evaluate counsel and inspect remaining whole-phase mutations BEFORE selecting disposition:
    - If fixes are required: for accepted corrections, the parent records owner disposition (`accept`) with a registered bounded action and declared validation command before writes (or resumes an existing registered action without duplicating it), implements fixes, runs actual validation, records a truthful `outcome` advancing the baseline, and re-reviews under the cycle cap (at most three reviewer/advisor cycles).
    - If guidance is disputed: record supported canonical disposition `reject-with-evidence`, `need-evidence`, or `reconcile` without an action or outcome; collect read-only evidence or an explicit resolution while keeping the baseline unchanged, and obtain fresh same-run counsel before any corrective mutation or resolved outcome.
    - If review is clean (no code fixes required): inspect remaining whole-phase mutations before selecting disposition:
      * If substantive finalization remains (planned documentation, roadmap, status updates, Git commits, or onboarding configuration): do NOT record a premature no-change outcome. Instead, register ONE bounded action (`accept` with `action_id`, `episode_id`, `validation_command`) covering all remaining finalization work (docs/status/Git commits/config) with matching declared validation BEFORE the first finalization mutation. Proceed to user approval and authorized finalization.
      * If the entire phase has zero remaining file/index/status mutations, actual declared validation passed, and counsel has no `must_fix` or `unresolved_questions`: record an `accept` disposition with `correction: null` (cautions/assumptions alone require no invented edits). DELAY outcome and completion to the finalization exit. Since no substantive finalization writes are needed, skip docs/config/index writers (no fake action; do not mutate documentation, configuration, or Git index). Proceed directly to user approval before exit.
  - When all tests pass, code is reviewed, and tasks are completed, report back to user with a summary of the changes and explain everything briefly, ask user to review the changes and approve them before exit seal.
  - If user requests fixes / rejects: rejection and fixes are handled before seal under the active context (resume an existing registered action without duplicating it, or record owner disposition/registered action for accepted fixes, implement fixes, run actual validation, record outcome advancing the baseline, and re-review under the cycle cap). Never seal a rejected or unresolved run.
  - If user approves the changes: proceed to finalization.
* **IMPORTANT:** Sacrifice grammar for the sake of concision when writing outputs.
### Documentation

* **Under `off` advice mode**: use `docs-manager` subagent to update the docs if needed. If executing a default phase in an advice-controlled plan with prior historical advice phases, save an uncaptured immutable phase receipt explicitly marked `default approval/validation; not durable advice completion` and update `progress.md` per `.antigravity/workflows/plan-progress.md` if present; otherwise read `~/.gemini/config/workflows/plan-progress.md` (the published install); prior sealed paths remain immutable.
  * Create/update `./docs/README.md` file (keep it concise and under 300 lines).
  * Create/update `./docs/project-overview.-pdr.md` (Product Development Requirements) file.
  * Create/update `./docs/code-standards.md` file.
  * Create/update `./docs/system-architecture.md` file.
  * **IMPORTANT:** Sacrifice grammar for the sake of concision when writing outputs.
  * Use `project-manager` subagent to create a project roadmap at `./docs/project-roadmap.md` file.
* **Under `explicit` or `inherited` advice mode**:
  * Remaining-work branch (registered finalization action): execute authorized documentation and roadmap writes under the registered action. Planned documentation, roadmap, and status deliverables are scoped into `authorized_paths` and captured in `baseline_paths` upfront (captured as absent if planned writable outputs).
  * Clean nochange branch (`correction: null`): skip documentation and roadmap writers entirely (no substantive finalization writes needed; no fake action).
* Subagents (`project-manager`, `docs-manager`) are advisory children reporting terminal artifacts and actual changed paths within parent-authorized paths; they receive strict ownership, writable path, protected path, and delta destination constraints, and never operate controller state or stage behind the parent. Prior sealed paths remain immutable, while current-run registered pre-seal writes within parent-authorized paths remain permitted. Never direct edits to sealed plans or metadata/roadmap after seal.

### Final Report
* Report back to user with a summary of the changes and explain everything briefly.
* **Under `off` advice mode**: explicitly preserve existing default-mode behavior: use `git-manager` subagent to create commits for the implemented changes (DO NOT push to remote repository; no controller state operations). For advice-controlled plans with prior historical advice phases, point output to `<plan-dir>/progress.md`.
* **IMPORTANT:** Sacrifice grammar for the sake of concision when writing reports.

### Onboarding

* **Under `off` advice mode**:
  * Instruct the user to get started with the project:
    * Help the user to configure the project step by step, ask 1 question at a time, wait for the user to answer before moving to the next question.
    * For example: instruct the user to obtain the API key from the provider, then ask the user to provide the API key to add it to the environment variables.
  * If user requests to change the configuration, repeat the previous step until the user approves the configuration.
* **Under `explicit` or `inherited` advice mode**, converge BOTH clean registered finalization and nochange paths at ONE finalization exit after required human approval:
  - Enforce writer barrier: all documentation/roadmap writes, Git commits, and onboarding configuration settle before recording final outcome.
  - Choose the ONE truthful outcome matching disposition:
    * If clean nochange branch (`correction: null`): skip substantive finalization writes (no fake action); record the ONE truthful no-change `resolved` outcome with `action_id: null`, `episode_id: null`, and `actual_changed_paths: []` per canonical schemas (`correction` is not an outcome field; validation status passed).
    * If remaining-work branch (registered finalization action): run declared validation across all finalized deliverables, then record the ONE truthful `state outcome` matching the registered finalization action, reporting all actual changed paths and declared validation status.
  - Complete ONCE: Seal the task run via `state complete`. The durable completion receipt is authoritative (controller abandonment sets `gate_status: completed` but is never successful completion; completion requires a matching resolved outcome). Complete exactly once; ensure no early seal, no fallthrough, no duplicate completion, no second disposition using consumed counsel, and no hidden extra review cycle or reinit.
  - After sealing, freeze all captured baseline paths: never mutate captured evidence, documentation, reports, or index after complete, and never prescribe copying DONE into captured files after sealing. Parent plan-owning completion writes mandatory immutable completion receipts outside the captured snapshot and updates the derived live overview `<plan-dir>/progress.md` (uncaptured, outside baseline; never captured or cited as evidence/authorized substantive paths; if already captured, cannot overwrite progress, surface blocker) per shared receipt rules in `.antigravity/workflows/plan-progress.md` if present; otherwise read `~/.gemini/config/workflows/plan-progress.md` (the published install). Preserved historical snapshot protection applies across runs even without `--advice`; prior sealed paths remain immutable, while current-run registered pre-seal writes within parent-authorized paths remain permitted. Never direct edits to sealed plans or metadata/roadmap after seal.
  - Emit readonly summary pointing to `<plan-dir>/progress.md` for advice-controlled plans or preserved snapshots. Normal default plans with no history do not require, read, or output nonexistent progress links. Do not execute Git commands or captured-file/selected-index mutations after seal; only bounded administrative receipt and progress publication outside baseline is permitted per `.antigravity/workflows/plan-progress.md` if present; otherwise read `~/.gemini/config/workflows/plan-progress.md` (the published install).
