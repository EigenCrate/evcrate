# Verification, results, and rollback reference

Bind actual execution evidence, determine truthful finding dimensions and overall statuses, and enforce selective rollback. Do not infer execution from planned commands or report assertions.

## Command evidence: planned versus executed

Executed commands require explicit parent authorization, host permissions, trusted execution boundary, network/registry authorization, and single-writer identity. Planned commands must never be recorded as executed. For every executed command, record:

| Field | Required value / evidence |
|---|---|
| Command identity / stage | `baseline-graph`, `owner-graph`, `build-test`, `runtime-probe`, `baseline-scan`, or `post-scan`; unique trace identifier. |
| Command & invocation | Exact executable, arguments, cwd/target root, flags, modules, profiles, and scan scope/policy. Redact secrets without claiming full reproducibility. |
| Authorization & boundary | Parent command approval, host permission, trusted boundary, network/registry permissions, and single-writer operator identity. |
| Execution result | Observed start/finish, exit code, stdout/stderr/artifact locator, exact-byte SHA-256 hash, per-module/project errors, and omissions. |
| Interpretation | Affirmative proof versus limitations; never infer results from planned commands or missing outputs. |

### Verification execution rules

- **Baseline before edits:** Retain current effective/resolved graph, relevant consumer observations and matching-scope baseline scan. Record missing evidence before any change; do not destroy the baseline then infer presence from an old report.
- **Resolved graph:** Use the bound [Maven procedure](maven-spring-remediation.md) per affected module/profile. Inspect effective POM/import/pin evidence and verbose resolved winners, retaining full module output; a tree alone does not identify every management source.
- **Target build and tests:** Run exact target-approved verification and inspect executed/skipped tests. Green builds alone do not establish remediation.
- **Concrete runtime behavior:** Probes must exercise affected consumers (logging formats/levels, crypto ciphers/providers, serialization paths), not merely process startup or absence of fatal exceptions.
- **Snyk scanner invocation:**
  - Use the bound Maven-reference argv template with actual authorized scope/options, distinct private baseline/post output paths and captured Maven arguments. Templates are planned, never executed facts.
  - For Maven aggregate projects: use `--maven-aggregate-project` instead of `--all-projects`; never combine both.
  - Option restrictions: `--show-vulnerable-paths=all` is unsupported with `--json-file-output`. A JSON artifact alone does not guarantee unpruned path coverage.
  - Exit codes: `0` = scan complete, no vulnerabilities found; `1` = scan complete, vulnerabilities found; `2` = execution failure / scan error; `3` = unsupported project / no supported target found.
  - Exit 2, 3, or per-project errors in aggregate scans indicate failed/incomplete evidence—never treat as a clean scan or fixed vulnerability.
  - Retain matching scan scope, target modules/profiles, severity thresholds, and ignore policies across baseline and post-change scans. Scanner database drift, policy changes, or pruned paths must never be credited as fixed findings.

  - Preserve scanner version, organization, coverage, database/time identity where exposed, exact executable/argv and policy digests. Explicitly label unknown database identity; compare timestamps/source changes and limitations rather than invent stability.
  - Inspect every expected project/module result and parse/error state even on exit 0/1. An empty/missing/malformed output is incomplete evidence, not absence. Use no automatic fail-on/severity/ignore/exclude/pruning/reachability changes to make findings disappear.

After each coherent set: retain actual field/graph diff, check all required consumers/modules/profiles, inspect rescan and new risks, then capture updated baseline before the next set or approval. Any required command failure stops dependent changes and requires diagnosis. If scan/runtime access is unavailable, preserve completed checks and label affected findings unverified; overall status follows actual started work, never pretend a check passed.
## Overall status precedence

Determine overall status using strict precedence. Status is distinct from per-finding dispositions:

| Overall status | Exact meaning and precedence |
|---|---|
| `analyzed` | Read-only analysis completed with exactly zero target edits. If prerequisites block analysis before start, use `blocked`; if started analysis is incomplete, use `partial` (still zero target edits). |
| `needs-approval` | Exact concrete proposal ready, awaiting explicit human approval; zero gated writes executed. Applies only when no prior eligible subset or required check has been executed in this invocation. |
| `blocked` | Missing required prerequisite prevents all execution from starting (e.g. missing parent command authorization, missing procedure, missing registry/artifact access, missing trust boundary). |
| `partial` | Any eligible subset executed/verified, or any required execution started, but work is deferred, failed, or incomplete. In mixed runs, apply/verify eligible sets, record new baseline, then return `partial` with next action `needs-approval`. Command failure after work starts is `partial`, not `blocked`. |
| `completed` | All required authorized owner actions and checks are complete, and every newly introduced risk has a documented disposition (resolved or human-accepted). No required check omitted or substituted. Does not imply all source findings are fixed. |

## Per-finding dimensions and drift accounting

Maintain one row per source finding identity (not merely advisory alias), retaining the source assertion and occurrence/path locators from [Finding and owner contract](finding-and-owner-contract.md). Counts never substitute for rows. Source facts remain assertions, not baseline presence. Record three independent observation/disposition dimensions:

1. **Baseline observation:** `present`, `not-reproduced-at-baseline`, `incomparable`, `failed/unavailable`, or `unknown` (with matching-scope scan evidence). Finding `not-reproduced-at-baseline` is **never** credited as fixed.
2. **Post-scan observation:** `present`, `absent`, `incomparable`, `failed/unavailable`, or `unknown` (with artifact identity, scope/policy/database comparison, and coverage limits).
3. **Disposition:**
   - `fixed`: Requires baseline `present` PLUS verified resolved graph PLUS verified concrete runtime probe PLUS matching comparable rescan for all claimed paths/modules/profiles.
   - `remaining`: Confirmed present in completed comparable post-scan.
   - `newly-introduced`: Post-only finding in comparable baseline/post coverage. Retain a separate post-only ledger with scan record/occurrence/path identities, graph/owner links and evidence; do not rewrite the original source ledger. Database-only additions are called out without attributing introduction to this edit; incomparable coverage remains unverified. New risk prevents `completed` until resolved or explicitly human-accepted with exact risk/scope/evidence.
   - `blocked`: Specific prerequisite missing for this finding.
   - `unverified`: Missing, incomplete, failed, or incomparable evidence (e.g. scanner exit 2/3, missing runtime probe, pruned paths, omitted module).

Drift in scanner database versions, `.snyk` policy rules, module scope, or pruned paths must be explicitly recorded; disappearing findings due to drift must never be credited as remediation.

## Structured Markdown final-result template

```markdown
# Snyk remediation result

- Target root: `<canonical target root>` | HEAD: `<commit-sha>`
- Baseline identity: `<full tuple: root + repository/HEAD + index/worktree manifests + relevant files + modules/profiles + report/scan identities + policy>`
- Updated baseline: `<full updated tuple and original report identities after execution, or unchanged>`
- Operation / Authority: `<analyze | remediate | approved-remediate>` | Single-writer: `<operator>`
- Overall status: `<analyzed | needs-approval | blocked | partial | completed>`

## Source and owner coverage
- Supplied source ledger: `<actual retained record/occurrence/path ledger locator+digest using finding-and-owner-contract.md, not a link to this procedure as run evidence>`
- Covered findings / occurrences: `<all source record references, aliases and occurrence/path locators including duplicates>`
- Uncovered findings / gaps: `<exact items, conflicts, omissions and complete/partial/unknown coverage reasons>`
- Package-to-owner mapping: `<actual reconciled bidirectional table and proposal links; unmapped rows explicit>`

## Applied changes and approvals
- Proposals/assessments: `<exact identities, compatibility evidence/gaps, alternatives, inspected/uninspected consumers>`
- Actual changes: `<old -> new fields, files, owned hunks, before/after byte+field hashes, graph diff; none if analyze>`
- Human approval: `<full exact decision/source+locator, proposal/intent hashes, current baseline, authorized scope/conditions/operation/checks; none if absent>`

## Command evidence
| Stage | Command & args (redacted) | Authorization | Exit | Output locator & SHA-256 | Interpretation & limits |
|---|---|---|---|---|---|
| `<stage>` | `<argv, cwd, scope>` | `<parent auth, boundary>` | `<code>` | `<path#sha256>` | `<proof vs limitations>` |

## Finding dimensions
| Source or post-only record identity / aliases | Source assertion / raw locator | All occurrence / path references | Baseline observation | Post-scan observation | Disposition | Evidence / drift / limits |
|---|---|---|---|---|---|---|
| `<record identity, never invented advisory ID>` | `<original claim or post-only not-in-source>` | `<exact retained references>` | `<obs>` | `<obs>` | `<disposition(s) + reason>` | `<graph, consumer runtime, comparable scan or precise gaps>` |

## Next action
`<Exact prerequisite, owner, and decision/check needed; 'none' only if completed with zero remaining actions.>`
```

## Safe authorized selective rollback

When validation fails, an unapproved side effect occurs, or the caller halts execution:
- **Authority and ownership:** Rollback requires explicit parent authority and recorded before/after identities and owned edits. Only reverse this task's exact hunks/values, not entire files merely because the task touched them.
- **Pre-rollback check:** Verify current content matches the recorded after-state for every owned edit. Restore the captured before-values/hunks including pre-existing user content; do not restore repository HEAD or change staging to erase user work. Record actual inverse diff, resulting hashes and verification. Any conflict/concurrent drift stops automatic recovery.
- **Strict prohibitions:** NEVER execute `git reset --hard`, `git checkout -- .`, `git clean`, or any blanket workspace revert. Pre-existing staged, unstaged, and untracked user modifications, as well as concurrent modifications, must be preserved.
- **Blocked rollback:** If worktree drift is detected or rollback cannot proceed safely, halt immediately. Document the exact partial state, modified paths, and remaining hashes for manual recovery.
- **Boundaries:** No deployment, production monitoring, `.snyk` suppression file generation, external report upload, Git commit, or Git push is implied or authorized.
- **Live qualification:** No tests, artifacts, or live claims are qualified during skill authoring; qualification is deferred to Phase 05.
