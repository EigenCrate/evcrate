# Validation matrix and native runbook

Status: **all implementation validations pending**. This document defines future evidence, not results from planning. Each phase updates its own receipt; final acceptance requires both mandatory native platform columns.

## Evidence classes

- **D — deterministic behavior:** isolated real filesystem/Git and controlled request/stream boundary, repeatable assertions on disclosure, transitions or ownership. No source-text/wording tests, wire-copy assertions or mock echo checks.
- **H — native host:** packaged extension loaded in actual VS Code; exercise commands/hooks/Local UI and observe state/output. CLI extension listing alone is insufficient.
- **L — live model:** authenticated real Copilot request from Local tool handler; exact selected catalog model, response, cancellation and executor continuation observed. No hidden provider model identity claim.

## Native feasibility and end-to-end acceptance

| ID | Scenario / required observable result | Evidence | Phase | Linux | Windows |
|---|---|---|---|---|---|
| G01 | Stable API/types and actual VSIX/extension load without proposal flags | H | 01,08 | Pending | Pending |
| G02 | User-triggered model enumeration/selection/consent; exact model available | H,L | 01,08 | Pending | Pending |
| G03 | Native Local tool invokes selected model and returns critique to same conversation | H,L | 01,05,08 | Pending | Pending |
| G04 | SessionStart context present before first new-session response; right event/envelope/tool name | H | 01,06,08 | Pending | Pending |
| G05 | Full-message token counting/host output handling works within public API | H,L | 01,05 | Pending | Pending |
| G06 | Qualified external Node and shell command survives hostile-looking literal paths | D,H | 01,06,08 | Pending | Pending |
| N01 | Install final VSIX with checkout/other companion absent; configure/status commands usable | H | 07,08 | Pending | Pending |
| N02 | First task gets guidance, explicit #evcAdvisor consultation succeeds, executor remains owner | H,L | 08 | Pending | Pending |
| N03 | Actual stream cancellation reports cancelled, no fake completion/retry | H,L | 05,08 | Pending | Pending |
| N04 | Tool disabled/hooks disabled/unconfigured model diagnosed; no fabricated advice | H | 06,08 | Pending | Pending |
| N05 | Enable/disable/remove and restart/fresh-session behavior matches docs | H | 06,08 | Pending | Pending |
| N06 | Upgrade/repair preserves modified files; orphaned hook limitation explicit | D,H | 07,08 | Pending | Pending |
| N07 | Natural plan/failure/review prompts observed; best-effort behavior stated without guaranteed trigger claim | H,L | 08 | Pending | Pending |

Every **Linux** G row is a Phase 01 go/no-go prerequisite. Windows G rows may run during Phase 06/08 but are mandatory before final completion; Linux PASS is never Windows evidence. Later repeats bind final product to current receipts. If target model unavailable, record BLOCKED and obtain approved alternative; never silently substitute. N07 requires honest observation, not a fixed automatic-invocation success rate.

## Context/privacy behaviors

| ID | Scenario | Required result | Evidence |
|---|---|---|---|
| P01 | Default Git summary + tracked/untracked permissions false | Only changed names/status/counts automatically collected; no patch/hunk headers/file bodies | D,L with synthetic sentinels |
| P02 | Requested full exceeds off/summary ceiling | Effective level narrowed; truthful notice; denied content absent | D |
| P03 | Workspace enables files/disables redaction/raises cap/changes model | User policy remains authority; ignored overrides surfaced | D,H |
| P04 | Text attachment exact path, permissions, membership, dupes | Only authorized named files; no sibling/glob/ignored expansion; duplicate budget not multiplied | D |
| P05 | Traversal, absolute path, symlink/reparse/junction, FIFO, submodule, binary/image | Rejected/withheld under defined policy; no unsafe read or dispatch | D on each OS |
| P06 | Parent repo, nested repo, worktree, unborn repo, staged+unstaged | Scope contained; correct state; failure never implies clean tree | D on each OS |
| P07 | Secret across cap boundary, Unicode/escaped markup expansion | Redact complete bounded accepted source before cap; valid bounded text; no raw fallback | D |
| P08 | Oversized raw source, aggregate limits, zero cap, too-small model context | Bounded resource use, deterministic omission or error; meaningful minimum preserved | D |
| P09 | Root/global rules/preference missing, unsafe, untrusted | Correct origin/trust/caps; no silent Pi HOME reads; no interpretation as trusted directives | D |
| P10 | Git external diff/textconv/fsmonitor/pager and GIT_* injection | No helper/network execution; argv/root/output bounds enforced | D real Git fixtures |
| P11 | Explicit draft includes pasted tool output | Warn it is explicit disclosure; never claim invisible source-policy enforcement | H review + documented contract |
| P12 | Default redaction/settings visible to user | Setup/status/docs show ON deviation and residual risk, no privacy guarantee | H |

Do not use live sensitive credentials to test redaction. Controlled recognizable sentinel patterns only. Provider request captures are test-only or disposable native qualification instrumentation, never shipped raw logging.

## State, lifecycle and errors

| ID | Transition/scenario | Required result | Evidence |
|---|---|---|---|
| S01 | Activate/catalog change/status read | No model request, Git collection or unsolicited workspace mutation | D,H |
| S02 | Invalid input/unsupported workspace/untrusted/disabled | Zero model dispatch; bounded actionable error | D,H |
| S03 | Consent denied/model removed/quota-provider error | No fallback/retry; selected configuration preserved; truthful failure | D; H/L where naturally exercisable |
| S04 | Cancel during collection/token count/pre-send/stream | Children/stream stopped, active slot released; pre-send zero calls | D + native N03 |
| S05 | Concurrent request/late chunks/exception in preparation | BUSY or exact documented error; no response cross-contamination; next request works | D |
| S06 | Trust/policy/model/enablement change in flight | Pre-send abort; sent request cancellation attempted; no claim already-sent data recalled | D,H |
| S07 | Response empty/oversized/partial then failure | Empty error; capped response incomplete; failed/cancelled never ok | D |
| S08 | Request deadline elapsed | TIMEOUT and cleanup, no implicit resend | D |
| S09 | Advisor reply contains commands or requests more files | Text only; no execution, automatic file read, recursive call or permission change | D,L workflow observation |

## Startup ownership and recovery

| ID | Scenario | Required result | Evidence |
|---|---|---|---|
| O01 | Enable prompt cancelled | No managed file/state mutation | D,H |
| O02 | Unowned destination/shared existing hooks/settings | Refuse collision; unrelated files unchanged | D |
| O03 | User edits owned runner/manifest/snapshot | Repair/removal refuses changed data; precise manual review guidance | D,H |
| O04 | Interrupted setup after each step | No premature active manifest; recover recorded owned state; no unsafe adoption | D |
| O05 | Interrupted update/removal + Windows locked file | Retained receipt/diagnostic, no successful false claim or unrelated deletion | D on each OS |
| O06 | Two windows same root / foreign profile | Serialized lock/ownership refusal; no last-writer-wins receipt corruption | D,H |
| O07 | Missing/corrupt/disabled snapshot or foreign event | Runner {} + exit 0; no inference/transcript access/blocking | D real child process |
| O08 | Oversized stdin or malicious event/path | Bounded rejection; no command or filesystem escape | D |
| O09 | Extension disabled/uninstalled without cleanup | Conditional guidance may remain; tool absence honest; documented cleanup not automatic fiction | H |
| O10 | Hooks disabled/excluded/enterprise-restricted | Explain prerequisites; do not enable settings or evade policy | H |
| O11 | Unrelated EVCrate plugin also active | No duplicated advisor injection owned by this extension; existing hooks retain behavior | H |

## Packaging and repository gates

- Build: proposed `npm run build:vscode-advisor`.
- Focused deterministic suite: proposed `npm run test:vscode-advisor` (must not call providers).
- Package: proposed `npm run package:vscode-advisor`; command creates VSIX outside package inputs, records SHA-256.
- Root regression: existing `npm test`, `npm run release:check`, `npm run distribute:check` after integration. Root lint command is echo-only; do not cite it as validation.
- Source hygiene: no generated projection/registry/target mutation required by this standalone extension, no change to core seven asset release policy.
- Artifact inspection: no credentials, context/advice logs, local snapshots, fixtures, caches, unexpected executable dependencies or proposed API flags.

These script names for the new extension are planned interfaces, not commands available during planning.

## Native operator runbook

1. Create disposable local root and profile/extensions dirs on target OS; install the final private VSIX and authorized Copilot extension. Use real UI, no authentication bypass.
2. Record code version+commit, Copilot version, OS/arch, Node/Git/PowerShell versions, selected executor/advisor IDs and VSIX SHA-256.
3. Configure advisor and user privacy choices. Cancel once to prove no state mutation; then approve. Do not send real source code in connectivity checks.
4. Enable workspace with preview/consent. Inspect owned hook and ensure existing hooks/settings unchanged.
5. Start a new Local Agent session. Submit a substantive review task; inspect supported debug context for startup guidance placement. Save sanitized evidence reference.
6. Invoke `#evcAdvisor` explicitly with objective, flawed candidate and recorded synthetic checks. Observe native tool call and advisor return in same chat. Executor remains responsible for edits/checks.
7. Exercise summary/off/full and explicit file consent with non-secret fixtures; pair native observation with application-boundary deterministic request assertions.
8. Cancel a real request. Exercise tool/hooks-disabled and unavailable-model paths. Record unprovoked provider/quota error cases as covered by deterministic tests, not falsely observed live.
9. Disable, repair conflicts, remove and uninstall. Inspect orphan hook behavior and ownership preservation.
10. Clean scratch installations/hooks. Complete receipts and final acceptance with candidate digest. Any runtime change requires new digest and rerun of affected gates.

## Receipt format

Each receipt records: scenario ID; platform; status PASS/FAIL/BLOCKED/NOT-APPLICABLE; exact candidate/hash; host and provider versions; prerequisites; action; expected/observed state; sanitized evidence path; reviewer; remaining risk. Required two-platform/native rows cannot be marked not-applicable to avoid a blocker.

No receipt exists until scenario is actually executed. Final completion is all mandatory rows accepted, not an implementation percentage or compiling package.

## Unresolved questions

No remaining scope decisions. Linux-first implementation requires Linux native proof and authorized Copilot access; final completion requires both native environments. Actual API/Preview behavior is settled by the corresponding Phase 01/06/08 gate, not assumed by this matrix.
