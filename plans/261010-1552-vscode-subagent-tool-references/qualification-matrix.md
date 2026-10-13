# Qualification matrix

Status: all execution rows pending. [Plan](./plan.md). This is a runbook, not a result report.

## Environment and evidence contract

Run native rows on Linux and affected Windows Local using the single current supported VS Code/Copilot pair pinned in Phase 01. Prior 1.140.0/0.68.0 observations are research evidence, not an additional supported version. If the incident used an older pair, preserve its evidence and require an operator-approved upgrade for repair acceptance; do not claim historical causality from post-upgrade success. No automatic upgrade authorization.

For each row retain: case ID; candidate/source hash; editor version/commit; extension version; OS; Local target; selected and actual model; agent name and loaded URI; parent/delegation arguments; effective-tool evidence if available; observed tool invocation and result/error; policy decision; outcome; redacted transcript path. Use pass/fail/blocked/not-run, never inferred pass.

Unavailability evidence hierarchy: host effective-tool/debug state > actual rejected call/error > model self-report. Self-report alone cannot establish a missing capability or prove a negative permission control.

Platform gates: each Phase 06 platform row depends on that platform's Phase 05 pass, not completion of the other platform. If Windows is unavailable, finish Linux native/workflow rows and automated checks; Phase 07 may review and hand over the immutable candidate with Windows marked blocked. Overall completion, Windows acceptance, incident closure and deployment remain blocked. Do not substitute WSL, synthetic hooks, metadata or another harness.

## Cases

| ID | Surface / stimulus | Required observable outcome | Owner phase |
|---|---|---|---|
| A01 | Generated Scout and explicit source capabilities | Declared references resolve in recorded host contract; no broad group grants | 04 |
| A02 | Omitted tools / empty / unsupported-only / Task projection cases | Omission stays omitted; explicit denial stays empty; unknowns do not inherit; Task retains delegation | 03–04 |
| N01 | Direct no-shell contract-reader: locate file, find key, read value | Three native capability types exercised; exact non-prompt value returned; no file mutation | 05 |
| N02 | Parent explicitly invokes the same contract-reader | Correct child URI/name and model; same native read/find/search outcomes; no parent-provided answer | 05 |
| N03 | Generated production Scout, direct then delegated | Both paths read/search successfully with production hooks; child reports grounded evidence; Scout leaves fixture unchanged | 05 |
| N04 | Direct and delegated `tools: []` control | Host shows workspace tools absent/disabled; no successful tool calls or fixture changes; prose refusal alone insufficient | 05 |
| N05 | Direct no-child control with agent tool declared but `agents: []` | Host withholds/rejects child invocation because of empty allowlist; no child starts; no nested-setting change | 05 |
| N06 | Task-bearing coordinator and permitted child | Delegation actually succeeds; proves Task output/canDelegate correction did not create accidental leaf | 05 |
| N07 | Explicit edit-capable fixture: create file, replace existing contents, multi-edit | Intended content changes occur through granted native editing tools, without terminal bypass or extra capabilities | 05 |
| N08 | Terminal capability-family fixtures | Benign execution, background output, and termination only for intended source capability; output/terminal IDs handled correctly | 05 |
| N09 | Todo direct versus delegated context | Direct reference resolves if host supports it; child's host restriction recorded as expected, not a plugin failure | 05 |
| N10 | Protected directory and synthetic privacy-sensitive file | Existing deny/approval rules remain effective; no shell fallback; real payload normalization retains operands | 05 |
| W01 | Two disjoint Scout tasks | Both return file/line-grounded findings; parent merges without fabricated missing results; no Scout modifications | 06 |
| W02 | Canonical docs-manager with omitted tools | Inherits permitted editing capability and updates disposable docs with facts from both scouting slices | 06 |
| W03 | Actual `/evcrate-local cmd-docs-update` | Correct Scout calls, docs-reader branch, docs-manager handoff, expected docs outputs and validations complete | 06 |
| W04 | Host refresh/new session after candidate registration | Resolved agent URI/hash points to candidate, no ambiguous stale same-name definition | 05–07 |

## Native prompts

Use the prompts below as task shapes. Substitute fixture folder/key names, not expected values. Fixture values must not be attached, opened into context, or copied into the prompt.

**Reader:** "In the qualification workspace, use native file discovery to find the scoped capability fixture under probe-a, search that file for PROBE_VALUE, then read the matching section. Return relative file path, line numbers, and exact value. Do not modify files, use the terminal, or delegate. If blocked, report the actual error and which operation failed."

**Delegated reader:** "Invoke the custom agent named contract-reader for the task below. Pass only the task and folder scope, not file contents. Return its findings and identify the child invocation. [Reader task]."

**Scout:** same task using exact named `scout`; require native read/search operations even though canonical Scout retains shell intent. Execute once direct and once delegated with fresh values/context.

**Edit control:** "Create the permitted test document with the supplied harmless text, replace its designated existing field, then update two existing fixture fields. Use the native editing tools granted to this control; no terminal or unlisted files. Report changed paths." Verify final bytes independently after the run.

**No-child control:** direct custom agent has a valid delegation tool reference plus `agents: []`; request a harmless child read. Observe the host restriction, not just the agent's willingness to obey.

## Failure classification and action

| Observed evidence | Action |
|---|---|
| Agent URI/version unexpected | Correct qualification registration/collision first; retain original trace |
| Reference absent from host registration | Fix/version-bound adapter contract; do not blame handoff |
| Correct reference resolved but child lacks tool | Capture effective parent/child state and minimal native reproduction for host escalation |
| Tool call reaches hook and is denied | Examine operation identity/parameters and policy; never classify as absent tool |
| Real parameter mismatch rejects benign operation | Approved minimal correction in both TypeScript and runtime-source authorities; paired permitted-access and protected-path regressions, unchanged policy decisions; regenerate and rerun affected rows |
| Model/cost-tier selection fails before tools run | Record model blocker; do not claim a tool-resolution result or redesign model binding here |
| Tool call succeeds but agent says unavailable | Record task/prompt/model behavior separately; do not widen permissions |
| Parent-only workaround succeeds | Operational unblock only; delegated rows remain failed/blocked |

## Security and evidentiary limits

- Tool grants are not an OS sandbox. No-shell controls prove narrow host permissions; production Scout's no-edit result proves observed workflow behavior only.
- Negative controls require effective tool state or a host denial trace; lack of a call alone is inconclusive.
- Real profile registration is a separate explicit operator action. Never enable trust/auto-approval/nested agents to force a passing case.
- Redact raw traces through existing tooling, then manually review; its hash-like secret pattern may redact candidate hashes. Preserve nonsecret candidate identity in the reviewed receipt separately, not by weakening redaction.

## Unresolved questions

- Windows native environment and effective edit-selector expansion remain qualification dependencies.
