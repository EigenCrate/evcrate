# SonarQube Test Quality

Portable SonarQube triage, Java test-quality, JaCoCo coverage, and offline reporting skill. The self-contained bundle installs directly into `.agents/skills/sonarqube-test-quality` and/or `.claude/skills/sonarqube-test-quality` along with the companion `cmd-sonar-remediate` command skill under a specified project directory using explicit `--target agents|claude|both`. Pre-existing user installations in other directories are not uninstalled.

## Runtime Requirements

- **Node.js 18.11.0 or newer (required)**: Runs the portable installer (`bin/install.js`) and the standalone offline report converter (`scripts/convert-sonar-report.mjs`). Both are dependency-free, pure ESM scripts requiring no external npm packages or network access.
- **PowerShell / `pwsh` (optional)**: Only needed if running legacy PowerShell helper scripts (`scripts/fetch-sonar-issues.ps1` and `scripts/calculate-jacoco-coverage.ps1`). Core triage, Sonar CLI execution, report conversion, and isolated worktree remediation do not require PowerShell.

## Install

Preview the installation before writing files:

```bash
node bin/install.js --help
node bin/install.js --target agents --directory /path/to/project --dry-run
node bin/install.js --target claude --directory /path/to/project
node bin/install.js --target both --directory /path/to/project
```

The installer requires explicit `--target agents|claude|both` and `--directory`. It installs 17 payload files per selected root, including two skill entrypoints (`skills/sonarqube-test-quality/SKILL.md` and `skills/cmd-sonar-remediate/SKILL.md`); 34 files for `both`. Unselected roots and native host settings are untouched; existing user installations and unrelated files are preserved.

### Installer Safety

- `--dry-run` previews file changes without modifying disk state or acquiring locks.
- Changed destination files fail closed; replacement requires `--force` plus `--yes` (unattended / API) or `--force` with interactive confirmation.
- Exclusive lock hierarchy: acquires project `<project>/.sonarqube-test-quality.install.lock`, then legacy `<project>/.agents/skills/sonarqube-test-quality/.install.lock` whenever agents is selected. Pre-existing locks block without stale auto-deletion; partial acquisition failure releases owned locks in reverse order.
- Path and symlink guards: source files/ancestors and destination files/ancestors are validated against symlinks, non-directory ancestors, and root escape. Symlink and type violations block the entire plan and cannot be overridden by `--force`.
- Staging and caught-failure rollback: staged beside destinations on the same volume; on caught failure during publication, replacement backups are restored, created addition files are removed, and only transaction-owned empty directories are pruned. Any restoration conflicts or failures are reported as partial rollback detailing affected paths (without claims of process-crash recovery or simultaneous atomic reader visibility).
- Unrelated files, concurrent user edits, and pre-existing directories are preserved; no harness configurations or native host settings are modified.

Run focused installer tests with `npm test` from this package directory.

## Core Workflows

### 1. One Markdown Report for Every Cycle

Maintain one private `<evidence-destination>/sonar-report.md`, readable by humans and AI agents. Sonar API JSON is transient input, not another saved report. No raw-page archive, `resume-checkpoint.json`, YAML mirror, actor report, separate guidance report, or file per cycle.

| Section | Contents |
|---|---|
| Run / resume | Budget, stage, source identity, frozen target context, approvals and pending tasks |
| Issues and hotspots | `Issue`, `File`, `Detail`, `Local status`, `Server status`, `Next action` |
| Coverage summary and checks | Target/file, metric, value, requirement, status/next action (cycle/analysis-tagged append) |
| Coverage work items | Target/file, uncovered lines/branches, detail with stable ID/gap, test to add, local status, server verification |
| Cycle history | Cycle, target, checkpoint, task/analysis/gate, completeness/consistency, result |
| Blockers / next action | Missing evidence, failed checks and owner decisions |

Initialize the report from the [report template](templates/remediation-cycle-report.md), or render a complete in-memory API envelope:

```bash
node scripts/convert-sonar-report.mjs --input - --output /private/run/sonar-report.md
```

Markdown is the default. The converter supports issue/hotspot searches, project/file measures, overall/new-code metrics, and multi-target quality gate arrays; [supported envelope fields](references/report-formats.md#combined-in-memory-envelope) combine them in one output. `--input <file>` still accepts existing exports.

- **Single writer:** The orchestrator merges evidence into existing rows by target/finding ID, retaining local progress, historical issues and owner reviews. Evidence actors return observations inline.
- **Coverage append & history tags:** Coverage summary and checks rows are tagged with cycle and analysis ID (or not-yet-bound) and appended rather than overwritten, preserving baseline and prior-round observations. Coverage work items merge by target and stable parent-assigned ID, retaining local progress and test-addition evidence; line moves do not break identity, passing tests do not prove coverage, and server aggregate metrics do not certify individual branch tasks without fresh matching granular evidence.
- **Less repeated work:** Persist budget before edits and `correction_used=true` before correction edits. Persist a minimal in-flight intent (`dispatching/no-task-ID`, stage, target, pre-scan SHA/digests, time bounds) before upload dispatch, and verified task IDs immediately after upload before polling or the next target; batch other updates per stage result. All live in the same report. Never regenerate unchanged evidence for each child or poll.
- **Safe initialization:** When creating a new report with the converter (`--output`), it writes exclusively with mode `0600` on POSIX and the `wx` flag, refusing to overwrite an existing report. The parent workflow must approve and secure the destination directory (`0700` recommended); POSIX mode does not set Windows ACLs, and manual template copies or subsequent orchestrator updates do not inherit converter flags automatically. Subsequent cycles use surgical parent updates, not blind conversion.
- **Resume & recovery:** Resume revalidates actual source and context. An existing in-flight intent without a task ID requires verified native scanner task and invocation provenance; missing or ambiguous provenance blocks as `submission-unverified` and prohibits resubmission.
- **Truthful evidence:** Partial/errors render useful rows with CLI exit 2; malformed/unsupported input exits 1. Missing paging is unknown, not proof of completeness. Converted and maintained Markdown views are evidence, not automatic verdict engines; exit 0 does not certify success.
- **Data-only boundary:** Messages and paths are untrusted data. Escaped table cells prevent syntax breakout, not model immunity.
- **Native outputs remain native:** Builds and scanners still produce logs, coverage files and scratch directories. These are not duplicate maintained skill reports.
### 2. Workspace Remediation & Optional Worktree Isolation

- **Default existing checkout**: Issue triage, test execution, and code remediation default to the current active workspace checkout. Uncommitted work on unrelated files is preserved; if an uncommitted edit conflicts with files requiring remediation, pause and request user guidance.
- **Opt-in worktree execution**: Worktree isolation is strictly optional and only triggered by explicit user request. A request to review or fix code, dirty working tree state, or existing worktree metadata does not imply worktree creation.
- **User-supplied branch and path required**: When worktree isolation is requested, the user must provide both the exact target branch name and destination directory path. The agent never auto-generates branch names, random suffixes, or sibling directory paths. If either input is missing, the agent stops and prompts for the missing values.
- **Strict validation and isolation**: Once both inputs are supplied, the worktree is validated (preventing collisions and nesting inside the active repository) and created at the exact specified path from the source HEAD commit:
```bash
git worktree add -b "$FIX_BRANCH" "$FIX_PATH" "$SOURCE_SHA"
cd "$FIX_PATH"
```
- **Confinement and authorization**: When a worktree is active, all edits, builds, and test runs are strictly confined to that worktree so build outputs never pollute the source checkout. Push authorization granted for a feature branch never transfers to a remediation branch; pushing requires explicit user approval naming the exact remote and branch.
- For complete parameter guards, validation steps, and decision rules, see [Worktree remediation](references/worktree-remediation.md).

### 3. Server-Side Scans & Jenkins CI

For full server scans, the skill can leverage an existing Jenkins push-triggered pipeline. It checks branch eligibility, upstream binding, and project configuration before pushing, verifying that Jenkins and Sonar analysis match the pushed commit without manually triggering Jenkins.

## Documentation Structure

`SKILL.md` routes tasks dynamically across **ten** modular reference documents and companion command entrypoint:

1. [CLI commands](references/sonar-cli-commands.md) — SonarQube CLI session authentication, target binding, issue queries, quality gate checks, and offline conversion integration.
2. [Project discovery](references/project-discovery.md) — Profile and applicability discovery order, safe actual-input identity, two-factor report freshness, and requirement vs observation contracts.
3. [Local analysis](references/local-analysis.md) — Ordered 8-stage scanner lifecycle sequence, three universal lifecycle shapes, native semantic parity, and clean abort recovery.
4. [Report formats](references/report-formats.md) — Default Markdown tables, combined API envelope, paging/error boundaries and safe one-file initialization.
5. [Worktree remediation](references/worktree-remediation.md) — Optional worktree opt-in protocol, user-supplied branch and path validation, source state preservation, and authorization boundaries.
6. [Remediation cycles](references/remediation-cycles.md) — Global budget accounting, independent verification, single-report resume and final qualification.
7. [Run guidance](references/run-guidance.md) — Private-report boundaries and optional useful inline recovery notes; no separate guidance artifact.
8. [Testing and coverage](references/testing-and-coverage.md) — JUnit/Mockito test refactoring (`assertThrows` isolation) and aggregate JaCoCo coverage verification.
9. [Remediation and handoff](references/remediation-and-handoff.md) — Triage priorities, MQR vs Standard severity handling, hotspot review, and handoff records.
10. [Full scan](references/full-scan-workflow.md) — Jenkins push-to-scan eligibility checks, commit-to-analysis verification, and push authorization constraints.

Companion command skill prompt:
- [Bounded remediation command](commands/cmd-sonar-remediate/SKILL.md) — 17-stage orchestrator prompt sequencing independent host subagents within global budget $N$.
## Skill Evaluation

`evals/evals.json` contains **64** behavioral instruction scenarios covering the full remediation cycle lifecycle:
- Local JUnit refactoring and coverage boundaries in default checkout (Scenarios 1, 2, 8, 10).
- Authentication, CLI binding, and MQR severity handling (Scenarios 3, 4, 5, 9).
- Jenkins push-to-scan triggers and authorization validation (Scenarios 6, 7).
- Compact report completeness, paging, error and untrusted-data scenarios (Scenarios 11, 12).
- Active dirty task preservation and worktree opt-in validation (Scenarios 13–18).
- Dual-root transactional installation: explicit `--target agents`, `--target claude`, `--target both`, and invalid target rejection (Scenarios 19–22).
- Four scanner lifecycle shapes: build-integrated, standalone-after-native, prep/build/end, and multi-target (Scenarios 23–26).
- Mandatory Stage F final submission and committed-input verification (Scenario 27).
- Round budget $N$ boundaries: omitted $N$, invalid $N$, $N=1$ failure, task resume without budget increment, and no post-budget edits (Scenarios 28–31, 35, 60).
- Single correction batch limit per round and second correction prohibition (Scenarios 32, 33).
- Loop recovery boundaries: two-round no-progress halt and all-target conjunction (Scenarios 34, 36).
- Applicability and metric validation: 0 tests rejected, justified no-test profile, unsupported coverage, stale reports, and metric aggregation (Scenarios 37–42).
- Authority and security refusals: declined upload/commit, auth gap, role independence, unapproved scripts, TLS bypass refusal, and bounded actor (Scenarios 43–50, 62).
- Evidence integrity: mutually exclusive branch/PR, background task failure, partial paging, consistency unknown, profile change rebaseline, input drift, disappearing findings, pending hotspots, serial scans, and hostile instruction neutralization (Scenarios 51–59, 61, 63, 64).

## Verification Status & Qualification Boundaries

### Verified Offline Capabilities
- **Package tests:** 70/70 converter, installer and catalog-structure tests passed on Linux x64, Node 24.16.0, including coverage work-item association, independent local/server states, malformed inputs and unknown gap locations. Source-wording checks and copied mock state-machine simulations were removed; they never qualified consuming-agent workflow behavior.
- **Packed runtime smoke:** Unpacked package installation from unrelated CWD delivered 17 assets per root, 34 for `both` (22 packaged files in release tarball); repeat installation was a no-op. Installed converter created exactly one report, preserved existing output on refusal, rendered partial captures with exit 2, and escaped hostile table text.
- **Evaluation catalog:** 64 authored instruction scenarios remain for consuming-host evaluation. Structural validation is not execution of those scenarios.

### Operational & Runtime Boundaries
- **Historical report lessons**: Supplied historical metrics (56 tests, 46.48% line coverage, 63.91% branch coverage; focused change unanalyzed) inform policy (auth separation, exact task/analysis binding, full paging, CI trigger verification, active TLS) but provide zero runtime qualification for current checkouts. Corporate URLs, project keys, thresholds, shells, and private links are never used as defaults.
- **Consuming host execution boundary**: Node.js and Linux installer execution is verified, but live consuming-host LLM runtime discovery and independent-child prompt execution are **unexercised** in offline build/test environments.
- **Dual-root discovery ambiguity**: Installing both roots creates duplicate skill entrypoints (`cmd-sonar-remediate` and `sonarqube-test-quality` in both `.agents` and `.claude`). Consuming hosts must use supported explicit target selection; unassisted discovery across both directories simultaneously is ambiguous and runtime-unqualified.
- **No atomic reader visibility or crash recovery**: In-process rollback restores backups on caught exceptions; it does not claim atomic simultaneous reader visibility or process-crash recovery.
- **No automatic commits, pushes, or settings mutation**: Remediation never auto-commits, auto-pushes, or modifies host/IDE configurations.

### Consumer Server-Success Criteria
Offline extension acceptance does not equal consumer server-verified remediation. Actual server-success requires:
1. Approved final submission on committed intended inputs plus reproducible generated inputs (no uncommitted edits in analyzed scope).
2. Execution of the complete ordered scanner lifecycle for every target.
3. Exact CE task completion (`SUCCESS`), `analysisId` resolution, and quality gate pass on that exact analysis.
4. Full consistent findings with zero active issues, target coverage meeting configured conditions, and all Security Hotspots reviewed/cleared by the human owner.
5. All applicable passing repository checks and certification by an independent final auditor. Gate-only, early-round, partial, synthetic, or historical results cannot qualify server-success.
