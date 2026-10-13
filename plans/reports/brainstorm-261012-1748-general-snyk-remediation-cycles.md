# General Snyk remediation: command skill, specialist actor, bounded attempts

## Decision and artifact

Brainstorm only. No implementation, target remediation, scanner authentication, or dependency edits authorized by this report.

User-selected requirements:
- Update the existing `ext/snyk-expert/` bundle; no executable orchestration runner.
- Add extension-local `.agents/skills/cmd-snyk-remediate/SKILL.md`. Use `cmd-*`, not `evc-cmd-*`; canonical EVCrate commands are structural references, not integration targets.
- Ask for a positive maximum N; stop early. N caps coherent owner-set mutation attempts, not full sweeps across every finding.
- Automatic steps only under existing execution/change policy; exact human gates for risky changes.
- Maintain every first-scan finding and occurrence, with status after every attempt.
- General, language/framework-neutral Snyk dependency remediation. The supplied npm/TypeScript report is a case study, not the supported-scope definition.
- Final review executes the real authenticated Snyk CLI for the resulting state. Local dependency inspection, package-manager audit, fixtures, and cached reports are not substitutes.

Eventual deliverable: new command-style skill, consistent updates to current actor/three skills/common references, reusable Markdown ledger templates, installer inventory, usage documentation, and operational qualification evidence. This report specifies the design; it is not that implementation.

## Problem

The bundle already separates CLI operations, dependency remediation, and read-only upgrade review. Missing: main-owned bounded orchestration, cross-attempt ledger history, explicit live final-review ownership, and a genuinely ecosystem-neutral procedure-binding path.

Copying `scan → fix → test → review → rerun` literally has defects:
- Compatibility review occurs too late if it follows edits.
- One agent per stage adds context handoffs without adding expertise to ordinary command execution.
- Repeated full scans at both the end and beginning of adjacent attempts waste work when evidence is still valid.
- A clean security scan can hide unresolved tests, runtime compatibility, licensing, or packaging checks if summarized as one success flag.
- N is meaningless as a mutation bound if each cycle may change unlimited independent owners.

## Repository evidence

| Surface | Observed constraint |
|---|---|
| `.agents/agents/snyk-expert.md:8,18–30` | Main owns human decisions and execution boundaries. Actor cannot delegate, open approval UI, or self-approve. |
| `snyk-fix/SKILL.md:23–43` | Analyze is read-only; exact approval is baseline-bound; review precedes edits; coherent sets require graph/consumer/post-scan proof. |
| `dependency-upgrade-review/SKILL.md:8,25–45` | Assesses exact supplied proposals; does not select replacements, mutate, execute builds/scans, or authorize writes. |
| `snyk-cli/SKILL.md:20–28,47–60` | Setup and scans are separate; SCA/Code authority differs; exits/artifacts/coverage must be retained. |
| `snyk-fix/references/finding-and-owner-contract.md:35–61` | Existing lossless source/occurrence and bidirectional owner mapping; grouping must not discard duplicates. |
| `snyk-fix/references/verification-and-results.md:34–60` | Per-set verification, independent statuses, and separate post-only findings. |
| Current Node/Maven procedures | Concrete reusable procedures exist; current entrypoint restricts mutation to these ecosystems. Generalization therefore requires a real contract cutover, not just a new description. |
| `lib/inventory.js:7–18` | Explicit eleven-file inventory. Every new installed skill/reference must be added. |
| `package.json:13–19` | `.agents` is already included in package files. |
| `tests/workflow-qualification.test.mjs:32–118` | Checks expected prose/skill phrases, not model execution or approval enforcement. |
| `tests/cli-and-packaging.test.mjs:78–151` | Existing tests exercise CLI installation/packaging; do not establish workflow behavior. |
| `docs/usage.md:8–16` | Installer examples incorrectly use a project path as `--target`; actual CLI uses `--target agents --directory <root>`. Correct while updating this guide. |

Paths above are relative to `ext/snyk-expert/` unless stated otherwise.

Canonical examples inspected: `.evcrate/source/.claude/commands/evc-cmd-fix-x-hard.md` and `evc-cmd-code-x-auto.md`. Reuse clear arguments, responsibilities, sequence, and stage records. Do not copy unconditional delegation, score-based auto-approval, automatic corrective edits, or auto-commit.

## Alternatives

| Approach | Value | Cost/risk | Decision |
|---|---|---|---|
| Main loads task skills directly; no specialist actor | Fewest handoffs; sufficient for straightforward execution | Main repeats specialist ownership/compatibility reasoning; weak use of current actor | Supported explicit-read fallback, not primary design |
| Command/main coordinates; actor owns one bounded specialist change set | Clear human ownership; specialist used for substantive dependency reasoning; preserves portable skills | Requires explicit unfinished-verification handoff and ledger discipline | Recommended |
| Actor/agent per scan, proposal, fix, test, review; or executable runner | Separate workers or code-enforced state could serve a larger product | Redundant trivial delegations; new host/approval interfaces; more failure modes | Reject for this scope |

Per-owner-set attempts chosen over batch sweeps. Different findings can share a controlling BOM, parent, resolver, lockfile, or coupled family: set boundaries follow actual control and reviewed graph effects, not one package name per attempt.

## Recommended ownership

| Component | Owns | Must not own |
|---|---|---|
| `cmd-snyk-remediate` in main session | Intake/N, effective authority, stage order, human gates, attempts, ledger updates, live Snyk final review, next action | Alternate remediation rules, guessed manager commands, invented scan evidence |
| `snyk-expert` actor | Lossless owner reasoning, exact candidate selection, procedure binding, read-only compatibility assessment, one authorized set, graph/test/consumer verification | Nested delegation, approval UI, approving itself, declaring fixed before main's live review |
| `snyk-cli` skill | Executable/setup/scan procedure, product scope, actual exits/private artifacts, safe network/TLS handling | Dependency edits or implicit monitor/source-upload authority |
| `snyk-fix` skill | Common dependency remediation contract, owner/approval/change/recovery gates, ecosystem procedure binding | Language/framework defaults or blanket fixers |
| `dependency-upgrade-review` skill | Exact proposal assessment using supplied graph/runtime evidence and official release metadata | Candidate selection, target execution, mutation, or authorization |

Skills are procedures, not separate workers. Invoke the actor once for meaningful bounded specialist work, not once for each CLI command. A gated proposal needs a main-collected decision and a resumed `approved-remediate` invocation; that is a necessary handoff, not redundancy. Reuse unchanged assessment evidence only while its complete proposal/baseline identity remains valid.

Native actor registration and command discovery depend on the host. If unavailable, main explicitly reads the installed actor, selected skills, and required references and executes their procedures inline. Report that fallback honestly; it is not an independent reviewer or an OS sandbox.

## General procedure binding

Common orchestration is independent of language, framework, and dependency-manager names. At runtime:
1. Discover actual manifests, lock/resolution artifacts, project topology, toolchain, and ownership from the authorized repository.
2. Establish deployed Snyk product/manager/format support using applicable official documentation and actual expected-project results. A generic language list does not prove a specific parser or product capability.
3. Use existing detailed procedures when applicable; their safeguards remain required. They are not an ecosystem allowlist or mandatory reads for unrelated projects.
4. For another manager, establish a complete pre-edit procedure record from repository conventions, official manager/Snyk documentation, and authorized observations. No ad hoc mutation while procedure details remain unresolved.
5. Review the procedure and exact proposal before any update. Approval cannot supply missing support, commands, artifact access, or verification.

Required procedure record:
- Manager/version/executable and runtime/platform; controlling authored files/fields and effective values.
- Exact dependency-owner scope, shared control, modules/workspaces/profiles, generated artifacts and allowed paths.
- Native authored-field update and generated-resolution regeneration procedure; literal command/cwd/options, side effects, script/plugin/download authority.
- Observed baseline graph and controlling-field evidence; planned post-resolution inspection and expected results.
- Native build/tests and concrete affected-consumer checks. No universal TypeScript compiler, Maven goal, framework probe, or release runtime assumption.
- Exact supported Snyk command and coverage expectations; final-review artifact authority.
- Full baseline identity, single writer, protected user changes, owned-edit/recovery boundary, and precise gaps.

Generated artifacts are regenerated with the native tool; authored inputs follow the repository's native convention. Do not impose npm's update syntax on other ecosystems. Missing concrete procedure blocks that proposal; general orchestration does not claim universal operational qualification.

Dependency-owner remediation covers Snyk Open Source vulnerability and license-policy findings. Keep Code source findings separate; dependency updates are not a general fixer for Code, Container, or IaC results. No automatic expansion into other Snyk products.

## Attempt process

### Initialization, outside N

Main binds target, product/org/endpoint/policy, manager/project scope, permissions, artifact location, and baseline identities. Ask for positive integer N if absent; do not silently choose unlimited execution. Installation/authentication/trust-store changes remain separate setup requests.

Execute a real baseline Snyk CLI scan or explicitly bind supplied current authentic scan evidence. Build the immutable source/occurrence ledger before remediation. Capture graph and relevant pre-edit verification outcomes using safe authorized commands. Missing baseline checks block edits.

### One coherent owner-set attempt

1. **Select and assess:** actor maps current outstanding findings, prioritizes supported proposals by finding impact and change risk, selects exact candidates, binds procedure, and loads read-only upgrade review. Report deferred/unmapped findings; never silently drop them.
2. **Gate:** compatible patch/minor requires affirmative evidence and existing change policy. Major/breaking/uncertain/license-policy/runtime/scope changes require exact main-carried human approval. Shared-resolution effects belong in reviewed intent.
3. **Apply:** recheck full baseline and proposal. Increment `attempts_started` before the first authorized operation that can change dependency inputs or resolution state, including native update commands that may alter generated artifacts before failing; apply at most one coherent owner set, preserving user changes. Failed/rolled-back attempts still count. Separately authorized baseline observations are not remediation attempts.
4. **Locally verify:** inspect actual controlling fields/generated artifacts/resolved graph, native tests/build and affected-consumer behavior. Actor returns the observed changed state and command evidence. Successful handoff remains **local verification complete; Snyk verification pending**, not `fixed`/`completed`.
5. **Live final review:** main uses `snyk-cli` to execute the real authenticated same-scope Snyk command against the resulting state; retains actual exit, original private output, hashes, timestamps, coverage and errors. Check relevant state around the scan because resolution/build execution may itself alter it.
6. **Reconcile and record:** main compares original/latest findings and every claimed path, reviews graph/behavior evidence and new risks, appends all ledger observations, and decides next attempt or stop. No next set before this gate completes.

The last live final-review scan can also be the terminal scan if it observed the actual terminal state and nothing relevant changed afterward. No duplicate scan solely to change the stage label. Rollback, generated-state drift, policy/config changes, expired/incomparable evidence or other relevant changes require a fresh scan. A no-mutation run must still finish with a real final-review CLI execution; its initial scan may serve both stages only when performed for that unchanged terminal state and fully inspected as final review.

“Snyk post-scan” is not dependency resolution verification. Both are required. Local dependency trees/lockfiles/BOMs establish resolved inputs; the real CLI establishes Snyk findings within approved scope.

### Counting and pauses

- N bounds mutation attempts, not agent calls, read-only reviews, setup, or approval dialogs.
- Bind N and `attempts_started` to the remediation session's retained run record. Approval handoffs, resumed invocations, and context restarts must recover the same count from history, never reset it. Unknown session history blocks further mutation; increasing N requires a new explicit operator decision.
- Pausing before any mutation consumes no attempt. Resume same prepared proposal only after exact approval and full baseline recheck.
- Once a mutation attempt starts, another corrective change set is another attempt; re-entry/rollback cannot give free attempts.
- Record pauses/revisions separately so they remain visible even without a consumed attempt.
- Never repeat an unchanged unsuccessful proposal with unchanged evidence. Stop for no actionable progress; N is not permission for blind retries.
- Rejected/blocked proposals remain visible. Independent fully supported proposals may proceed under their own authority; global baseline/permission/verification failures stop execution.

### Failure and completion

Required graph/build/test/runtime failures stop remediation. Unchanged baseline failures explain provenance; they do not pass verification. Do not fix unrelated assertions, disable tests, or broaden scope automatically.

After failure, final-review scanning is permitted only when a concrete supported safe diagnostic path and execution authority are explicitly bound. This diagnostic branch must be reflected in the procedure, not smuggled in by the wrapper. A clean diagnostic scan cannot clear failed validation or authorize continuation. If the live scan is unsafe/unavailable/unauthorized, report **final review incomplete**; never substitute local evidence.

Scanner exit 1 is completed findings, not an execution failure. Exit 2/3, unexpected exits/signals, malformed/missing required outputs, or expected-project omissions mean incomplete review. Preserve vulnerability and license dimensions separately.

Preserve existing overall statuses: `analyzed`, `blocked`, `needs-approval`, `partial`, `completed`. Add next-action/stage/stop-reason fields rather than overloaded new overall statuses. `completed` does not imply zero findings; residual findings/acceptance remain explicit. A zero-findings claim requires the real same-scope scan. `fixed` requires baseline presence, supported graph change, affected-consumer verification, and comparable post-scan evidence across every claimed path. No unresolved required checks become accepted merely through approval.

## Ledger templates

These are templates, not fabricated records from the supplied run. Extend existing source/occurrence contracts; do not build a competing parser or ledger convention.

### Immutable first-scan inventory

One row per actual source record; retain every ordered occurrence separately in the existing occurrence table. Local labels are references, never invented advisory IDs. Preserve raw records/unknown fields at approved locators.

| Record / source locator | Advisory IDs / aliases | Type | Raw severity / policy level | Dependency coordinate / reported version | Scope | All occurrence references | Owner/control evidence | Initial observation |
|---|---|---|---|---|---|---|---|---|
| `<scan hash + actual source key>` | `<observed IDs or unknown>` | `<vulnerability/license/unknown>` | `<raw value; not invented CVSS>` | `<coordinate/version>` | `<project/module/profile/workspace>` | `<complete ordered occurrence refs>` | `<owners or explicit unmapped gap>` | `<present/not-reproduced/incomparable/unknown + evidence>` |

Never delete or rewrite initial source facts when an advisory disappears. Missing original artifacts mean explicitly incomplete first-scan accounting, not reconstructed rows from a count.

### Append-only finding observations

Append an observation for EVERY original record after every attempt, including unchanged/unattempted records. New observations get a separate post-only inventory and link into later history; never insert them into scan zero. Record `post-only; cause established/unknown` independently of disposition. Attribution to an update requires graph/scope/database evidence; only established introduction permits `newly-introduced`.

| Attempt | Original/post-only record ref | Current dependency/path evidence | Snyk observation | Proposal/action state | Validation state | Disposition | Evidence / next action |
|---|---|---|---|---|---|---|---|
| `<1..N>` | `<stable record ref>` | `<all covered/uncovered paths>` | `<present/absent/incomparable/failed-unavailable/unknown>` | `<unattempted/gated/rejected/deferred/applied; proposal+decision refs>` | `<passed/failed/not-run/unknown; check refs>` | `<fixed/remaining/blocked/unverified; newly-introduced only with established cause>` | `<graph/runtime/live-scan refs, post-only cause established/unknown, drift, reason and owner>` |

An advisory's absence and a path's disappearance are separate observations. Keep license acceptance/rejection as a separate decision, not a vulnerability fix. A current-status view may be derived from the latest observations; history remains append-only.

### Attempt/stage summary

| Attempt / pause | Coherent proposal and baseline | Decision reference | Changed paths | Graph / consumer checks | Live Snyk command / exit / artifact | Stop/continue reason |
|---|---|---|---|---|---|---|
| `<attempt number or prewrite pause>` | `<exact intent and state refs>` | `<eligible policy/exact approve/reject/pending>` | `<owned actual paths or none>` | `<observed checks and limits>` | `<actual command+scope, exit, private locator+hash; or not-run reason>` | `<next supported action, missing prerequisite, N exhausted, verified closeout>` |

Store reports only in authorized access-controlled locations, not automatically in public version control. Command-stage records distinguish planned from executed actions. Display full finding status after each attempt; counts never substitute for rows. Large ledgers may use linked sections without truncating coverage.

## Analysis of the supplied real-run guide

User-reported observations are accepted as reported; no rerun performed to confirm them. They are not independently captured target artifacts in this session. Exact first-scan records, graph outputs, approval artifacts and attempt chronology were not supplied; do not invent them.

| Reported fact | Workflow lesson / truthful limit |
|---|---|
| Final `snyk test --org=sl-asia --file=package.json --dev`: exit 0, zero findings, 184 dependencies | Scoped SCA cleanliness at that time; not all projects/products/policies or validation success. Values are case evidence, never defaults. |
| Approved Vitest/coverage 3.2.7 → 4.1.11 | One coupled set, not two independent attempts. Review exact upstream compatibility before editing. |
| Vite 8 resolution introduced two medium MPL-2.0 policy findings; approved Vite 7.3.6 resolution removed flagged packages | Preserve post-only license rows and actual graph evidence. License-policy findings are not security severity or universal prohibition of MPL. Do not infer exact source IDs or all paths. |
| Typecheck passed; event-handler tests 20/22 with same two log failures | Record unchanged failures and their evidence, never claim full suite pass. Current strict verification gate would stop/leave partial, not silently continue. |
| User-commented invoke tests preserved | Preserve user changes; skipped coverage remains a limit, not a remediation action. |
| Direct `node esbuild.config.mjs` local bundle passed; destructive prebuild/copying postbuild not blindly run | Safe local evidence; not equivalent to actual deployment packaging. Applies generally to script/plugin side effects. |
| esbuild lifecycle `allowScripts` warning | Local binary use does not establish clean installation/CI script policy. Review exact package/script/version and narrow approval; do not enable all scripts. Future CI failure is a risk, not an observed fact. |
| Local Node satisfies Vite engine range; CI/deployment runtime unverified | Distinguish toolchain runtime from application deployment runtime; bind actual affected environments. Unknown does not mean incompatible. |
| No TLS failure observed | Generic client-specific troubleshooting only; never label it an incident in this run. |
| No monitor/deployment/commit/suppression/blanket fixer | Preserve these authority exclusions in the common workflow. |

This run demonstrates useful remediation observations but does not prove end-to-end verified fixes or release readiness under the current contract. Exact esbuild advisory/fix path is not supplied; retain the reported version without inventing an issue record.

## Network/TLS guidance placement

Add a troubleshooting section to the existing CLI reference rather than a default stage or new agent:
- Identify the failing process, endpoint and actual installation/runtime first.
- Approved proxy routing is distinct from certificate trust. Never bypass TLS verification.
- npm `cafile`, Node extra/system CA, and a standalone Snyk executable are not universally interchangeable trust settings.
- Existing setup authority must cover configuration/trust changes. Restore temporary settings without erasing pre-existing operator configuration.
- Secure diagnostics only when authorized; no automatic `-d`, token logging, proxy credentials, private keys, or private report upload.
- Verify per-version behavior. OS enterprise trust configuration is not proof that every Snyk distribution consumes that store.

Official docs checked: Snyk test supports vulnerability/license checks, real exit handling, manager-specific `--dev`, immutable file-output workflows; proxy docs establish routing/SSO, not universal CA loading. Node documents startup-only `NODE_EXTRA_CA_CERTS` and explicit `ca` override behavior; `NODE_USE_SYSTEM_CA` introduced in 24.6.0/22.19.0. These are version facts, not this target's TLS evidence.

## Touchpoints and implementation constraints

- New `ext/snyk-expert/.agents/skills/cmd-snyk-remediate/SKILL.md`: concise entrypoint, host-neutral input handling, main-owned orchestration, references to existing contracts. No assumed `$ARGUMENTS` expansion or native slash registration.
- Existing actor and three skills: neutral scope, required applicable procedure, pre-edit procedure binding, single-set limit, unfinished actor verification handoff.
- Existing finding/verification references: first-scan inventory/history/stage templates, independent license dimensions, main-owned live scan gate and terminal-state checks. Keep one source of truth for templates.
- Existing Node/Maven references: retain applicable protections; update post-scan handoff consistently so common execution neither skips nor duplicates it.
- `lib/inventory.js`: install the new asset and any genuinely necessary bundled references; no installer architecture changes.
- `README.md`, `docs/usage.md`, repository `docs/snyk-expert-cli.md`, changelog: resource tree, correct CLI examples, attempts/approval/ledger workflow, general-scope qualification limits.
- `evals/evals.json` and relevant tests: update real acceptance scenarios. Replace phrase-pinning/incidental wording tests rather than adding new magic strings. Preserve behavioral installer coverage.
- Canonical command files, registry, seven target projections, package publication, native host adapters, deployment and Git changes: out of scope.

## Observable acceptance / qualification

1. Installed command skill resolves the existing actor/skills/references from the installed resource root, not authoring checkout or target cwd. Package/installer inventory includes it; unrelated files preserved.
2. Main requests/binds positive N; trace proves at most N started mutation attempts. Failure/rollback count; approval pause/resume cannot grant another free attempt. Initial clean run has zero mutation attempts.
3. Trace proves exact review-before-edit and no gated writes before current-baseline human approval. Rejection/revision/drift preserves target work and does not broaden intent.
4. Every source record and duplicate ordered occurrence survives; every attempt appends status for every original finding. New findings retain separate first-observation provenance. Missing source data remains incomplete.
5. Resolved graph checks and native consumer validation match detected tools, not a language/framework default. Demonstrate existing applicable procedures and at least one available Snyk-supported manager outside the current two procedure families; state exactly what was qualified.
6. Shared lockfile/BOM/resolver effects stay within reviewed intent. Unresolved procedure blocks mutation. No automatic framework migration, exclusions, ignores, forced fixer, or unsupported child pin.
7. Each completed attempt's final review actually invokes authenticated Snyk CLI with approved scope and fresh output, inspects expected-project coverage, and reconciles results. No local/mock/cached result stands in for this stage.
8. Live scan absence/failure, partial multi-project output, rollback after scanning, test/runtime failure and scanner/policy drift cannot yield false fixed/clean/completed claims.
9. A clean diagnostic scan after failed tests remains partial; no silent continuation or disabled tests.
10. No secrets, TLS bypass, source-upload expansion, monitoring publication, deploy, commit or push.

Installer/link checks establish resource delivery only. Text fixtures establish specification coverage only. Behavioral qualification requires actual host/model execution, observed command/mutation/gate traces, approved isolated target fixtures, scanner entitlement/authentication, registry access and real scan evidence. Do not build a toy state machine and call it agent proof. No universal multi-host or ecosystem support claim follows from these checks.

## Verification performed in this brainstorm

- Read mapped actor/skill/reference/command/installer/test surfaces; two read-only agents returned terminal reports: `CommandQualificationMap`, `GuideProcedureReview`.
- Executed `node ext/snyk-expert/bin/install.js --target agents --directory /home/loidinh/WS/evcrate --dry-run`: exit 0; eleven resources planned, output states no files written. Current installer surface exercised, not the proposed command.
- Read official scanner/proxy/npm/Node documentation. docs-seeker lookup returned documentation-not-found; direct official sources used. No support inferred from a non-substantive index.
- Advisor reviewed original and revised designs; adopted procedure artifact, complete identity reuse, attempt counting, pending live-scan handoff, terminal-state and evidence-limit corrections.
- No test suite, authenticated Snyk target scan, package update, installer write, or runtime qualification performed. External run observations remain user-reported.

## References

- [Snyk test command](https://docs.snyk.io/developer-tools/snyk-cli/commands/test)
- [Snyk proxy configuration](https://docs.snyk.io/developer-tools/snyk-cli/configure-the-snyk-cli/proxy-configuration-for-snyk-cli)
- [Snyk CLI environment variables](https://docs.snyk.io/developer-tools/snyk-cli/configure-the-snyk-cli/environment-variables-for-snyk-cli)
- [npm configuration](https://docs.npmjs.com/cli/v11/using-npm/config)
- [Node extra CA](https://nodejs.org/api/cli.html#node_extra_ca_certsfile)
- [Node system CA](https://nodejs.org/api/cli.html#node_use_system_ca1)

## Next step and unresolved questions

User selected **No — conclude brainstorm**. No implementation plan or bundle implementation created. Future implementation requires a separate request; live qualification depends on authorized consuming projects, host interaction, registry access and Snyk credentials/entitlements. No secrets should be supplied in chat.

Unresolved questions: none for this brainstorm. Implementation and runtime qualification remain unperformed, not promised.
