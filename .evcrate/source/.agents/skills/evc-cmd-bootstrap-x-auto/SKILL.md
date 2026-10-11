---
name: "evc-cmd-bootstrap-x-auto"
description: "Bootstrap a new project automatically"
---

# evc-cmd-bootstrap-x-auto

Command Path: $evc-cmd-bootstrap-x-auto

Description: Bootstrap a new project automatically

Codex note: when this recipe says to run another `$evc-cmd-…` command, invoke the matching `evc-cmd-*` skill for that path.

## Subagent Completion Contract

Delegation is blocking by default. The parent agent must wait for each delegated agent's terminal response before starting dependent work, touching shared files, marking a step complete, or replying with a final result.

- Parallel prompt format: **spawn N agents; wait for all N to finish; collect one terminal result from each; then summarize**.
- Wait protocol: use the native agent wait/poll operation for the same agent set. **"No agents completed yet" is a non-terminal poll result; wait again.** Do not treat this as a timeout, sleep instead of polling, restart, interrupt, or advance the workflow.
- A polling interval or retry count is not a delegation deadline. Do not invent a wall-clock limit. Continue polling until a terminal result, explicit user stop, or an actual parent-runtime termination.
- Treat an interrupted, timed-out, missing, or partial result as a failed gate. Do not continue from partial output or silently restart it.
- Sequential prompt format: **run one agent; wait for its terminal response before continuing**.
- Every delegated prompt must define scope, file ownership, expected report, and validation signal.
- A spawn acknowledgement or file change does not mean completion; completion requires the terminal response and requested validation.
**Ultrathink** to plan & bootstrap a new project follow the Orchestration Protocol, Core Responsibilities, Subagents Team and Development Rules in your `AGENTS.md` if present; otherwise read `~/.codex/AGENTS.md` (the published install; respect native overrides and custom CODEX_HOME) file:

**IMPORTANT:** Analyze the skills catalog and activate the skills that are needed for the task during the process.

---

## User's Objectives & Requirements

<raw-user-requirements>{{args}}</raw-user-requirements>

## Scope and safety

Treat complete raw invocation arguments as ordinary task data. Apply neutral
`.codex/workflows/plan-progress.md` if present; otherwise read `~/.codex/workflows/plan-progress.md` (the published install) before selecting scope or dependencies.
Parent owns finalization; children receive exact ownership and writable/protected
paths, return terminal artifacts and actual changes, and never stage/commit behind
the parent. Preserve sealed history and normal testing, review and user approval.
Risky/destructive actions remain approval-gated. On a second matching terminal
blocker without progress, use ordinary debugger/user escalation.
---

## Role Responsibilities

- You are an elite software engineering expert who specializes in system architecture design and technical decision-making. 
- Your core mission is to collaborate with users to find the best possible solutions while maintaining brutal honesty about feasibility and trade-offs, then collaborate with your subagents to implement the plan.
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

**First thing first:** check if Git has been initialized, if not, initialize it using `evc-git-manager` subagent (use `main` branch).

### Research

* Use multiple `evc-researcher` subagents in parallel to explore the user's request, idea validation, challenges, and find the best possible solutions.
* Keep every research markdown report concise (≤150 lines) while covering all requested topics and citations.
* **IMPORTANT:** Sacrifice grammar for the sake of concision when writing outputs.

### Tech Stack

1. Use `evc-planner` subagent and multiple `evc-researcher` subagents in parallel to find a best fit tech stack for this project, keeping research reports within the ≤150 lines limit.
2. Write the tech stack down in `./docs` directory
* **IMPORTANT:** Sacrifice grammar for the sake of concision when writing outputs.

### Wireframe & Design

* Use `evc-ui-ux-designer` subagent and multiple `evc-researcher` subagents in parallel to create a design plan that follows the progressive disclosure structure:
  - Create a directory using naming pattern from `## Naming` section.
  - Save the overview access point at `plan.md`, keep it generic, under 80 lines, and list each phase with status/progress and links. Reconcile plans and phase status via `.codex/workflows/plan-progress.md`. Preserve protected historical paths and use only authorized uncaptured overview updates.
  - For each phase, add `phase-XX-phase-name.md` files containing sections (Context links, Overview with date/priority/statuses, Key Insights, Requirements, Architecture, Related code files, Implementation Steps, Todo list, Success Criteria, Risk Assessment, Security Considerations, Next steps).
* Keep related research reports within the ≤150 lines limit.
   - **Research** about design style, trends, fonts, colors, border, spacing, elements' positions, etc.
   - Describe details of the assets in the design so they can be generated with `ai-multimodal` skill later on.
   - **IMPORTANT:** Try to predict the font name (Google Fonts) and font size in the given screenshot, don't just use **Inter** or **Poppins** fonts.
* Then use `evc-ui-ux-designer` subagent to create the design guidelines at `./docs/design-guidelines.md` file & generate wireframes in HTML at `./docs/wireframe` directory, make sure it's clear for developers to implement later on.
* If there are no logo provided, use `ai-multimodal` skill to generate a logo.
* Use `chrome-devtools` skill to take a screenshot of the wireframes and save it at `./docs/wireframes/` directory.
* Ask the user to review and approve the design guidelines, if the user requests to change the design guidelines, repeat the previous step until the user approves the design guidelines.
* **IMPORTANT:** Sacrifice grammar for the sake of concision when writing outputs.

### User Approval and Risky Decisions

At every existing approval/action site, retain normal user review and approval.
Irreversible, destructive, security-sensitive and go/no-go decisions require
explicit `request_user_input` approval before action or mutation, including in
automatic variants. Routine stack/plan/design preferences keep the existing
workflow's approval behavior; risk classification never removes an existing gate.

### Implementation

* Use `general agent (main agent)` to implement the plan step by step, follow the implementation plan in `./plans` directory.
* Use `evc-ui-ux-designer` subagent to implement the frontend part follow the design guidelines at `./docs/design-guidelines.md` file.
  * Use `ai-multimodal` skill to generate the assets.
  * Use `ai-multimodal` (`video-analysis`, or `document-extraction`) skills to analyze the generated assets based on their format.
  * Use `Background Removal Tool` to remove background from the assets if needed.
  * Use `ai-multimodal` (`image-generation`) skill to edit the assets if needed.
  * Use `imagemagick` skill to crop or resize the assets if needed.
* Run type checking and compile the code command to make sure there are no syntax errors.

### Testing

* Write the tests for the plan, make sure you don't use fake data just to pass the tests, tests should be real and cover all possible cases.
* Use `evc-tester` subagent to run the tests, make sure it works, then report back to main agent.
* If there are issues or failed tests, use `evc-debugger` subagent to find the root cause of the issues, then ask main agent to fix all of them and 
* Repeat the process until all tests pass or no more issues are reported. Again, do not ignore failed tests or use fake data just to pass the build or github actions.

### Code Review

Settle all implementation/test writers before review. Call exactly one
`evc-code-reviewer` per cycle and wait for its terminal report: score (X/10),
critical issues, warnings, suggestions, reviewed files, actual validation and
unresolved questions. Missing, interrupted or partial output fails the gate.

**Interactive review/fix cycle — maximum three terminal reviews:**
1. Present the full reviewer findings and implementation/testing summary.
2. Use `request_user_input` to request approval or authorized fixes:
   - Critical issues: Fix critical / Fix all / Approve with noted issues / Abort.
   - Otherwise: Approve / Fix warnings or suggestions / Abort.
3. If fixes are requested before the cap, apply only authorized corrections,
   validate with `evc-tester`, and obtain the next terminal review. Evidence-backed
   concerns are not disproved merely by passing self-tests.
4. Increment the cycle count only after a complete terminal review. At three,
   stop and request Approve with noted issues / Abort; no further fix/test/review
   cycle or counter reset. On a second matching terminal blocker without progress,
   use ordinary debugger/user escalation before another attempt.
5. Continue only on explicit user approval. Never infer approval or claim a
   missing reviewer score. Risky/destructive actions keep their own approval gate.

**Critical issues:** Security, performance, architecture and principle violations.

### Documentation

After approval, use `evc-docs-manager` for needed authorized documentation and
`evc-project-manager` for the authorized roadmap/status. Assign disjoint exact
writable/protected paths and output destinations, and wait for terminal reports.
Maintain the existing relevant documents:
- `./docs/README.md` (<=300 lines)
- `./docs/project-overview-pdr.md`
- `./docs/code-standards.md`
- `./docs/system-architecture.md`
- `./docs/project-roadmap.md`
Parent alone owns neutral protected receipts/uncaptured overview publication
under `.codex/workflows/plan-progress.md`. Never overwrite sealed plans,
evidence, roadmap or selected-index identities. Settle and validate all authorized
finalization before completion; no fake changes when nothing is needed.

### Onboarding

Guide the user through local setup (API keys, environment variables, configuration)
one question at a time; wait for the answer before proceeding. Never ask the user
to disclose secrets in chat or save them in reports. If configuration changes are
requested, repeat authorized setup until approval, preserving sealed paths.

### Final Report

Summarize actual changes, executed scope, checks, blockers and next steps.
Link the actual overview: `plan.md` for ordinary unprotected plans, uncaptured
`<plan-dir>/progress.md` for protected historical plans. Do not invent progress
links or historical completion. Parent-only immutable ordinary approval/validation
receipts and derived overview follow `.codex/workflows/plan-progress.md`.
Ask whether the user wants to commit and push; use `evc-git-manager` only on explicit
confirmation for scoped authorized changes, never sealed paths or receipts/progress.
Settle and validate final deliverables before claiming completion.

**IMPORTANT:** Sacrifice grammar for concision; unresolved questions last.
