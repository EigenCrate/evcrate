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
- For security hotspots, explain the relevant data flow and threat assumptions before marking the review resolved.
- Use small, valid synthetic fixtures. Do not use customer or production data.
- Keep test assertions meaningful. Prefer AssertJ extraction/chaining or JUnit `assertAll` for related assertions rather than brittle assertion noise.

## Result record

For each coherent batch, record truthful execution evidence reflecting the active execution model:

```text
Date:
Execution checkout / mode: [Default checkout | Optional worktree]
Repository root / branch / SHA:
Sonar project / branch / PR selector:
Fix worktree path / branch / base SHA: [if worktree opted in; omit if default checkout]
Findings and root causes:
Changed files (in execution checkout):
Focused command and result (tests executed / failures):
Clean-suite command and result:
Fresh coverage report and included scope:
Quality-gate / issue-query result:
Blocked or unverified checks:
Follow-up:
```

## Handoff and cleanup boundaries

- Do not implicitly commit, merge into the source branch, or assign upstream tracking (`git push -u`).
- Source branch push-to-scan authorizations never transfer to a separate fix branch or worktree; pushing requires explicit user authorization naming the target remote and branch.
- When an optional worktree is used, retain it for user review. Safe cleanup requires explicit user authorization after delivery; never use `git worktree remove --force`.
- Do not include secrets, tokens, customer data, or raw credential-bearing output. A failed or unavailable remote check is not evidence that no issues remain. Update a project handoff file only when one exists or the user requests durable tracking; otherwise summarize in the response.