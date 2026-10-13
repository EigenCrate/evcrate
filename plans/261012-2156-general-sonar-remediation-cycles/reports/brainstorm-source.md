# General Sonar remediation cycles — brainstorm decision

Date: 2026-10-12. Status: brainstorm specification; implementation not started.

## 1. Decision and scope

Use a thin portable **`cmd-sonar-remediate` command skill**, the existing **`sonarqube-test-quality` domain skill**, generic evidence/learning templates, and one **Sonar Evidence actor prompt** executed by a real host subagent.

User decisions:
- **N is a maximum**, not a mandatory number of rounds. Ask for a positive integer when omitted; stop early only when agreed success criteria hold.
- **Portable extension only.** No canonical command/agent additions, registry changes, seven-target projections, or host configuration writes.
- **Separate commit authorization.** No automatic commit or Git push.
- **Success scope:** all active issues in the configured analysis scope, passing target quality gates, required hotspot reviews completed by their owner. No invented coverage percentage.
- **Language/framework-neutral core.** The supplied Java/Maven/Windows service report is reference material only, not the intended project or a mandatory execution recipe.
- **No universal version/tool pins.** Discover and preserve each project's approved versions, runner, scanner, test and coverage tools. Do not upgrade tools automatically or default to latest.
- **Learn from other runs.** Produce local sanitized run-guidance reports, including failed/blocked runs, for reviewed future skill/actor improvements; no automatic self-modification or external sharing.

Accept projects of any language/framework for discovery. Execution feasibility depends on the actual Sonar edition/analyzers, scanner compatibility, project tooling, permissions, and host capabilities. Unsupported capabilities are explicit limitations, not silently excluded files or a promise that Sonar analyzes every language.

Final artifacts for implementation: updated main skill/references; one separately discoverable `cmd-*` command skill; portable actor prompt; cycle/issue/coverage/analysis and reusable-guidance templates; installer/package coverage; behavioral evals; docs; honest live qualification evidence.

Out of scope: new workflow engine/daemon, CI setup, native host actor registration, automatic commits/pushes, findings suppression/status mutation, automatic trust/proxy changes, universal language adapters, and automatic promotion of collected guidance.

## 2. Current surface and evidence

Inspected `ext/sonarqube-test-quality/`:
- `SKILL.md` is a short route selector; no N-cycle controller. Its current description emphasizes Java/Maven/JUnit/Mockito and Jenkins. Generalize entry-point discovery; retain specialized recipes only behind optional routes.
- `references/sonar-cli-commands.md` already separates CLI reads from full scanning and scanner authentication, requires exact branch/PR identity and complete pagination, and preserves authoritative JSON.
- `references/full-scan-workflow.md` describes separately authorized Jenkins push-to-scan. Preserve that route; it is not synonymous with scanner upload.
- `references/remediation-and-handoff.md` covers root causes/workspace preservation and a text handoff, but no cross-cycle finding history.
- `references/testing-and-coverage.md` currently focuses on Java and JaCoCo. Split neutral evidence rules from optional existing Java guidance; do not make its combined line/branch helper a universal metric.
- `references/report-formats.md` and the converter preserve JSON fidelity and one-way Markdown views. Keep them offline; no network/pagination/verdict engine added.
- `lib/install.js` has an explicit ten-file allowlist mapped into one skill. New files alone will not install; sibling command assets need explicit destination mappings.
- `package.json` has a package asset allowlist that must include new directories.
- Canonical commands show sequential terminal-result gates. Do not copy their host-specific configuration assumptions or auto-commit behavior into a portable command.

Observed during brainstorm:
- Existing installer dry run against `/tmp/evcrate-sonar-brainstorm-preview`: exit 0; ten domain-skill files previewed; no files written.
- Existing offline converter `--help`: exit 0; exclusive output and offline JSON boundary shown.
- `docs-seeker` topic detection ran; Context7 lookup unavailable. Primary vendor documentation and optional example's pinned scanner source read directly instead.
- General coverage docs confirm language/tool-specific formats and import parameters. .NET docs confirm `begin → build/test/coverage → end`; generic scanner docs prohibit substituting generic CLI for dedicated Maven/Gradle/.NET scanners.
- No solution implementation, package tests, service build/tests, live Sonar authentication/upload, commit, or Git push performed. Documentation reads are feasibility evidence, not runtime qualification.

### What the supplied report teaches

Its local 56-test result, 46.48% line coverage and 63.91% branch coverage are user-provided history. Its latest focused change was not analyzed afterward; historical gate/counts cannot qualify the current worktree. No corporate checkout or current server result was exercised here.

Reusable lessons: separate query authentication from scanner authentication; verify source/target identity; regenerate applicable test/coverage evidence; upload each coherent checkpoint; wait for server processing; paginate fully; distinguish overall/new-code metrics and hotspots; prove CI triggers before Git pushes; keep client-specific TLS verification enabled.

Do **not** transplant its host, project key, branch, scanner version, language target, test count, coverage path, shell, or private report link into generic defaults. Specific snippets may become sanitized optional guidance only when applicable and verified.

## 3. Alternatives

| Approach | Advantage | Cost/risk | Decision |
|---|---|---|---|
| Main skill only | Few artifacts; policy reuse | Controller and evidence role blur | Viable, not selected |
| Thin command + domain policy + evidence actor | Explicit invocation; one policy owner; independent evidence collection | Real subagent capability required | **Selected** |
| Executable controller/adapter framework | Stronger automated transitions | Credentials, approvals, persistence, adapters, more maintenance | Reject for current need |

One data-only execution profile per run; no new executable adapter registry. Reuse project scripts and supported native scanners.

## 4. Proposed extension artifacts

These are design paths, **not implemented files**.

| Source under `ext/sonarqube-test-quality/` | Installed destination / responsibility |
|---|---|
| Existing `SKILL.md` and references | `.agents/skills/sonarqube-test-quality/`; neutral discovery/policy, specialized guidance on demand |
| `commands/cmd-sonar-remediate/SKILL.md` | `.agents/skills/cmd-sonar-remediate/SKILL.md`; ordering, N, roles, gates |
| `references/remediation-cycles.md` | Domain reference; cycle, stop, and success contracts |
| `references/project-discovery.md` | Domain reference; project execution profile and capability/applicability checks |
| `references/local-analysis.md` | Domain reference; full scanner lifecycle, task identity, auth and client-specific troubleshooting |
| `references/run-guidance.md` | Domain reference; redacted lessons, provenance, review/promotion rules |
| `agents/sonar-evidence.md` | Domain skill's `agents/` directory; portable evidence actor prompt |
| `templates/remediation-cycle-report.md` | Domain skill's `templates/` directory; issue/coverage/cycle/analysis ledger |
| `templates/run-guidance-report.md` | Domain skill's `templates/` directory; reusable sanitized lessons |

Keep existing specialized instructions, linked only when the detected toolchain requires them. Add another specific reference only for a demonstrated need/verified run; no catalog of speculative recipes. No corporate-specific asset required.

Extend current installer mappings in the same transaction to cover both skills and nested assets. Preserve locking, collisions, force/confirmation, regular-file guards, rollback, and unrelated-file preservation. Update package asset inclusion; no second installer or host adapters.

`.agents/skills` is the existing installation convention, not a universal actor registry. Load the actor prompt into a real supported generic subagent. Map implementer/tester/reviewer roles to available host agents; do not require EVCrate agent names. Missing independent-subagent capability blocks this orchestrated route, not ordinary domain-skill routes. `cmd-sonar-remediate` is the skill name; invocation syntax depends on host.

## 5. Project-discovered execution profile

Resolve locally from manifests, project scripts, scanner configuration, tracked CI configuration, installed-tool help and matching official docs. Discovery produces candidates, not permission to execute arbitrary scripts. Ask only for unresolved/conflicting values or materially different tradeoffs.

Record:
- Repository/checkout; branch or PR; SHA; configured source/test roots; exclusions; languages/modules; one or more actual Sonar project targets and module-to-target/report-to-source mappings.
- OS/shell, native runner and tool versions, dependencies/profiles, focused tests, full native verification, smoke scenario, and test applicability.
- Scanner family/version and **ordered lifecycle**: optional preparation/instrumentation, build, tests/coverage, submission/finalization. Prefer project-approved dedicated scanners; use generic scanner only where supported.
- Coverage producer, report format/path, counters/metrics actually provided, freshness/parseability, import parameters, and project-defined thresholds/operators. Test-execution reports are separate from coverage reports.
- Exact server/key/selector; edition/analyzer capabilities; explicit active-status set using server vocabulary; severity/scope filters; gate conditions, quality-profile/configuration identity and new-code period.
- Safe scanner credential mechanism and CLI session binding independently. Never assume one environment variable authenticates every scanner or extract CLI keychain tokens.
- Expected build/scanner writes and network effects, approved commands, N, host roles, evidence location, command/domain-skill/actor/profile versions, and consent for uploads to exact targets.

Examples establish lifecycle differences, not mandatory recipes: a build-integrated scanner may combine verification/upload; another scanner needs preparation before build and submission afterward. Coverage must be fresh **before its importing/submitting stage**, not necessarily before scanner preparation. Native verification may need a separate run if instrumentation changes build policy; .NET `begin`, for example, changes rules and disables `WarningsAsErrors`.

For source identity, record a safe manifest of actual analysis inputs, including relevant tracked/untracked source and non-secret effective configuration. SHA plus tracked diff alone is insufficient. Never collect secret values or hash secret-bearing files for guidance. Recheck inputs after builds/generators/hooks and commits; unexpected source/configuration change invalidates affected review/test evidence. Preserve unrelated edits; no automatic worktree/stash/reset.

Record **requirement/applicability** separately from **availability/result**. Requirement is `required`, `optional`, or explicitly justified `not-applicable`; observation is `available/passed`, `available/failed`, `unsupported`, or `unavailable/misconfigured`. Required-but-unsupported still blocks the gate. Required tests must actually execute and pass. A project with no applicable tests needs a preflight decision and appropriate validation, not fake counts. Missing supported branch coverage is unavailable, not automatically N/A. Missing required coverage blocks success; no threshold invented to fill a gap.

Multiple project targets get independently correlated task/gate/findings/metric evidence. Overall success requires every requested target; one passing target cannot qualify the repository. All targets should analyze the same recorded source checkpoint. Budget N remains global: one round is one coherent edit/review checkpoint plus its required target submissions.

## 6. Bounded procedure

### Preflight and baseline C0

Approve the discovered full local-scanner lifecycle and expected side effects, bind targets/auth/success scope, and obtain N if absent. The new command executes this direct full-scanner route. Existing Jenkins push-to-scan remains separately invoked/authorized; it is not a selectable mode that accidentally also triggers local uploads. If only an external pipeline can scan the project, report that prerequisite and use the existing authorized route without fabricating local qualification.

Choose evidence storage outside the execution checkout or an already-approved ignored location; do not silently edit ignore rules. Capture complete issues/hotspots/gate/metrics. If existing analysis cannot be bound to the current source and configuration, perform the approved verification + actual full upload to establish C0. Baseline does not consume a fix round.

Freeze statuses, filters, target scope, exclusions, quality profiles and gate conditions for comparisons. Changes require an explicit documented scope/configuration change and a new baseline; they cannot count as apparent remediation progress.

### C1..CN

1. **Scan/snapshot:** validate the current checkpoint identity and complete evidence for each target; query all pages.
2. **Fix:** confirm prioritized root causes and callers; implement a coherent scoped batch with behavior-preserving tests where applicable.
3. **Test:** run relevant intended tests/native checks/smoke; record actual results and applicability.
4. **Review:** independent reviewer checks the exact inputs and test evidence, returning terminal findings/disposition.
5. **Apply review fix:** at most one corrective batch within this round; retest affected behavior and independently rereview changed source. Further required source edits consume another round.
6. **Verify and submit:** execute the approved toolchain-specific full lifecycle in its correct order; produce/import fresh applicable coverage and upload real analysis. Tester checks the actual resulting evidence. Reuse identical trustworthy build evidence where safe; separate native verification is allowed when scanner instrumentation changes semantics.
7. **Server verification:** await each submitted compute task's terminal success; bind analysis ID/revision/time and analysis-specific gate where supported; collect complete findings/hotspots/metrics with consistency checks.
8. **Record:** update issue and review status, coverage, identities, deltas, blockers and next action. Stop early only when the full success contract passes.

N counts entered remediation rounds, including failed/incomplete rounds. Persist stage/round; waiting on a submitted task does not consume another round. Resume that known task, never re-upload just because polling is incomplete. A failed build/test/review/rereview/upload/task blocks dependent gates. A round with unsuccessful rereview is recorded incomplete and consumes budget without uploading merely to satisfy per-cycle wording; further corrective edits require a remaining round. Submission is mandatory for checkpoints that pass preceding gates and for final qualification. No hidden retry/correction loop or success inferred from an interrupted actor.

Failed preparation/build/submission needs stage-specific documented recovery. Do not blindly rerun setup or invoke upload-capable finalization as cleanup. After two comparable no-progress rounds, surface root-cause/owner decisions before requesting more scope. Never silently extend N, weaken assertions, lower thresholds, suppress rules, or mutate finding statuses.

### Final F

Independent aggregate code review → separately authorized/user commit if needed → validate clean committed source, relevant history and effective configuration → rerun the correct full project validation/scanner lifecycle → **mandatory actual Sonar submission** → successful exact tasks and matching analysis/gate/full findings/coverage → independent evidence audit.

Here, **clean committed source** means all intended commit-eligible analysis/build inputs match the committed revision; generated inputs must be reproducibly derived from that revision and approved configuration. A globally pristine checkout is not required: preserve unrelated dirty files only when demonstrably outside analysis/build inputs. Relevant uncommitted or unexplained generated inputs block committed-revision qualification.

Recheck after commit hooks and builds. Changed inputs invalidate prior evidence. No implied Git push. Declined commit authorization leaves valid local progress recorded but committed-revision qualification pending. Final is verification, not a free fix round; at exhausted N, new source edits require explicit additional budget.

Outcomes: locally remediated; reviewed; awaiting commit; blocked/incomplete; server-verified residual findings; server-verified success. Exhaustion is not success. Success requires passing applicable tests/checks and review, actual final server evidence, all active in-scope issues resolved, required owner hotspot reviews, and all configured target gates/coverage conditions met.

## 7. Roles and evidence safety

| Role | Owns | Boundary |
|---|---|---|
| Command parent | Profile, N, ordering, decisions, role calls, final ledger | Waits for terminal results before dependent steps |
| Implementer | Root-cause code/tests and scoped corrections | No unrelated cleanup, suppression, implicit commit/push |
| Tester | Applicable native/focused/full validation and coverage evidence | No fake tests/metrics or assumed universal thresholds |
| Independent reviewer | Exact-source review, correction rereview, final evidence audit | Not the implementer; no score-only approval |
| Sonar Evidence actor | Target/auth binding, approved lifecycle submission, task waits, complete server capture, evidence and lessons | No source edits, issue/hotspot mutation, commit/push, tool upgrades, CI/trust changes, secret disclosure |

Actor request: execution profile/version; permitted mode (`snapshot`, `verify-upload`, `verify-final`); input identity; target set; approved ordered commands and effects; scope; round/stage; evidence destination; prior task/analysis where resuming.

Actor terminal result: actual stage/status; commands/results and native applicability; source checks; test/coverage artifact identity/format/metrics; per-target task/analysis/revision/time/gate; complete pagination and capture consistency; evidence paths; blockers; sanitized guidance candidates. Use artifact references, not giant inline reports.

Actor is bounded-write, not globally read-only: build/scanner tools execute plugins/scripts, write artifacts and upload. Prompt policy is not a sandbox. Use supported host restrictions, trusted project tooling and before/after input checks. Credentials are available only through approved process mechanisms, never inspected/disclosed by the actor. If safe authentication cannot be arranged, block rather than put literal secrets in prompts/commands/logs.

Serial builds/scans for one checkout/target set. Parallelism only for genuinely independent read-only review slices with explicit ownership; every required terminal result must arrive before dependent stages.

Normal issue/hotspot queries show mutable current state, not immutable per-analysis findings. Check current analysis identity before/after complete capture; require intended identity and complete pages/totals. Other scans or manual finding/hotspot transitions can contaminate comparisons, including transitions without a new analysis. These checks detect some races, not transactional isolation. Serialize where possible, record collection windows/status changes, and reject unverified snapshots rather than claim task-specific immutable issue lists.

## 8. Report templates

These are schema layouts, not actual measured runs. JSON pages and native artifacts remain authoritative; Markdown is a human index, never reverse-parsed into evidence. Keep raw prior checkpoints intact and private.

### Findings across cycles

| Finding ID | Kind/rule/impact | Target/component/location | Overall/new-code | Root cause | C0 | C1 … CN | Final | Evidence/owner |
|---|---|---|---|---|---|---|---|---|
| One row per actual issue/hotspot key | Actual server vocabulary | Exact scope | Explicit | Code contract | Server status | Local stage + server status | Verified disposition | Raw page/review/decision |

Local stages: untriaged, confirmed, fixing, locally-fixed, tested, reviewed, awaiting-scan, server-verified, blocked, reopened. Keep local stages separate from observed server statuses. Disappearance alone does not prove fixed; query tracked IDs/history where supported to distinguish fixed, accepted, false-positive, moved, out-of-scope and unknown. Add newly introduced IDs; preserve owner-gated hotspot records.

### Tests and coverage

| Checkpoint/target/module | Input/profile identity | Native/focused/full checks | Tests/failures/errors/skips or applicability | Report tool/format/freshness | Line coverage | Branch coverage | Sonar overall/new-code metrics | Review/outcome |
|---|---|---|---|---|---|---|---|---|
| C0, C1 … CN, F | Actual safe input manifest | Actual commands/results | Intended evidence | Native artifact | Provided counters/value/state | Provided counters/value/state | Names/scopes/periods/conditions | Disposition/blocker |

Store native denominators/counters, thresholds/operators, report-source mappings and freshness. Do not combine unrelated languages/modules with incompatible metric definitions. Sonar metrics remain separate from local tools. N/A needs a reason; unavailable/unsupported are not passing values. Never hardcode historical counts or fabricate 100% for a zero denominator.

### Analysis and deltas

| Checkpoint/target | Submission/time | Compute task/status | Analysis/revision | Gate/conditions | Active before→after | New/fixed/remaining/unknown | Pagination/consistency | Evidence |
|---|---|---|---|---|---|---|---|---|
| C0, C1 … CN, F | Actual submission | Exact task | Observed identity | Analysis-bound when available | Stable scope/filter | Stable finding IDs | Pages + collection window/identity | JSON/native logs |

Per-cycle details: IDs/root causes, changed files, tests/smoke, review findings/corrections/rereview, ordered lifecycle and result, metrics, target-specific server evidence, owners/blockers and next action. Run header records agreed profile/success/N/authorizations and current stage.

## 9. Learning from runs without hardcoding projects

Produce a **local run-guidance report on every completed, exhausted, failed or blocked run**. Keep it separate from private raw evidence; no automatic upload to another service or inclusion of raw source/project reports in distributed skills.

| Guidance field | Required content |
|---|---|
| Provenance | Run reference; command/domain-skill/actor/profile versions; observation time; reviewer and outcome |
| Applicability | Language/module mix, scanner family, OS/shell, actual relevant versions, required capabilities; unsupported cases |
| Discovery | Why the runner/scanner/order/report format was selected; configuration evidence without secrets |
| Procedure | Sanitized ordered commands and expected side effects; test/coverage/analysis verification steps |
| Result | What actually worked, failed or remained blocked; evidence references and confirmation limits |
| Lesson | Root cause, effective correction, counterexample/guard, and when not to reuse it |
| Confidence | Each recommendation labeled observed, hypothesized, or validated; documentation versus execution distinguished |
| Proposed improvement | Exact skill/actor/reference/eval section affected; smallest reusable change; approval/promotion state |

Generalize private hosts, keys, branches, paths and identifiers into placeholders. Remove tokens, secret-bearing arguments/environment dumps, source excerpts, customer data and private URLs. Keep detailed raw evidence locally under approved access/retention; sharing sanitized guidance still requires permission. Redacted guidance cannot replace private evidence needed to audit the current run.

Future improvement process: collect local lesson → user/maintainer reviews usefulness/privacy/applicability → validate a proposed rule against relevant documentation and real evidence/counterexamples → approve scoped skill/actor edit plus a consumer-visible behavioral eval → distribute through existing installer. One observed workaround is not universal policy; retain explicit applicability. No self-edit during remediation, hidden network feedback, new telemetry service or automatic learning database.

## 10. Command prompt contract

> Load the sibling sonarqube-test-quality skill and neutral discovery/cycle references. Discover and approve the project's ordered native verification/scanner lifecycle and target set without assuming a language, framework, scanner, shell, report format or version. Ask for maximum N when absent. Bind real implementer, tester, independent reviewer and Sonar Evidence subagents. Establish fresh C0; run at most N bounded scan → fix → test → review → correction → revalidation → real submission/server verification rounds. Record every gate, including failures. Finalize with independent review, separately authorized/user commit if needed, correct full lifecycle submission of that committed source, and exact per-target server evidence audit. Produce the cycle report and local sanitized run-guidance report. Preserve unrelated work. Never commit/push, change tool/configuration versions, mutate findings, create worktrees, alter CI/trust or promote learned guidance implicitly.

Prompt arguments: target context, optional N, optional explicit scope and report destination. No new binary flags. Direct scanner uploads require exact-target authorization; commit/push permissions remain separate. Ordinary local-only/query/report routes do not require N, scanner authentication or remote scanning unless requested.

## 11. Risks and acceptance

Primary risks: analyzer/tool capability gaps; scanner preparation changes native build semantics; unsafe discovered scripts; credentials/TLS exposure; stale/partial/mutable results; multi-target source drift; unbounded corrections; host delegation capability; accidentally treating collected guidance as instruction.

TLS stays client/version-specific and owner-gated. The supplied example's pinned Maven scanner source logs full `MAVEN_OPTS`; blindly moving truststore passwords into it risks disclosure. Vendor guidance versus actual launcher behavior must be qualified for that client. This is an optional example lesson, not a general Maven/JVM requirement. Never bypass TLS or trust unverified certificates.

Implementation acceptance:
- Neutral entry-point description, discovery, actor fields, templates and acceptance rules; existing Java recipes remain optional. No corporate defaults or universal scanner/runtime/tool pins.
- Correct ordered lifecycle, applicable native tests/checks and fresh supported coverage; no forced build/test/XML format. Missing required evidence blocks; justified N/A is explicit.
- Maximum N with bounded review correction and persisted failed/incomplete stages; no free final fix rounds. Missing real subagent results cannot pass.
- Real per-cycle/final scanner submissions and matching per-target tasks/analyses/gates/complete findings. All targets must pass agreed success criteria; no gate-only clean claim.
- Scope/configuration changes invalidate comparisons; hooks/generators/source changes invalidate affected review/test evidence.
- Both skills and all nested actor/templates/references installed safely in one transaction; no native registry/settings writes; existing routes retained.
- Every run produces a private evidence ledger and sanitized reusable guidance candidate, with observed-versus-proposed confidence; no unauthorized sharing or self-modification.

Verification during implementation, **not claimed executed here**:
- Existing focused package tests plus installation/collision/rollback checks across sibling skills and new packaged assets; actual throwaway installation and host discovery/delegation smoke.
- Behavioral evals for distinct lifecycle shapes: build-integrated, standalone scan after native checks, preparation/build/submission, and mixed-module/multiple-target projects. Include applicability, unsupported capabilities, secure-auth gaps, N exhaustion, review corrections, declined commit/upload, failed preparation recovery, stale XML or other report formats, paging races/manual transitions, scope changes and generator drift.
- Approved live runs on available real projects spanning materially different toolchains; real tests/checks, coverage where applicable, uploads/tasks/final audits and guidance collection. Never invent projects/findings/fixes just to fill a matrix. Mark unexercised profiles documentation-backed/unqualified; do not claim every framework is runtime-tested.
- Review sanitized guidance for privacy and usefulness; exercise proposed future rule/eval before promotion. Offline tests/evals do not substitute for real server qualification.

## 12. Sources and next steps

Local: `ext/sonarqube-test-quality/{SKILL.md,README.md,package.json,lib/install.js,references/*,evals/evals.json}`; canonical commands as orchestration examples; user attachment as optional case history.

Primary sources read:
- [General coverage import and formats](https://docs.sonarsource.com/sonarqube-server/analyzing-source-code/test-coverage/overview/)
- [SonarScanner CLI and dedicated-scanner boundaries](https://docs.sonarsource.com/sonarqube-server/analyzing-source-code/scanners/sonarscanner/)
- [.NET scanner ordered lifecycle and build changes](https://docs.sonarsource.com/sonarqube-server/analyzing-source-code/scanners/dotnet/using/)
- [Maven scanner — optional specific guidance](https://docs.sonarsource.com/sonarqube-server/analyzing-source-code/scanners/sonarscanner-for-maven/)
- [Background task processing](https://docs.sonarsource.com/sonarqube-server/analyzing-source-code/background-tasks/)
- [CLI auth/query schema](https://www.sonarsource.com/sonarqube/cli/llms.txt)
- [Client-specific TLS guidance](https://docs.sonarsource.com/sonarqube-server/analyzing-source-code/scanners/scanner-environment/manage-tls-certificates/)
- [Apache Maven JVM options — optional case](https://maven.apache.org/configure.html)
- [Optional historical scanner source confirming MAVEN_OPTS logging](https://github.com/SonarSource/sonar-scanner-maven/blob/4.0.0.4121/src/main/java/org/sonarsource/scanner/maven/bootstrap/ScannerBootstrapper.java)

Next: offer the hard implementation-plan command with this report as continuity context; if requested, create a pending plan. This report is not `plan.md` and authorizes no implementation.

Unresolved design questions: none after the user's choices and language-neutral correction.

Runtime prerequisites: actual requested projects and tooling/configuration; available Sonar analyzers/edition and compatible scanners; host subagents; approved command side effects and secure authentication; applicable tests/coverage; task/query capabilities and capture consistency; scoped commit approval; privacy/retention/sharing policy for guidance. Resolve from tools/configuration/owners on each run, not from the example report.
