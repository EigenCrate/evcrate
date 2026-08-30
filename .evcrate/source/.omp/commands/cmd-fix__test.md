---
argument-hint: "[issues] [--advice]"
description: "⚡⚡ Run test suite and fix issues"
---


Analyze the skills catalog and activate the skills that are needed for the task during the process.

## Reported Issues:
<raw-issues>$ARGUMENTS</raw-issues>

## Canonical checkpoint routing

Named checkpoints use the `evcrate-advisor-checkpoint/v1` dispatcher block in
`.omp/evcrate/workflows/advisor-mentoring.md` if present; otherwise read `~/.omp/agent/evcrate/workflows/advisor-mentoring.md`; this command supplies bounded evidence
and does not duplicate route or adapter selection.

## Advice Mode

A final standalone `--advice` activates explicit review mentoring.
Before testing, read `.omp/evcrate/workflows/advisor-mentoring.md` if present; otherwise read `~/.omp/agent/evcrate/workflows/advisor-mentoring.md` and derive
`WORK_ARGUMENTS` plus explicit/default advice mode. Use `WORK_ARGUMENTS` as the
issues input and apply the shared default stuck-escalation contract.

## Workflow:
1. Use `tester` subagent to compile the code and fix all syntax errors if any.
2. Use `tester` subagent to run the tests and report back to main agent.
3. If there are issues or failed tests, use `debugger` subagent to find the root cause of the issues, then report back to main agent.
4. Use `planner` subagent to create an implementation plan based on the reports, then report back to main agent.
5. Use main agent to implement the plan step by step.
6. Use `tester` agent to test the fix and make sure it works, then report back to main agent.
7. Use `code-reviewer` subagent to review the code changes and wait for its terminal report. In explicit advice mode, immediately follow it with exactly one blocking `advisor` call at `review:<workflow-step>` using the bounded evidence, prior counsel, and owner disposition from the shared mentoring contract; do not fix, approve, or report findings before the advisor terminal result. Review/advisor cycle cap: at most three terminal reviewer/advisor cycles; at the cap, stop without another review/advisor call or cycle reset, then ask the user if issues remain.
8. If there are issues or failed tests, repeat from step 2.
9. After finishing, respond back to user with a summary of the changes and explain everything briefly, guide user to get started and suggest the next steps.

**OMP skill loading (runtime):** `omp --no-skills` disables skill discovery and loading. When that flag is active, do not claim automatic skill activation: read each required migrated `SKILL.md` directly with the read tool from `./.omp/skills/<skill-name>/SKILL.md`, falling back to `~/.omp/agent/skills/<skill-name>/SKILL.md`. If the native file is absent, consult `./.omp/evcrate/skill-map.json` or `~/.omp/agent/evcrate/skill-map.json`, then read the archived package under `./.omp/evcrate/skills/` (or the published `~/.omp/agent/evcrate/skills/` path), then follow the instructions. Without `--no-skills`, use OMP's normal skill discovery.
