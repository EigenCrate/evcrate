---
description: "Use subagents to plan and fix hard issues"
argument-hint: "[issues] [--advice]"
---
Use the orchestration protocol, development rules, and relevant skills to fix:
<raw-issues>$ARGUMENTS</raw-issues>

## Canonical checkpoint routing

Named checkpoints use the canonical `evcrate-advisor-checkpoint/v2` dispatcher block in
`.claude/workflows/advisor-mentoring.md`; this command supplies bounded evidence
and does not duplicate route or adapter selection.

## Advice Mode

A final standalone `--advice` activates explicit review mentoring.
Before analysis, read `.claude/workflows/advisor-mentoring.md` and derive
`WORK_ARGUMENTS` plus explicit/default advice mode from the raw arguments. Use
`WORK_ARGUMENTS` as the issue input and apply the shared default stuck-escalation
contract throughout this command.

In explicit advice mode, wait until the required terminal reviewer or test
evidence exists. Before displaying findings, fixing issues, or requesting approval,
enter the canonical checkpoint dispatcher at `review:hard-fix` with bounded evidence,
prior counsel, and owner disposition (`accept`, `reject-with-evidence`, `need-evidence`,
or `reconcile`). Wait for its terminal result and include its must-fix guidance in the
findings. All resulting dispositions, bounded corrections, and outcomes use the shared
task-state lifecycle (`state disposition` -> `state outcome` -> `state complete`).
Review/advisor cycle cap: at most three terminal reviewer/advisor cycles; at the cap,
stop without another review/advisor call or cycle reset, then ask the user if issues remain.
If durable correction exhaustion occurs (`correction_count === 3`), the state transitions to
`needs_human` and requires an interactive terminal authorization; conversational approval
cannot forge completion.
## Workflow:

If the user provides a screenshots or videos, use `ai-multimodal` skill to describe as detailed as possible the issue, make sure developers can predict the root causes easily based on the description.

### Fullfill the request
**Question Everything**: Use `AskUserQuestion` tool to ask probing questions to fully understand the user's request, constraints, and true objectives. Don't assume - clarify until you're 100% certain.

* If you have any questions, use `AskUserQuestion` tool to ask the user to clarify them.
* Ask 1 question at a time, wait for the user to answer before moving to the next question.
* If you don't have any questions, start the next step.

### Fix the issue

Use `sequential-thinking` skill to break complex problems into sequential thought steps.
Use `problem-solving` skills to tackle the issues.
Analyze the skills catalog and activate other skills that are needed for the task during the process.

1. Use `debugger` subagent to find the root cause of the issues and report back to main agent.
2. Use `researcher` subagent to research quickly about the root causes on the internet (if needed) and report back to main agent.
3. Use `planner` subagent to create an implementation plan based on the reports, then report back to main agent.
4. Then use `/code` SlashCommand to implement the plan step by step. This fallback
   handoff uses `WORK_ARGUMENTS`; append exactly one trailing `--advice` in explicit
   mode and otherwise pass no `--advice` token.
5. Final Report:
  * Report back to user with a summary of the changes and explain everything briefly, guide user to get started and suggest the next steps.
  * Ask the user if they want to commit and push to git repository, if yes, use `git-manager` subagent to commit and push to git repository.
  - **IMPORTANT:** Sacrifice grammar for the sake of concision when writing reports.
  - **IMPORTANT:** In reports, list any unresolved questions at the end, if any.

**REMEMBER**:
- You can always generate images with `ai-multimodal` skills on the fly for visual assets.
- You always read and analyze the generated assets with `ai-multimodal` skills to verify they meet requirements.
- For image editing (removing background, adjusting, cropping), use `ImageMagick` skill or similar tools as needed.
