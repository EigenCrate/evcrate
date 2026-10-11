---
name: snyk-cli
description: Verify Snyk CLI installation, manage operator-authorized setup and authentication, and execute scoped Snyk Open Source (SCA) and Snyk Code (SAST) scans producing immutable JSON, SARIF, or HTML evidence.
---

# Snyk CLI setup and scanning

Manage Snyk CLI verification, operator-authorized acquisition, secure authentication, and scoped vulnerability scanning. This skill executes `setup` and `scan` operations; dependency analysis, proposal review, and remediation belong to sibling skills.

## Load locally

Read the bundled reference in this execution context before executing:

- [CLI workflow reference](references/cli-workflow.md)

Read installed sibling [snyk-fix](../snyk-fix/SKILL.md) and [dependency-upgrade-review](../dependency-upgrade-review/SKILL.md) for dependency handoffs. Resolve links from this installed skill directory, not target cwd or authoring checkout. Explicitly read required references even if the host loads bodies; record actual loading/fallback, not common-folder native-discovery claims.

## Operations and execution boundary

- `setup`: Verify CLI presence, inspect version and help, perform operator-authorized installation or updates, coordinate interactive browser OAuth or non-interactive token injection, and bind organization/endpoint configuration. Setup can alter machine configuration (global tools, system PATH, configuration files) only when separately and explicitly authorized by the operator.
- `scan`: Execute bound Snyk Open Source (`snyk test`) or Snyk Code (`snyk code test`) scans against the designated target root. Scan operations may write approved artifacts (JSON, SARIF, HTML) into an authorized report directory, but must never mutate target dependencies, manifests, lockfiles, or source code.

Execution boundaries and authority:
- Host permissions, process isolation, network access, and single-writer ownership are supplied by the parent. Prompt text is not an operating system sandbox.
- Scanning commands may trigger code execution through package manager or build tool dependency resolution (e.g., npm/yarn/pnpm lifecycle hooks or build plugins). Execute only within authorized environments.
- Source transmission: Snyk Code may upload application source for analysis. Require explicit parent source-transmission authority distinct from SCA dependency-data transmission.
- Reporting boundary: `snyk monitor` or `--report` publish snapshots and create ongoing project monitors in the Snyk web UI. These actions are never implied by a scan request and require separate operator authorization.
- Secret safety: Never inspect/dump credentials or expose token values in argv, stdout/stderr, reports or tracing. No debug logs by default; diagnostics need separately authorized secure retention.

## Relationship to snyk-fix and Snyk Code analysis lane

- `setup` and `scan` belong to `snyk-cli`.
- Dependency `analyze`, `remediate`, and `approved-remediate` belong to `snyk-fix`.
- `snyk-cli` provides original scan evidence, scanner identity, and discovery limits to `snyk-fix`.
- Snyk Code (SAST) is a distinct static analysis lane: captures source locations (file, line, column), rule identifiers, and taint dataflows (source -> propagation -> sink). Snyk Code findings are strictly separated from dependency SCA findings and are NEVER routed to automated dependency remediation or automatic source code edits.

## Procedure

1. **Bind authority:** Setup binds exact permitted machine/credential-state actions; no target/report is required just to inspect/login. Scan binds canonical target, product, manager/workspaces, org/endpoint/policy, executable/cwd/argv, transmission and safe outputs.
2. **Execute setup (if requested):**
   - Check local CLI presence with `snyk --version` and `snyk --help`.
   - If missing or outdated, request operator authorization for a pinned installation method (npm global, standalone binary, or system package manager). Never execute silent `npx snyk@latest` downloads. Package commands remain installer-only.
   - For interactive authentication, coordinate browser OAuth handoff (`snyk auth` default >= 1.1293). Setup may run version/help checks and initiate the command to print the auth URL, but must NEVER automate browser credential entry or drive headless browsers; the human operator performs browser login directly.
   - For CI, operator-controlled secret injection supplies `SNYK_TOKEN`; an authorized boolean presence check reveals no value and does not prove successful authentication.
   - Bind explicit `--org=<ORG_ID>` and operator-approved regional/runtime configuration before authenticating; no guessed endpoint flags or persistent-default changes.
3. **Configure and execute scan:**
   - Bind scan type: SCA (`snyk test`) for open source dependencies, SAST (`snyk code test`) for application source code.
   - Select development dependency inclusion explicitly: JavaScript dev dependencies are excluded by default; confirm deployed `--dev` support/results per manager. Do not invent production-only flags.
   - Choose supported exact manifests or authorized workspace discovery. Bind any detection depth/exclusions explicitly; returned expected-project accounting, not flag presence, establishes coverage.
   - Route scan output to immutable files (`--json-file-output`, `--sarif-file-output`, or native `--html-file-output`). Keep distinct baseline and post-remediation artifact paths.
4. **Capture exit codes and project results:**
   - Capture exact exit code without suppression: distinguish `0` (clean / no findings) and `1` (vulnerabilities found, evidence captured) from `2` (execution error) and `3` (unsupported project).
   - Never chain commands with `&&` in ways that suppress results on exit 1, and never swallow failures with `|| true`.
   - Inspect `--all-projects` monorepo scans for per-project errors and omissions; record omitted projects as incomplete evidence.
5. **Reconcile artifacts and handle exceptions:**
   - Preserve original bytes and secure SHA-256 identities; inspect every expected project. `ok: false` may indicate findings rather than scan failure.
   - Version gate HTML generation: use native HTML output if CLI >= 1.1308 (verify via `snyk test --help`); for older CLIs, use operator-authorized `snyk-to-html` against JSON output.
   - Handle Snyk Code clean scan exception: `snyk code test` with zero findings may omit the JSON artifact; record the clean exit code 0 and stdout without fabricating synthetic artifacts.
   - Maintain immutability: never modify severity thresholds (`--severity-threshold`), ignore rules (`.snyk`), or exclusion patterns to conceal findings.
6. **Return:** Report setup/scan authority, actual commands and secret-safe outcomes, products/scope, artifacts/exits/coverage and precise next action. Pass dependency evidence to snyk-fix; retain Code source findings in their separate read-only analysis lane.

## Hard stops and claims

- Stop immediately if credentials, tokens, or debug logs would be exposed.
- Stop if unpinned/silent CLI downloads are requested without operator authorization.
- Stop if Snyk Code scan is requested without explicit source code transmission authority.
- Stop if exit 2 or exit 3 occurs; do not treat execution failures as clean scans.
- Stop if findings disappear due to policy/threshold drift rather than actual dependency remediation.
- These documents define a procedure, not deployed tool registration or live scan proof. Record actual qualification limits; do not claim operational support from authoring checks alone.
