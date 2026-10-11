---
name: sonarqube-test-quality
description: Triage and fix SonarQube findings; improve Java Maven/JUnit/Mockito tests; verify JaCoCo coverage and quality gates; run full project scans through existing Jenkins push-triggered CI. Use for Sonar issues, assertThrows warnings, coverage thresholds, or push-to-scan requests.
---

# SonarQube Test Quality

## Start

1. Resolve repository, branch/PR, scope, and outcome locally; ask only for missing inputs.
2. Read route below. Review, triage, and local fixes run in the requested existing checkout by default; preserve unrelated edits. Neither review/fix requests, dirty files, nor pre-existing worktree metadata opt in to worktree creation.
3. Only read [Worktree remediation](references/worktree-remediation.md) when the user explicitly requests an isolated worktree. Opt-in requires user-supplied branch and destination path; ask for missing values, never auto-generate them.
4. Fix root causes in scope; preserve behavior without rule suppression. Assess hotspots before resolving. Pause if uncommitted changes conflict with target files.
5. Verify in the selected execution checkout (active checkout by default, or isolated worktree if opted in); confirm intended tests ran. Report truthful execution evidence (source vs execution context, commands, results, remaining findings, blocked checks); failed or zero-test runs never prove completion.

## Choose a route

| Task | Read |
|---|---|
| Fetch issues, check gates, or scan locally | [CLI commands](references/sonar-cli-commands.md) |
| Review Markdown/JSON or convert reports | [Report formats](references/report-formats.md) |
| Fix findings or record handoff | [Remediation](references/remediation-and-handoff.md) |
| Refactor tests or verify coverage | [Testing and coverage](references/testing-and-coverage.md) |
| Isolate workspace (explicit opt-in only) | [Worktree remediation](references/worktree-remediation.md) |
| Full project scan via Jenkins push-to-scan | [Full scan](references/full-scan-workflow.md) |

## Boundaries

- Before Sonar CLI reads, run `sonar auth status`; prompt for `sonar auth login` if unauthenticated. Never request, expose, or store credentials.
- Generic scans never authorize push. Explicit push-to-scan on an already-committed branch covers only that scan; separate fix branches or worktrees require separate authorization. Never implicitly commit, merge, or remove worktrees.
- Queries, changed-file analysis, and hooks are not full scans. Coverage claims require clean-suite evidence, exact scope/metric, and requested threshold.