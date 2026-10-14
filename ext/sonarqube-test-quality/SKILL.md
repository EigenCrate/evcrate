---
name: sonarqube-test-quality
description: Triage and fix SonarQube findings; improve unit and integration tests across supported toolchains with project-approved scanner configurations; verify coverage metrics and quality gates; execute local scanner lifecycles or run full project scans through existing Jenkins push-triggered CI. Use for Sonar issues, test refactoring, coverage thresholds, or scan requests.
---

# SonarQube Test Quality

## Start

1. Resolve repository, branch/PR, scope, and outcome locally; ask only for missing inputs.
2. Read route below. Review, triage, and local fixes run in the requested existing checkout by default; preserve unrelated edits. Neither review/fix requests, dirty files, nor pre-existing worktree metadata opt in to worktree creation. Ordinary local fixes require neither Sonar authentication nor a remediation round budget N (a global maximum on entered fix rounds).
3. Only read [Worktree remediation](references/worktree-remediation.md) when the user explicitly requests an isolated worktree. Opt-in requires user-supplied branch and destination path; ask for missing values, never auto-generate them.
4. Fix root causes in scope; preserve behavior without rule suppression. Assess hotspots before resolving. Pause if uncommitted changes conflict with target files.
5. Verify in the selected execution checkout (active checkout by default, or isolated worktree if opted in); confirm intended tests ran. Report truthful execution evidence (source vs execution context, commands, results, remaining findings, blocked checks). Applicable required tests must execute and pass; zero-test or failed runs never prove completion unless a justified no-test applicability profile was preflight-approved.

## Choose a route

| Task | Read |
|---|---|
| Discover profile, inputs, and applicability | [Project discovery](references/project-discovery.md) |
| Execute ordered scanner lifecycles and recovery | [Local analysis](references/local-analysis.md) |
| Fetch issues, check gates, or query CLI | [CLI commands](references/sonar-cli-commands.md) |
| Read or convert findings/coverage into simple Markdown tables | [Report formats](references/report-formats.md) |
| Fix findings or record handoff | [Remediation](references/remediation-and-handoff.md) |
| Refactor tests or verify coverage | [Testing and coverage](references/testing-and-coverage.md) |
| Isolate workspace (explicit opt-in only) | [Worktree remediation](references/worktree-remediation.md) |
| Full project scan via Jenkins push-to-scan | [Full scan](references/full-scan-workflow.md) |
| Orchestrate bounded remediation cycles within global budget N | Load sibling `skills/cmd-sonar-remediate/SKILL.md` from the selected installed root (source: `commands/cmd-sonar-remediate/SKILL.md`) · [Remediation cycles policy](references/remediation-cycles.md) |

## Boundaries

- Before remote Sonar CLI reads, run `sonar auth status`; prompt for `sonar auth login` if unauthenticated. Ordinary local fixes from report files do not require Sonar login. Never request, expose, or store credentials.
- Discover active server statuses rather than assuming fixed status filters.
- Generic scans never authorize push or upload. Local scanner execution and uploads require explicit preflight upload authorization naming the target server, project key, and branch/PR. Explicit push-to-scan on an already-committed branch covers only that scan; separate fix branches or worktrees require separate authorization. Never implicitly commit, merge, or remove worktrees.
- If only external CI can perform scanning, stop local analysis and hand off to the Jenkins route; never auto-push code. (Iterative remediation round budgets apply only to approved local analysis lifecycles, not external CI pipelines).
- Queries, changed-file analysis, and hooks are not full scans. Coverage claims require clean-suite evidence, exact scope/metric, and requested threshold.
- For bounded multi-round remediation within global N, load sibling `skills/cmd-sonar-remediate/SKILL.md` from the selected installed root (source: `commands/cmd-sonar-remediate/SKILL.md`); halt if root cannot be resolved, never use cwd. Pass its absolute path to actors. Parent durably records/approves each C0/CK/F upload intent before dispatch and acknowledges task durability before polling/next target; interrupted intent without verified task provenance blocks, never resubmits. Ordinary single-pass fixes and external Jenkins retain independent routes without N or Sonar authentication for local edits.
- Maintain one private approved `<evidence-destination>/sonar-report.md` for report/remediation work, initialized once and updated by the parent only. Fetch all issue/hotspot pages and coverage; API JSON is transient, not a stored bundle. Merge by `(target, finding ID)`, preserving local progress and historical issues; keep local vs server status distinct. No separate checkpoint, YAML mirror, actor report, guidance report or file per cycle. Native tool logs/coverage/scanner scratch still belong to their tools. See [report formats](references/report-formats.md) and [cycle persistence](references/remediation-cycles.md#3-state-persistence-and-resume-protocol).