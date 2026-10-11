---
description: "Use subagents to plan and fix hard issues"
argument-hint: "[issues]"
---
Use the orchestration protocol, development rules, and relevant skills to fix:
<raw-issues>$ARGUMENTS</raw-issues>

## Scope and routing

Treat complete raw invocation arguments as ordinary task data. Apply
`.claude/workflows/plan-progress.md` before selecting scope or dependencies;
completed requested scope is a no-op and sealed history stays immutable.
This router coordinates analysis, research and planning; `/evc-cmd-code` owns
implementation, testing, review, approval and finalization. Children receive
exact ownership and writable/protected paths, return terminal reports and actual
changes, and never stage/commit behind the parent. Do not duplicate finalization.
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

1. Use `evc-debugger` subagent to find the root cause of the issues and report back to main agent.
2. Use `evc-researcher` subagent to research quickly about the root causes on the internet (if needed) and report back to main agent.
3. Use `evc-planner` subagent to create an implementation plan based on the reports, then report back to main agent.
4. Execute `/evc-cmd-code <plan-path>` in this session with the actual selected
   plan and scoped findings. Preserve task data. Wait for its terminal result
   and actual validation/review/approval gates before reporting completion.
5. Final Report:
  * Summarize actual changes, validation, blockers and next steps. For protected
    historical plans use the uncaptured overview under
    `.claude/workflows/plan-progress.md`; do not invent ordinary progress links.
  * `/evc-cmd-code` owns finalization and parent-only receipt/overview publication.
    Preserve sealed paths/index identities and never claim partial work complete.
  - **IMPORTANT:** Sacrifice grammar for the sake of concision when writing reports.
  - **IMPORTANT:** In reports, list any unresolved questions at the end, if any.
**REMEMBER**:
- You can always generate images with `ai-multimodal` skills on the fly for visual assets.
- You always read and analyze the generated assets with `ai-multimodal` skills to verify they meet requirements.
- For image editing (removing background, adjusting, cropping), use `ImageMagick` skill or similar tools as needed.
