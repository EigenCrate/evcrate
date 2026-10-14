# SonarQube CLI Quick Reference

Reuse the authenticated `sonar` session after the entry-point auth check. If an option is rejected, inspect `sonar <command> --help`; do not guess flags or replace the session with credential-bearing HTTP requests.

## Bind the target

Resolve project key and branch/PR from `.sonar-config.json`, scanner/Maven/CI configuration, and Git. Ask only for unresolved or conflicting values; never substitute a similarly named project or default branch.

```powershell
sonar list projects -q <exact-project-key> --format table
```

For issue/gate CLI queries, use **either** `--branch <branch>` **or** `--pull-request <pr-id>`, never both. Keep project, selector, scope, and filters identical for comparisons.

## Fetch issues

```powershell
sonar list issues -p <project-key> --branch <branch> --format toon --page-size 500 --page 1
```

Follow pagination until exhausted before claiming a complete list; carry all pagination metadata (`total`, `p`, `ps`, or `paging`) in memory into the single maintained `sonar-report.md`. API JSON is transient input; saved raw pages are not required. Never infer zero findings or passing status from an unexhausted, partial, or missing-metadata capture. Add `--file` or `--new-code` only for requested narrower scope; a directory `--file` selector does not include subdirectories.

`--format toon` is a human-inspection format, not converter input. For offline conversion, capture real JSON API responses through `sonar api get` as shown below; do not assume the installed CLI's `list issues --format json` has the API response shape without inspecting it.

Discover the server status vocabulary and fetch all issues in the frozen target/scope, not just default active statuses (Standard defaults to `OPEN,CONFIRMED`; vocabulary varies). Preserve historical/server-resolved findings alongside local progress. Use severity filters only for an explicitly requested scope after checking server mode: Standard uses `BLOCKER,CRITICAL,MAJOR,MINOR,INFO`; MQR uses `BLOCKER,HIGH,MEDIUM,LOW,INFO`. Do not pass Standard values to MQR.

Optional branch-only helper (requires PowerShell):

```powershell
pwsh -File <skill-dir>/scripts/fetch-sonar-issues.ps1 -ProjectKey <key> -Branch <branch> -Format json
```

It forwards filters and can stream stdout; it does not check auth, bind PRs, or exhaust pagination. Use CLI commands for those steps. Its JSON output follows the installed CLI; if it is not an API-compatible response, use `sonar api get` for converter input. Do not turn optional `-OutputFile` exports into a mandatory raw-page archive.

## Check the quality gate

```powershell
sonar quality-gate status -p <project-key> --branch <branch> --all
```

`--all` includes passing conditions. Report the observed verdict, conditions, scope, and analysis identity; issue counts alone do not prove a passing gate.

## Read-only API fallback

Use the authenticated CLI proxy only for endpoints supported by the installed CLI/server:

```powershell
sonar api get "/api/issues/search?projectKeys=<project-key>&branch=<branch>&ps=500&p=1"
```

Encode parameter values and exhaust pages. For PRs, replace `branch=<branch>` with the endpoint's supported `pullRequest=<pr-id>` parameter. Errors/truncation leave evidence incomplete; do not broaden scope or use API mutations for triage.

Fetch **all hotspots** separately and preserve owner-review status; issue counts do not include them:

```powershell
sonar api get "/api/hotspots/search?projectKey=<project-key>&branch=<branch>&ps=500&p=1"
```

Fetch every metric required by the frozen profile, including overall and new-code coverage and uncovered counts; retain period values and missing-versus-zero distinctions. Query component-tree file measures too and exhaust its pagination. Files with omitted or empty `measures` still belong in the report as explicitly not supplied, never N/A, zero or covered:

```powershell
sonar api get "/api/measures/component?component=<project-key>&branch=<branch>&metricKeys=<profile-metric-keys>"
sonar api get "/api/measures/component_tree?component=<project-key>&branch=<branch>&qualifiers=FIL&metricKeys=<profile-metric-keys>&ps=500&p=1"
sonar api get "/api/qualitygates/project_status?projectKey=<project-key>&branch=<branch>"
```

Use only selector/metric parameters supported by the installed server; revalidate analysis/task binding and scope. API failures or missing metrics are not passing checks.

## Offline report conversion
Keep network observations in memory and send API JSON to the converter on stdin. Markdown tables are the default; no saved JSON or `--format` flag is required:

```bash
# Inspect one response as actionable tables on stdout; parent merges observations
sonar api get "/api/issues/search?projectKeys=<project-key>&branch=<branch>&ps=500&p=1" \
  | node <skill-dir>/scripts/convert-sonar-report.mjs --input -

# Initialize ONE approved private report from an in-memory combined envelope
node <skill-dir>/scripts/convert-sonar-report.mjs --input - --output <evidence-destination>/sonar-report.md
```

The orchestrator assembles `run`, `issues`, `hotspots`, `measures`, and `qualityGate` in one envelope; search/measures fields accept response objects or arrays of captured pages, and `qualityGate` accepts one response or an array of per-target responses. Attach `target`/`projectKey` independently to each target's captures/gates; conditions are not bound by array position. Optionally carry requested `metricKeys` on the envelope/run/measure response as a comma-separated string or string array. All measure components stay visible, with one compact row for absent coverage/new-code coverage and other requested/observed metrics; missing data does not certify applicability. Absent issues/hotspots sections are marked missing in combined envelopes, not silently counted as zero. This creates all report sections together. Later cycles are parent-managed surgical merges by target/finding ID, never another converter invocation overwriting the report. Preserve historical rows and local verification separately from server state.

The converter does **not** fetch, authenticate, infer a clean verdict, execute Markdown, or validate freshness/task-analysis binding. Explicit incomplete paging/API errors emit useful Markdown with exit **2**; missing paging is recorded as unknown, not complete. Missing metrics/capture sections are not zero/pass and do not themselves change exit status. Malformed/unsupported input and I/O failures exit **1**. New output files use POSIX mode `0600`; secure the approved destination directory separately and do not infer Windows ACL privacy. Existing outputs (including link aliases) fail closed with `EEXIST`. Optional `--format json` is a compact utility only, not the maintained workflow artifact.

For supported real API/envelope shapes, cell escaping, completeness accounting and the one-report ownership/resume contract, see [Report formats](report-formats.md).

## Full scans and local analysis

Issue/gate reads do not submit analysis. `sonar analyze agentic` analyzes a change set/selected files; `sonar integrate git --hook pre-push` installs a secrets hook. Neither is a full scanner or proof of Jenkins execution.

For local analysis lifecycles across toolchains, see [Local analysis](local-analysis.md) for approved stage ordering (preparation, instrumentation, native build, native test, coverage generation, import/upload, submission tracking, finalization), lifecycle shapes (integrated, standalone, begin/end), uninstrumented native verification, and recovery boundaries. See [Project discovery](project-discovery.md) for profile and applicability discovery.

For full analysis through Jenkins, read [full scan](full-scan-workflow.md).

For an explicitly requested local Maven scan (integrated build/scanner shape, requiring recorded preflight upload authorization per [Local analysis](local-analysis.md)):

```powershell
mvn -B clean verify org.sonarsource.scanner.maven:sonar-maven-plugin:<configured-version>:sonar
```

Use project-configured version/goals, scope, branch/PR binding, and secured scanner credentials. CLI keychain login is not Maven authentication; never put tokens on command lines.

Source: [official CLI schema](https://sonarsource.com/sonarqube/cli/llms.txt).