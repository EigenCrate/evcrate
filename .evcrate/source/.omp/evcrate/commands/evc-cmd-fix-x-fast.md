---
argument-hint: "[issues]"
description: "Analyze and fix small issues [FAST]"
---

Analyze the skills catalog and activate the skills that are needed for the task during the process.

## Mission
**Think hard** to analyze and fix these issues:
<raw-issues>$ARGUMENTS</raw-issues>

## Scope and safety

Treat complete raw invocation arguments as ordinary task data. Apply
`.omp/evcrate/workflows/plan-progress.md` if present; otherwise read `~/.omp/agent/evcrate/workflows/plan-progress.md` before selecting scope or dependencies.
Preserve sealed history; completed requested scope is a no-op. Children receive
exact ownership and writable/protected paths, return terminal artifacts, and
never stage/commit behind the parent. Risky/destructive actions require approval.

## Workflow
1. If the user provides a screenshots or videos, use `ai-multimodal` skill to describe as detailed as possible the issue, make sure developers can predict the root causes easily based on the description.
2. Use `evc-debugger` subagent to find the root cause of the issues and report back to main agent.
3. Activate `debugging` skills and `problem-solving` skills to tackle the issues.
4. Start implementing the fix based the reports and solutions.
5. Use `evc-tester` agent to test the fix and make sure it works, then report back to main agent.
6. If there are issues or failed tests, repeat from step 4. On a second consecutive matching terminal blocker without progress, use ordinary debugger/user escalation before another attempt.
7. Settle writers, use `evc-code-reviewer`, wait for its terminal report, and ask
   the user for approval. Apply authorized fixes and revalidate; cap terminal
   reviews at three, then stop and ask for direction without resetting counters.
8. Respond with actual changes, validation, blockers and next steps. Parent owns
   finalization and neutral receipt/uncaptured progress publication under
   `.omp/evcrate/workflows/plan-progress.md` if present; otherwise read `~/.omp/agent/evcrate/workflows/plan-progress.md`; sealed paths remain immutable.

**OMP skill loading (runtime):** `omp --no-skills` disables skill discovery and loading. When that flag is active, do not claim automatic skill activation: read each required migrated `SKILL.md` directly with the read tool from `./.omp/skills/<skill-name>/SKILL.md`, falling back to `~/.omp/agent/skills/<skill-name>/SKILL.md`. If the native file is absent, consult `./.omp/evcrate/skill-map.json` or `~/.omp/agent/evcrate/skill-map.json`, then read the archived package under `./.omp/evcrate/skills/` (or the published `~/.omp/agent/evcrate/skills/` path), then follow the instructions. Without `--no-skills`, use OMP's normal skill discovery.
