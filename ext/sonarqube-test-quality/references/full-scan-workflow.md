# Full SonarQube Scan Through Jenkins

Follow this route for full analysis through existing Jenkins push-triggered CI. Default analysis runs directly from the requested, already-committed checkout; worktree creation is optional and opt-in only. Do not manually start Jenkins, modify its configuration, or substitute changed-file analysis.

## 1. Bind repository and push range

Run from the requested repository checkout (or verified fix worktree if opted in; PowerShell examples):

```powershell
$repoRoot = git rev-parse --show-toplevel
$branch = git branch --show-current
$head = git rev-parse HEAD
git status --short --branch
$upstream = git rev-parse --abbrev-ref --symbolic-full-name '@{upstream}'
git log --oneline '<upstream>..HEAD'
git diff --stat '<upstream>..HEAD'
```

Stop for unavailable Git, wrong repository, detached HEAD, missing upstream, dirty worktree (including untracked files), or empty push range. Do not stage/commit implicitly.

When working from an optional remediation worktree (see [Worktree remediation](worktree-remediation.md)), source branch push authorizations do not transfer to the worktree branch. Require separate, explicit destination authorization. Never assign upstream tracking automatically (`git push -u`), merge back into the source branch, or stage/commit implicitly.

Split the upstream into remote/branch; require the current branch unless a different destination is explicitly identified and approved. Resolve `git remote get-url --push <remote>` privately. Record remote, sanitized host/repository path, branch, HEAD, and every outgoing commit; never expose a credential-bearing URL.

## 2. Prove project scope and automatic trigger

Verify all of these before pushing:

- **Project:** resolve one exact key from `.sonar-config.json`, `sonar-project.properties`, Maven, or Jenkins configuration. Follow the entry-point auth check before `sonar list projects`; confirm that key, never a similar name. Ask on conflicting or ambiguous configuration.
- **Trigger:** inspect the tracked `Jenkinsfile` and Jenkins Branch Source/job settings. Prove the job uses this repository, includes this branch, and has an SCM push webhook or configured SCM polling. A Jenkinsfile alone is insufficient; unverifiable triggers block the push.
- **Full scope:** prove the pipeline executes full configured project analysis. Check modules, source/test roots, exclusions, `scanAll`, and skipped/narrowed scanner stages against the request. Full scope is the configured Sonar project, not necessarily every Git file.
- **Branch identity:** confirm edition support and Branch Source/scanner binding to the exact branch (`sonar.branch.name` where needed). Missing context can overwrite Sonar's main branch, which may differ from Git's default. For PR analysis bind PR ID, source, and base; use PR selectors, not ordinary branch queries.

Report missing configuration; do not change Jenkinsfiles, jobs, webhooks, filters, or Sonar settings without separate authorization.

## 3. Push the exact verified ref

An explicit Jenkins push-to-scan request authorizes this push once target/range/checks are unambiguous; no redundant confirmation. A generic scan request does not. Source branch authorizations never transfer to an optional worktree fix branch (see [Worktree remediation](worktree-remediation.md)). Ask if target, branch, or outgoing range is unclear.

```powershell
git push --dry-run <remote> 'HEAD:refs/heads/<verified-branch>'
git push <remote> 'HEAD:refs/heads/<verified-branch>'
```

Run the real push only after a successful dry run with exactly the intended ref. Stop on non-fast-forward or unexpected targets. Never switch branches, fall back to main, force-push, or use `--all`/`--mirror`.

## 4. Match build and analysis to the push

Locate the resulting Jenkins run; match job, branch, checked-out SHA, and result to the recorded push. Wait for analysis and gate stages (`withSonarQubeEnv` / `waitForQualityGate` when configured). A missing run, failed pipeline, or absent gate stage is not completion.

Then follow [CLI commands](sonar-cli-commands.md) for the exact project/branch or PR; retrieve gate conditions and in-scope issues. Match analysis timestamp and revision/task identity to the pushed SHA. If identity is unavailable, report unverified; if older, report stale. Do not attribute either to this push.

Jenkins supplies secured scanner credentials; Sonar CLI login does not authenticate Maven. Never request or print either credential.

For an explicitly requested **local Maven scan**, follow the local-scan section in [CLI commands](sonar-cli-commands.md), not this push workflow. Issue/gate reads, `sonar analyze agentic`, and `sonar integrate git --hook pre-push` do not submit full project analysis.

Sources: [branch analysis](https://docs.sonarsource.com/sonarqube-server/analyzing-source-code/setting-up-the-branch-analysis), [PR analysis](https://docs.sonarsource.com/sonarqube-server/analyzing-source-code/setting-up-the-pull-request-analysis), [Maven scanner](https://docs.sonarsource.com/sonarqube-server/analyzing-source-code/scanners/sonarscanner-for-maven/), [Jenkins Multibranch](https://www.jenkins.io/doc/book/pipeline/multibranch/), [Jenkins Sonar steps](https://www.jenkins.io/doc/pipeline/steps/sonar/).