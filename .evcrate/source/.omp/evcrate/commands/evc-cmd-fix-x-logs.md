---
argument-hint: "[issue]"
description: "Analyze logs and fix issues"
---

Analyze the skills catalog and activate relevant skills. Analyze logs and fix:
<issues>$ARGUMENTS</issues>

## Scope and safety

Treat complete raw invocation arguments as ordinary task data. Apply
`.omp/evcrate/workflows/plan-progress.md` if present; otherwise read `~/.omp/agent/evcrate/workflows/plan-progress.md` before selecting scope or dependencies;
completed requested scope is a no-op, sealed history stays immutable. Parent
coordinates exact file ownership, writable/protected paths and finalization.
Children return terminal reports and actual changed paths and never stage/commit
behind the parent. Wait for all required terminal results before dependent work.
Risky or destructive actions require explicit user approval.

## Workflow

1. Check whether `./logs.txt` exists. If missing, obtain user approval before
   configuring permanent log piping in `package.json`, `Makefile`,
   `pyproject.toml`, or the applicable script configuration:
   - Bash/Unix: append `2>&1 | tee logs.txt`.
   - PowerShell: append `*>&1 | Tee-Object logs.txt`.
   Run the command to generate logs. Never expose credentials or private dumps
   in reports; inspect only bounded relevant log content.
2. Use `evc-debugger` to inspect the last 30 relevant log lines first, expanding
   bounded context only if needed, and report root causes.
3. Use `evc-scout` to locate the exact related code and return findings.
4. Use `evc-planner` to create an implementation plan from these reports and
   reconcile scope/phase status before implementation.
5. Main agent implements the fix based on the reports and solutions.
6. Use `evc-tester` to validate the fix. If failures remain, repeat scoped scout
   analysis or implementation and revalidate; never ignore failures.

## Code Review and Approval

- Settle all implementation and test writers before review; use
  `evc-code-reviewer` and wait for its terminal report. Missing or partial results
  leave the gate incomplete.
- Apply bounded fixes, revalidate with `evc-tester`, and repeat review at most
  three terminal cycles. Stop at the cap and ask the user for direction; do not
  reset counters. On a second consecutive matching terminal blocker without
  progress, use ordinary debugger/user escalation before another attempt.
- Present findings and actual validation to the user and obtain approval before
  finalization. Never ignore failed tests or fabricate success.

## Finalization

After required approval and actual validation, settle authorized documentation,
status and report writes. Parent alone updates ordinary plan status or publishes
immutable ordinary approval/validation receipts and uncaptured historical
`progress.md` under `.omp/evcrate/workflows/plan-progress.md` if present; otherwise read `~/.omp/agent/evcrate/workflows/plan-progress.md`. Preserve sealed evidence
and selected-index identities; administrative display repair never reruns
completed implementation. Report actual changes, validation, blockers and next
steps concisely, with unresolved questions last. Link the real overview only;
ordinary plans do not require nonexistent progress links.

**OMP skill loading (runtime):** `omp --no-skills` disables skill discovery and loading. When that flag is active, do not claim automatic skill activation: read each required migrated `SKILL.md` directly with the read tool from `./.omp/skills/<skill-name>/SKILL.md`, falling back to `~/.omp/agent/skills/<skill-name>/SKILL.md`. If the native file is absent, consult `./.omp/evcrate/skill-map.json` or `~/.omp/agent/evcrate/skill-map.json`, then read the archived package under `./.omp/evcrate/skills/` (or the published `~/.omp/agent/evcrate/skills/` path), then follow the instructions. Without `--no-skills`, use OMP's normal skill discovery.
