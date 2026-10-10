# Maven and Spring remediation procedure

Executable-after-binding procedure for tracing controlling owners, evaluating dependencies, applying coherent owner changes, and verifying resolution in Maven and Spring projects (Phase 03, steps 5–11).

## 1. Prerequisites and trust boundaries

- **Trusted-execution authorization**: Maven (`./mvnw`, `mvn`) and Snyk CLI can execute project code. Execution requires explicit caller authorization and a bounded host/process/network boundary. Missing authority before required execution starts is `blocked`; after started work it leaves `partial`.
- **Analyze mode constraint**: Zero target edits or target-writing commands, including effective-POM outputs/build caches/scan compilation. Consume supplied evidence or separately authorized observations from an isolated copy; otherwise return exact unknowns. Apply overall status using [verification rules](verification-and-results.md), not the operation name alone.
- **Tooling preservation**: Preserve wrapper permissions (`./mvnw`), toolchain JDK versions, module selections (`-pl`), reactor inclusion (`-am`), active profiles (`-P`), and settings files (`-s`).
- **Primary documentation**:
  - [Maven dependency mechanism](https://maven.apache.org/guides/introduction/introduction-to-dependency-mechanism.html)
  - [Snyk CLI test command](https://docs.snyk.io/developer-tools/snyk-cli/commands/test)
  - Online documentation is authoring evidence, not proof of deployed flag/plugin behavior. Verify installed versions and effective output before relying on a template.

## 2. Binding requirements

Before executing commands, bind the caller-supplied execution context:
1. `target_root`: Canonical absolute path to target project repository.
2. `baseline_identity`: Full tuple in [finding contract](finding-and-owner-contract.md), including report/scan/policy/modules/profiles and user changes, not HEAD/POM hashes alone.
3. `build_tool`: Authorized target wrapper (`./mvnw`, native Windows `mvnw.cmd`) or installed `mvn` only when wrapper absent/not permitted and installed tool authorized. Never chmod/download/replace a wrapper without separate authority.
4. `maven_flags`: Exact captured module/reactor/profile/settings/property/toolchain options. Do not add `-am`, a guessed profile or settings path. Retain implicit profile activation evidence too.
5. `output_dir`: Parent-approved private artifact directory; verify resolved path, permissions and no collision/symlink escape. Use unique filenames per command/module/profile/stage; do not expose sensitive effective settings/POM data publicly.
6. `scan_scope`: Full observed scanner/version/organization/root/modules/profiles/options/policy/coverage identity and authorized transmission boundary.

## 3. Maven ownership tracing and dependency mediation

Trace controlling owners across the hierarchy rather than editing the nearest `pom.xml`:
1. Inspect direct dependency versions and properties, module and inherited dependencyManagement, imported BOMs and their order, parent relationships, active profiles and internal-library POMs.
2. Trace exact artifact identity including type/classifier; do not confuse dependency mediation with management precedence. For competing imported BOM entries, declaration order can select the first; local/inherited management and direct pins must also be examined. Prove the effective result rather than apply a universal precedence shortcut.
3. Record both omitted/conflicting alternatives and the resolved winner. Maven mediation prefers the nearest definition, then first declaration at equal depth, subject to effective management.
4. Trace properties to the actual controlling definition; importing a BOM is not identical to inheriting its parent/property semantics. Record why a proposed property will affect this consumer.
5. Enumerate JDK/OS/property/profile activation, reactor module graph and private/internal control per affected module/profile. Inaccessible owner evidence/release blocks that subset; name its maintainer/access prerequisite.
6. Retain baseline effective-POM and verbose dependency-tree output per affected module/profile. Inspect actual plugin output layout and coverage; no output file or a truncated/filter-only tree means incomplete evidence, not an absent path.

## 4. Concrete command templates

These are templates, not executed evidence. Bind literal argv through an argv-array launcher (`shell: false`), cwd=`target_root`, bounded output and exit capture. `tool` is the authorized executable; `scopeArgs` is the actual list of captured Maven arguments, not one string containing whitespace. Omit only options evidenced as inapplicable; never execute angle-bracket placeholders.

| Check | Bound argv template |
|---|---|
| Toolchain | `[tool, "-version"]` |
| Effective model | `[tool, ...scopeArgs, "help:effective-pom", "-Doutput=" + effectiveOutput]` |
| Verbose tree | `[tool, ...scopeArgs, "dependency:tree", "-Dverbose"]` |
| Build/tests | `[tool, ...scopeArgs, "verify"]` only when this exact target-approved check covers required tests; record skipped tests/checks as gaps |

Shell equivalents from the trusted root: `./mvnw -version`, `./mvnw help:effective-pom -Doutput="<safe-output>"`, `./mvnw dependency:tree -Dverbose`, and target-approved `./mvnw verify`, each with the same bound module/profile/settings options. Quote each literal argument; never interpolate report text or use eval.

Capture the verbose tree's full bounded stdout separately for each command. With a multi-module reactor, one shared `-DoutputFile` can overwrite earlier module trees; do not claim per-module coverage from its final contents. The help plugin may emit an aggregate effective model: retain module-located sections only after inspecting them, or use separately authorized per-module invocations without silently altering resolution scope. Graph filters may aid inspection but never replace the complete retained evidence.

## 5. Coupled families and source assertion integrity

- **Source assertions**: Five Bouncy Castle and one Logback findings are unverified source assertions from initial advice, not verified ground truth. Verify actual occurrences, IDs, and paths from supplied scan artifacts.
- **No version preselection**: Do not preselect candidate versions (such as Bouncy Castle `1.85` or Logback `1.5.36`). Query authorized registries at runtime to verify release availability.
- **Logback coupling**: Trace Boot logging ownership separately from Cloud/internal crypto ownership. Inspect `logback-core`/`logback-classic`, property/direct versions and documented coordinated support; align the complete supported set where required, not a lone vulnerable child.
- **Bouncy Castle coupling**: Inspect every used provider/PKIX/util artifact and JDK/FIPS variant. Verify upstream-documented family/version support and artifact availability; do not mix artifact lines or assume every family uses identical version conventions.
- **Framework boundaries**: Do NOT force a Spring Boot major upgrade (e.g., Boot 2.x to 3.x / Jakarta / Java 17) or unsupported Spring Cloud release train realignment to eliminate minor dependency findings.

## 6. Upstream review and owner vs override comparison

Consume a read-only assessment through [Dependency Upgrade Review](../../evc-dependency-upgrade-review/SKILL.md) in this context; no nested-agent dependency:
1. Compare an exact supplied supported owner-release proposal against a documented coordinated override. Include all affected consumers, not only vulnerable children; neither alternative is executed by the review skill.
2. Trace explicit child pins/properties/later conflicting management that defeat a BOM upgrade. Propose a separately reviewed exact correction only where supported and in scope; a pin is not automatic approval to remove it.
3. Preserve `eligible`, `needs-approval`, `blocked` assessment reasons. Missing artifact/access is blocked; unclosed compatibility gaps require approval; no forced owner upgrade or guessed fallback.

## 7. Pre-edit gates and coherent edit execution

1. **Pre-edit check**: Confirm single-writer access, verify baseline has not drifted from delegation record, and snapshot pre-existing user changes (staged, unstaged, untracked).
2. **Operation gating**:
   - `analyze`: Stop before write; output read-only proposal.
   - `remediate`: Apply only if proposal is assessed `eligible` under current user policy.
   - `approved-remediate`: Eligible sets retain their own gates; gated intent additionally requires exact human decision/source, proposal/intent hashes, full current baseline, covered paths and conditions from the finding contract. Approval never supplies a missing artifact or permission.
3. **Coherent change set**: Apply one owner set including required coupled changes; do not claim filesystem atomicity across files. Preserve user changes and record owned hunks/before/after hashes. Recheck baseline before every subsequent set.

## 8. Verification and concrete runtime probes

After modifying manifests, run verification:
1. **Effective graph check**: Run effective POM and verbose dependency tree templates; confirm expected coordinates and versions resolved across all target modules/profiles.
2. **Target verification**: Run target-approved `./mvnw verify`.
3. **Target-specific runtime probes**:
   - Process startup without exceptions is insufficient. Probes must exercise actual target code paths.
   - *Logging probe*: Select used logging paths/configuration/appenders from repository evidence; assert actual emitted content/routing/behavior, not just startup. Bind expected observations before execution.
   - *Crypto probe*: Select application-used signing/verification, provider, certificate/PKIX, keystore or TLS behavior; assert concrete expected outcomes. Examples are not a requirement to invent unused probes.
4. **Probe failure stop**: If tests or runtime probes fail, **STOP (`partial`)**. Record failure details; initiate selective rollback of only owned edits if authorized.

## 9. Snyk scan invocation and limitations

Run baseline and post-remediation scans with identical scope:

### Command template
- **Shell schema**: `snyk test <captured-scope-options> --json-file-output="<safe-artifact>" -- <captured-maven-options>`; replace each placeholder with separately quoted authorized literal arguments.
- **Argv**: `["snyk", "test", ...scanArgs, "--json-file-output=" + scanOutput, "--", ...mavenArgs]`. `scanArgs`/`mavenArgs` are lists, not joined strings; use distinct baseline/post outputs.

### Scanning rules and flags
- **Aggregate scope**: Validate Maven modules/inheritance and deployed scanner support; use `--maven-aggregate-project` instead of `--all-projects` for an authorized aggregate scan from root `pom.xml` directory. It triggers compilation and requires that execution authorization. Never silently alter captured baseline scope; rebaseline explicitly if scope correction is needed.
- **Conflict prohibition**: Never combine aggregate and all-projects options.
- **JSON restriction**: `--show-vulnerable-paths` is unsupported with `--json-file-output`; omit it rather than pretend it proves JSON coverage.
- **Path limitations**: Preserve every available source/graph path and inspect actual omissions/pruning. Do not add prune/exclude/severity/fail-on/reachability/policy switches to conceal findings; JSON alone does not establish complete coverage.
- **Exit code semantics**:
  - `0`: Scan complete, no vulnerabilities detected.
  - `1`: Scan complete, vulnerabilities detected.
  - `2`: Execution error / scan failure.
  - `3`: No supported target projects discovered.
  - Aggregate scans with per-project errors must be recorded as scan failures / incomplete evidence (`partial`), not clean results.

## 10. Stop branches summary

| Condition | Action / Status | Recovery Requirement |
|---|---|---|
| Missing authority/procedure/artifact/access | Stop that action; `blocked` before required execution, `partial` after started work | Restore exact missing prerequisite; independent fully supported subsets keep their separate gates |
| Analyze operation | Zero target writes; `analyzed` only if analysis complete, otherwise blocked/partial per verification rules | Return evidence and exact gaps; no target-writing command |
| Relevant baseline drift | Void old assessment/approval; status follows actual work and prerequisites | Reassess current intent/state; obtain new exact decision only for gated work |
| Pin defeats owner proposal | No fix claim or automatic pin removal | Trace effective owner, review exact supported correction through Phase02 |
| Incompatible/unknown coupling | Defer exact proposal; preserve blocker and human-gate reasons | Establish supported artifacts/impact and exact decision where gated |
| Exact gated proposal lacks approval | No gated write; `needs-approval` only before required execution, otherwise `partial` with next approval action | Main collects exact current-baseline human decision |
| Graph/build/test/runtime/scan failure | Stop dependent sets; `partial`, findings remaining/unverified as evidenced | Diagnose, preserve outputs and new risks; rollback only safely authorized owned hunks |
