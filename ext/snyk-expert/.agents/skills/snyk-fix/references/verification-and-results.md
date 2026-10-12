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
- **Resolved graph:** Use the bound [Maven](maven-spring-remediation.md) or [Node.js/TypeScript](node-typescript-remediation.md) procedure per affected module/profile/workspace. Retain effective owner fields and resolved winners; Node evidence includes manifest section, shared lockfile, peer/optional/platform variants and workspace consumers. A tree alone does not prove controlling fields.
- **Target build and tests:** Run exact target-approved verification and inspect executed/skipped tests. Green builds alone do not establish remediation.
- **Concrete runtime behavior:** Probes must exercise affected consumers (logging formats/levels, crypto ciphers/providers, serialization paths), not merely process startup or absence of fatal exceptions.
- **Snyk scanner invocation:**
  - Main owns live scanner executions (`baseline-scan` and terminal live review `post-scan`). Use the applicable ecosystem procedure and [CLI workflow](../../snyk-cli/references/cli-workflow.md) with actual authorized scope/options and distinct private baseline/post outputs. Maven arguments and Node workspace/lockfile/dev scope are captured, never guessed. Templates are planned, not executed facts.
  - For Maven aggregate projects: use `--maven-aggregate-project` instead of `--all-projects`; never combine both.
  - Option restrictions: `--show-vulnerable-paths=all` is unsupported with `--json-file-output`. A JSON artifact alone does not guarantee unpruned path coverage.
  - Exit codes: `0` = scan complete, no vulnerabilities found; `1` = scan complete, vulnerabilities found; `2` = execution failure / scan error; `3` = unsupported project / no supported target found.
  - Exit 2, 3, or per-project errors in aggregate scans indicate failed/incomplete evidence—never treat as a clean scan or fixed vulnerability.
  - Retain matching scan scope, target modules/profiles, severity thresholds, and ignore policies across baseline and post-change scans. Scanner database drift, policy changes, or pruned paths must never be credited as fixed findings.
  - Preserve scanner version, organization, coverage, database/time identity where exposed, exact executable/argv and policy digests. Explicitly label unknown database identity; compare timestamps/source changes and limitations rather than invent stability.
  - Inspect every expected project/module result and parse/error state even on exit 0/1. An empty/missing/malformed output is incomplete evidence, not absence. Use no automatic fail-on/severity/ignore/exclude/pruning/reachability changes to make findings disappear.

After each coherent set: retain actual field/graph diff, check all required consumers/modules/profiles, inspect rescan and new risks, then capture updated baseline before the next set or approval. Any required command failure stops dependent changes and requires diagnosis. If scan/runtime access is unavailable, preserve completed checks and label affected findings unverified; overall status follows actual started work, never pretend a check passed.
### Scan ownership, comparability and terminal live review

- **Specialist local verification boundary:** The specialist executes local verification (effective graph, native build/test, affected consumer probes) and hands off with `local verification complete; Snyk verification pending`. The specialist never declares a finding `fixed` or overall run `completed`. Entrypoint skills and specialist instructions coordinate with this verification boundary.
- **Main live rescan ownership:** Main owns live authenticated Snyk rescan (`baseline-scan` and terminal live review) against the resulting state and reconciles all findings.
- **Evidence comparability for scan reuse:** A scan may serve as next baseline or terminal review only when real authenticated CLI provenance, original byte locator/hash/time, exact state, resolved graph, environment/runtime, scanner/version, product/org/endpoint, expected projects, argv/policy and freshness remain strictly comparable.
- **Terminal scan requirement:** Real terminal CLI execution is required even for clean/no-mutation runs. Initial executed scan may serve both only for actual unchanged terminal state fully inspected as final review; supplied initial report alone cannot close final review.
- **Scanner exit codes & project coverage:** Exit 1 = scan complete with findings (valid only after full project/artifact inspection). Exit 2/3, omissions, or malformed output = incomplete review.
- **Diagnostic scan separation:** A clean diagnostic scan after failed required tests/probes cannot clear failed tests or resume the remediation loop; status remains `partial`.

## Retained run record, attempt counting and private evidence storage

### Retained run record fields

The run record maintains durable state across actor handoffs, pauses, and context restarts:

| Field | Required value / evidence |
|---|---|
| `run_id` | Stable local run reference (timestamp or hash identity; local label, never a substitute advisory ID). |
| `target_root` | Canonical absolute project root. |
| `baseline_identity` | Full initial identity tuple (target/root + HEAD + index/worktree manifests + relevant files/values + modules/profiles + report/scan scope/identity + policy). |
| `current_baseline` | Full current identity tuple after prior authorized operations. |
| `scope_identity` | Explicit allowed edit paths, manifests, modules, profiles, workspaces. |
| `bound_n` | Positive integer budget $N$ bound at intake ($N \ge 1$). |
| `attempts_started` | Count of started attempts ($0 \le \text{attempts\_started} \le N$). |
| `writer_identity` | Single-writer operator identity. |
| `current_stage` | Current procedure step / stage. |
| `next_action` | Exact next action / owner action (`none` only when completed). |
| `stop_reason` | Stop reason if halted, exhausted, or completed. |
| `proposal_references` | List of exact proposal identities and material intent hashes. |
| `assessment_references` | Links to [upgrade review](../../dependency-upgrade-review/SKILL.md) assessments and gaps. |
| `decision_references` | Exact human approval / rejection / revision records and hashes. |
| `scan_references` | Baseline and latest scan locators, hashes, and CLI outputs. |
| `inventory_links` | Link to immutable source and occurrence inventory in [Finding and owner contract](finding-and-owner-contract.md). |
| `changed_paths_and_checks`| Actual modified files, fields, graph diffs, test logs, and recovery hashes. |
| `in_flight_state` | `'idle' | 'started' | 'finished'`; tracks active execution within an attempt. |
| `attempt_record` | Captures attempt number, proposal identity, material intent hash, pre-attempt baseline tuple, and in-flight marker before first mutation. |
| `pause_and_revision_history` | Record of pre-write pauses, revision events, and resumed state. |

### Attempt counting and lifecycle rules

1. **Counting point & durable persistence:** Increment `attempts_started` once and durably record the attempt-start record (attempt number, proposal identity, material intent hash, pre-attempt baseline tuple, and `started` marker) in the run record immediately before the first authorized operation capable of changing dependency inputs or resolution state (including native update commands, resolution, or mutating scanners/resolvers) within a coherent authorized attempt. Inability to durably retain or persist the incremented count halts writes immediately.
2. **Subsequent commands:** Subsequent commands within the same reviewed one-set procedure do not increment the count again.
3. **No refunds & failed-attempt accounting:** Tool failures, syntax errors, native update failures, and authorized inverse rollbacks never refund an attempt count. When an attempt fails, Main executes the mandatory failed-attempt finalization branch: appends observations for all original findings with `failed/unavailable` or `unverified` status, records failure diagnostics and modified paths in `changed_paths_and_checks`, and preserves the attempt count with `in_flight_state: 'started'` and `stop_reason: 'native-check-failed'`. Proceeding to another owner set is strictly prohibited until forward verification passes or authorized rollback completes.
4. **Pause/resume & crash recovery safety:** Pre-write pauses, approval waits, and context restarts consume zero attempts ($0$) and preserve the same run record, bound $N$, and `attempts_started`. The `in_flight_state` transitions from `idle` to `started` upon recording the attempt-start record, and to `finished` only after that attempt's verification or selective rollback completes. On resume, compare current baseline to the captured pre-attempt baseline tuple; treat any unexplained drift or unfinished attempt marker as stop-and-recover, never as a fresh attempt.
5. **Missing history blocks:** Unknown or missing attempt history blocks further dependency writes until resolved.
6. **Budget increase & intake validation:** Missing, zero, negative, fractional, or non-integer text $N$ must be obtained explicitly from the operator before edits; no arbitrary default, cap, or silent unlimited run. If the operator explicitly increases $N$ in the same retained record, existing run history and `attempts_started` are retained; no automatic reset or fresh session to bypass limits.
7. **Budget exhaustion:** When $\text{attempts\_started} = N$, halt further mutations; record full residual status and next operator action. Budget exhaustion stops new mutation, but does not stop required evidence capture or live review of the already-started attempt.
8. **Forward corrections:** Any new corrective set (e.g. following post-review evaluation) consumes another attempt ($+1$).
9. **Evidence-only writes outside $N$:** Only proved, main-owned, authorized evidence-only writes strictly satisfying private storage safeguards remain outside $N$. Scanner, resolver, and build side effects are not automatically exempt.
10. **Clean run zero attempts:** A clean run or read-only analysis without dependency/resolution mutations completes with zero attempts consumed ($\text{attempts\_started} = 0$). Terminal scan and review execution on unchanged state consume zero attempts, provided the scan neither changes nor is capable of changing dependency inputs or resolution (the counting point in Item 1 still applies if scanner-triggered resolution occurs).

### Private target-contained evidence storage bindings

Default raw scans and run ledgers to a private ignored directory inside the target root. Bind storage before artifact-producing execution:

| Safeguard | Required binding and failure behavior |
|---|---|
| Containment | Exact allowed paths; resolved target-contained ancestors and leaves; no symlink escape, unsafe collision, or ambiguous destination. Single main-owned writer. |
| Access | Explicit report-write authority plus access-controlled ancestors and destination directory. Report-write authority grants no dependency mutation, scanner execution, network transmission, or code execution permission. No automatic permission repair or assumption that ignore rules make data private. |
| Git ignore | Evidence must remain untracked and effectively ignored. An ignored pathname is neither security proof nor a baseline exemption for ignored dependency or build inputs. No automatic ignore edits, untracking, or force-add. |
| Content | Original scan bytes and append-only observations; never overwrite original scan bytes (new output paths and append-only ledgers only); no tokens, copied manifests/lockfiles, executable recipes, or active content. |
| Coverage | Store is not a dependency/runtime/build input and must not change scan coverage. No Snyk filters/exclusions to hide it. Inspect baseline effects. |
| Counting and baseline | Safe authorized ledger growth alone does not invalidate approval or comparable scan scope; evidence-only identities are proved separately from the full dependency/resolution/runtime/policy baseline. Unexpected graph/build/coverage effects stop execution for reassessment. |

**Unsafe storage pause:** Unsafe, unauthorized, unprotected, tracked, unignored, or coverage-affecting storage pauses artifact-producing execution immediately and reports the exact operator prerequisite. No silent external fallback or automatic ignore/access repair. Specialist `analyze` and upgrade review retain zero target writes.

## Overall status precedence and retained-run semantics

Determine overall status using strict precedence. Status is distinct from per-finding dispositions:

| Overall status | Exact meaning and precedence |
|---|---|
| `analyzed` | Read-only analysis completed with exactly zero target edits. If prerequisites block analysis before start, use `blocked`; if started analysis is incomplete, use `partial` (still zero target edits). |
| `needs-approval` | Exact concrete proposal ready, awaiting explicit human approval; zero gated writes executed. Applies only when no prior eligible subset or required check has been executed in this invocation. |
| `blocked` | Missing required prerequisite prevents all execution from starting (e.g. missing parent command authorization, missing procedure, missing registry/artifact access, missing trust boundary). |
| `partial` | Any eligible subset executed/verified, or any required execution started, but work is deferred, failed, or incomplete. In mixed runs, apply/verify eligible sets, record new baseline, then return `partial` with next action `needs-approval`. Command failure after work starts is `partial`, not `blocked`. In a retained run, status reflects the entire accumulated run history; resuming cannot reset started work back to `needs-approval` or `blocked`. |
| `completed` | All required authorized owner actions and checks are complete, and every newly introduced risk has a documented disposition (resolved or human-accepted). No required check omitted or substituted. Does not imply all source findings are fixed. |

## Per-finding dimensions and drift accounting

Maintain one row per source finding identity (not merely advisory alias), retaining the source assertion and occurrence/path locators from [Finding and owner contract](finding-and-owner-contract.md). Counts never substitute for rows. Source facts remain assertions, not baseline presence. Record three independent observation/disposition dimensions:
1. **Baseline observation:** `present-at-baseline`, `not-reproduced-at-baseline`, `incomparable`, `failed/unavailable`, or `unknown` (with matching-scope scan evidence). Finding `not-reproduced-at-baseline` is **never** credited as fixed.
2. **Post-scan observation:** `present`, `absent`, `incomparable`, `failed/unavailable`, or `unknown` (with artifact identity, scope/policy/database comparison, and coverage limits).
3. **Disposition:**
   - `fixed`: Requires baseline `present-at-baseline` PLUS verified resolved graph PLUS verified concrete runtime probe PLUS matching comparable rescan for all claimed paths/modules/profiles.
   - `remaining`: Confirmed present in completed comparable post-scan.
   - `newly-introduced`: Post-only finding in comparable baseline/post coverage. Retain in a separate post-only ledger with scan record/occurrence/path identities, graph/owner links and evidence; do not rewrite the original source ledger. Database-only additions are called out without attributing introduction to this edit; incomparable coverage remains unverified. New risk prevents `completed` until resolved or explicitly human-accepted with exact risk/scope/evidence.
   - `blocked`: Specific prerequisite missing for this finding.
   - `unverified`: Missing, incomplete, failed, or incomparable evidence (e.g. scanner exit 2/3, missing runtime probe, pruned paths, omitted module).

### Distinctions and drift accounting

- **Advisory absence vs path disappearance:** Distinguish complete advisory absence from the disappearance of an individual vulnerable path. Pruned or filtered paths do not constitute remediation.
- **License policy vs vulnerability fix:** License policy acceptance or rejection is a separate human policy decision, never a vulnerability remediation fix.
- **Scanner drift:** Drift in scanner database versions, `.snyk` policy rules, module scope, or pruned paths must be explicitly recorded; disappearing findings due to drift must never be credited as remediation.

### Every-attempt append-only observation ledger

After EVERY attempt (attempt $1 \dots N$), append one observation row for EVERY original source record from the immutable first-scan inventory in [Finding and owner contract](finding-and-owner-contract.md), including unchanged, unattempted, gated, rejected, failed, or unavailable rows. Retain links to ALL ordered occurrences. Aggregate counts are strictly supplementary; counts never substitute for rows.

- **Mandatory failed-attempt observation recording:** When an attempt fails during native update, graph inspection, build/test, or consumer probes (Step 4/5), Main must still append an observation row for every original finding from the first-scan inventory before halting execution. For each row:
  - `Baseline observation`: Retains scan-zero presence (`present-at-baseline`, `not-reproduced-at-baseline`, etc.).
  - `Post-scan observation`: Marked `failed/unavailable` (or `unverified`).
  - `Graph & consumer check`: Marked `failed` (recording the failing check/exit).
  - `Disposition`: Marked `unverified` (or `remaining`). Never credited as `fixed`.
  - `Evidence locator`: Points to failure log/output locator, hash, and stop reason.
  Failure never permits omitting ledger rows or skipping attempt accounting.

| Attempt # | Source record identity | All occurrence / path references | Baseline observation | Post-scan observation | Graph & consumer check | Disposition | Evidence locator, hash & limits |
|---|---|---|---|---|---|---|---|
| `<1..N>` | `<source record identity, never invented ID>` | `<exact occurrence references>` | `<present-at-baseline / not-reproduced-at-baseline / incomparable / failed/unavailable / unknown>` | `<present / absent / incomparable / failed/unavailable / unknown>` | `<verified / failed / omitted / not-applicable>` | `<fixed / remaining / blocked / unverified>` | `<output path#sha256, exit, project limits>` |

### Separate post-only inventory and provenance

Findings appearing exclusively in post-scans or database-added records are tracked in a dedicated post-only ledger without modifying the immutable original source inventory:

| Post-only record identity / locator | IDs & aliases | Ecosystem / coordinate / reported versions | Scan-introduced attempt # / locator | Occurrence / path references | Causal attribution | Graph & consumer evidence | Disposition | Coverage / limitations |
|---|---|---|---|---|---|---|---|---|
| `<artifact identity + source key>` | `<supplied values>` | `<exact facts>` | `<attempt #, post-scan locator#sha256>` | `<ordered paths>` | `<established causal link / unknown / database-added>` | `<graph output locator#sha256>` | `<newly-introduced / unverified>` | `<limits, policy rules>` |

### Attempt and pause summary

Maintain an attempt and pause summary recording:
- Exact coherent proposal identity, baseline, and human decision.
- Planned versus actual executed commands and options.
- Actual changed paths, graph diff, and consumer probe outcomes.
- Live CLI exit code and artifact locator/hash.
- Stop reason or next action.
- Pre-write pauses consume zero attempts ($0$) and preserve revision history.

## Observed procedure learning and inert candidate note

### Procedure-learning observations within run record

Append procedure-learning observations within the existing run record for each bound procedure:
- **Toolchain:** Actual manager, version, executable, runtime, and platform.
- **Sources:** Official support and parser sources.
- **Controls:** Authored, effective, and generated control fields; coherent scope.
- **Execution:** Planned versus executed literal commands, cwd, options, authority, and expected versus actual side effects.
- **Outcomes:** Graph, native build, test, consumer probe, and Snyk outcomes; raw private locators, hashes, and timestamps.
- **Gaps:** Failures, unexecuted steps, unknown branches, and provenance.
- **Limits:** Precise qualified topology, version, and platform limits.

### Separation of observations from recommendations

Observations describe observed facts, not recommendations. Failed diagnostics or command errors must never become recommended fixes.

### Inert sanitized UNTRUSTED candidate note

Main derives an inert sanitized candidate note only if useful for future reference:
- **Sanitization:** Remove private coordinates, names, paths, endpoints, organization/project IDs, source code, and credentials.
- **Labeling:** Explicitly label the note as `UNTRUSTED`, non-universal, limited to observed qualified surfaces, and strictly inert.
- **Boundary:** It is NOT an executable recipe or execution authority. It does NOT rewrite installed skills or force reinstallations.
- **Promotion:** Improving installed `.agents` skills is a separate, human-approved source-authoring maintenance task, never an automatic skill update or runtime prerequisite. Normal remediation runs close without skill promotion.

## Structured Markdown final-result template

```markdown
# Snyk remediation result

- Run reference: `<run_id>` | Target root: `<canonical target root>` | HEAD: `<commit-sha>`
- Budget N: `<bound_n>` | Attempts started: `<attempts_started / bound_n>` | In-flight state: `<in_flight_state>` | Single-writer: `<operator>`
- Overall status: `<analyzed | needs-approval | blocked | partial | completed>`
- Current stage: `<stage>` | Next action: `<exact next action or 'none'>` | Stop reason: `<reason or 'none'>`
- Baseline identity: `<full tuple: root + repository/HEAD + index/worktree manifests + relevant files + modules/profiles + report/scan identities + policy>`
- Updated baseline: `<full updated tuple and original report identities after execution, or unchanged>`
- Operation / Authority: `<analyze | remediate | approved-remediate>`

## Retained run state and pauses
- Proposals / assessments: `<exact identities, hashes, upgrade-review links>`
- Human approvals: `<exact decision records, sources, current baseline, hashes; none if absent>`
- Pauses / revisions: `<pre-write pause history, revision records, resumed run state>`
- Private storage binding: `<private directory locator, containment/access/ignore proof>`

## Source and owner coverage
- Supplied source ledger: `<immutable source/occurrence ledger locator+digest from finding-and-owner-contract.md>`
- Covered findings / occurrences: `<all source record references, aliases and occurrence/path locators including duplicates>`
- Uncovered findings / gaps: `<exact items, conflicts, omissions and complete/partial/unknown coverage reasons>`
- Package-to-owner mapping: `<reconciled bidirectional table and proposal links; unmapped rows explicit>`

## Applied changes and verification
- Actual changes: `<old -> new fields, files, owned hunks, before/after byte+field hashes, graph diff; none if analyze>`
- Native verification: `<resolved graph, build, test, and consumer runtime probe results>`
- Live scan evidence: `<main-owned terminal live review scan locator, SHA-256 (identity, not authenticity), exit code, coverage comparability>`

## Command evidence
| Stage | Command & args (redacted) | Authorization | Exit | Output locator & SHA-256 | Interpretation & limits |
|---|---|---|---|---|---|
| `<stage>` | `<argv, cwd, scope>` | `<parent auth, boundary>` | `<code>` | `<path#sha256>` | `<proof vs limitations>` |

## Every-attempt observation ledger
| Attempt # | Source record identity | All occurrence / path references | Baseline observation | Post-scan observation | Graph & consumer check | Disposition | Evidence locator, hash & limits |
|---|---|---|---|---|---|---|---|
| `<1..N>` | `<source record identity>` | `<occurrence refs>` | `<present-at-baseline / not-reproduced-at-baseline / incomparable / failed/unavailable / unknown>` | `<obs>` | `<check>` | `<disposition>` | `<path#sha256>` |

## Post-only findings and provenance
| Post-only record identity / locator | IDs & aliases | Ecosystem / coordinate / reported versions | Scan-introduced attempt # / locator | Occurrence / path references | Causal attribution | Graph & consumer evidence | Disposition | Coverage / limitations |
|---|---|---|---|---|---|---|---|---|
| `<post-only identity>` | `<aliases>` | `<exact facts>` | `<attempt #, post-scan locator#sha256>` | `<ordered paths>` | `<causal link / unknown>` | `<graph output locator#sha256>` | `<newly-introduced / unverified>` | `<limits, policy rules>` |

## Observed procedure learning & candidate note
- Toolchain & sources: `<actual manager, version, runtime, platform, official support sources>`
- Literal commands & outcomes: `<executed argv, options, side effects, native/Snyk outcomes>`
- Limits & deviations: `<observed qualified limits, deviations from planned procedure>`
- Sanitized UNTRUSTED candidate note: `<inert sanitized template without private coordinates/secrets; or 'none'>`

## Next action
`<Exact prerequisite, owner, and decision/check needed; 'none' only if completed with zero remaining actions.>`
```

## Safe authorized selective rollback

When validation fails, an unapproved side effect occurs, or the caller halts execution:
- **Authority and ownership:** Rollback requires explicit parent authority and recorded before/after identities and owned edits. Only reverse this task's exact hunks/values, not entire files merely because the task touched them.
- **Pre-rollback check:** Verify current content matches the recorded after-state for every owned edit. Restore the captured before-values/hunks including pre-existing user content; do not restore repository HEAD or change staging to erase user work. Record actual inverse diff, resulting hashes and verification. Any conflict/concurrent drift stops automatic recovery.
- **Strict prohibitions:** NEVER execute `git reset --hard`, `git checkout -- .`, `git clean`, or any blanket workspace revert. Pre-existing staged, unstaged, and untracked user modifications, as well as concurrent modifications, must be preserved.
- **Counting:** Rollback is recorded recovery of the consumed attempt; it does NOT refund or reset the attempt count. Forward correction after rollback consumes another counted attempt.
- **Blocked rollback:** If worktree drift is detected or rollback cannot proceed safely, halt immediately. Document the exact partial state, modified paths, and remaining hashes for manual recovery.
- **Live qualification:** Authoring checks do not qualify real target remediation, native host loading or authenticated scanner behavior; require observed authorized runs.
