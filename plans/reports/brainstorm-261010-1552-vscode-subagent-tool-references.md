# Brainstorm: VS Code subagent tool references

## Decision and status

- User selected **central mapping correction**: correct VS Code agent-frontmatter references in the existing adapter, preserve intended permissions, require native qualification.
- Brainstorm only. No implementation, generated-file edits, editor configuration changes, or plugin installation performed.
- Current checkout is incompatible with inspected host reference registrations for Read, Glob, and Grep. This is not yet proof of the cause of the reported Windows incident.
- Parent performs read-only scouting while delegated Scout remains unqualified. Workaround is not acceptance of the permanent repair.

## Problem and requirements

Five delegated Scouts reportedly could not access workspace tools during `/evcrate-local cmd-docs-update`; the parent could. The original report verified source/installed declarations and a publish audit, then prioritized runtime handoff investigation.

Missing distinction: emitted model-facing tool names are not necessarily valid agent-frontmatter tool references. The generated definition and audit derive from the same mapper. Agreement between them proves projection consistency, not host compatibility.

Final artifact now: this agreed decision report. Future artifact: corrected VS Code projection, affected contract coverage and qualification evidence, updated documentation. No new extension, runtime broker, or permission subsystem.

Required behavior: direct and delegated Scout can locate, search, and read permitted workspace files; explicit restrictions remain effective; documentation workflow obtains grounded scouting results and completes its docs-manager handoff.

## Verified evidence

### Repository

- `src/adapters/vscode/metadata-tools.ts:1-14`: maps Read to `read_file`, Glob to `file_search`, Grep to `grep_search`; the same map also covers edits, shell, delegation, and todos.
- `src/adapters/vscode/agents.ts:82-92,130-137`: writes mapper output directly to frontmatter and audit. `agents: []` follows missing delegation capability; it is not a filesystem restriction.
- `.evcrate/source/.evcrate-vscode/com.github.copilot/agents/scout.agent.md:4-12`: explicit mapped tool list, `agents: []`, `model: haiku`.
- Current Scout audit maps `manage_todo_list`; dropped tools are MCP resource tools, WebFetch, and WebSearch. This differs from the supplied incident report, which lists TodoWrite as dropped. Preserve incident-version attribution rather than rewriting historical evidence as current state.
- `src/adapters/vscode/references.ts:203-215`: transforms paths/references and TodoWrite wording, but Scout's body still names Glob, Grep, Read. Generated docs-update still mentions Task and Explore. Instruction portability is a separate concern, not proven root cause.
- `src/adapters/vscode/policy.ts:198-272`: unqualified operations and broad searches can be denied; privacy-sensitive reads can require approval. A denied call is different from an absent tool.
- `tests/fixtures/vscode-local/native-plugin/com.github.copilot/agents/contract-reader.agent.md`: declares `read_file`, with `disable-model-invocation: true`. Not an ordinary delegated-reader positive control unless invocation eligibility is deliberately configured.
- Existing qualification test inspected exercises fixture materialization, hook behavior, and evidence handling. Those checks are not proof of native Scout delegation.

### Installed host and pinned source

Observed `code --version`: VS Code **1.140.0**, commit `07f806f999227108933c2e30515b26eecc1fda74`, x64. Bundled Copilot Chat package: **0.68.0**. Local Linux installation; not the incident's Windows installation.

Installed `/usr/share/code/resources/app/extensions/copilot/package.json` contributes:

| Capability | Current emitted name | Registered qualified reference | Other accepted contribution references |
|---|---|---|---|
| Read | `read_file` | `read/readFile` | `readFile`, legacy `search/readFile` |
| Glob | `file_search` | `search/fileSearch` | `fileSearch` |
| Grep | `grep_search` | `search/textSearch` | `textSearch` |

Pinned host `getToolAliases` / `toToolAndToolSetEnablementMap` match qualified references, simple reference names, and declared legacy aliases. They do not generally translate model-facing snake_case names.

Pinned `runSubagentTool.ts` resolves a named custom agent's explicit tool list through that enablement function and passes the resulting per-tool flags. It also explicitly disables todo management for subagents. Current official Local documentation describes this todo restriction.

[INFERENCE] A parent with valid selected tools and a custom Scout with unrecognized explicit references can exhibit exactly the reported asymmetry without losing tool grants in transit. Still requires qualification on the affected host; active profile, selected definition, extension version, and invocation trace are unverified there.

## Verification exercised

- Read relevant repository and generated artifacts, installed host contribution metadata, current official docs, and source pinned to the local editor commit.
- Ran `code --version` successfully.
- Ran a read-only Node smoke importing the actual `mapAgentTools` from TypeScript and comparing Read/Glob/Grep output against installed tool reference names, aliases, and tool-set membership.
- Smoke result: all three emitted names missed the accepted references; their qualified replacements matched the contribution metadata. All assertions passed.
- Node emitted a package module-type warning while loading TypeScript. No changes made to suppress it; unrelated to the finding.
- Smoke checks metadata and the inspected resolver rules, not an actual native chat session or a complete loaded host registry.
- No native direct/delegated chat, Windows reproduction, build, automated test suite, or full docs-update run performed. No throwaway files created.

## Evaluated approaches

| Approach | Pros | Cons / decision |
|---|---|---|
| Correct explicit references centrally | Fixes demonstrated incompatibility; maintains narrow intent; reuses adapter | Requires shared-map review and native qualification. **Selected.** |
| Emit `read` and `search` tool sets | Simple, documented; host maintains group membership | Broader grants; installed search group includes searchSubagent. Not equivalent to explicit workspace tools. Not selected. |
| Parent-only scouting | Immediate operational workaround; no deployment | No permanent compatibility repair; more parent-context pressure. Temporary only. |

## Recommended solution

1. Treat frontmatter references, model-facing invocation names, and hook event identities as separate namespaces. Correct the existing frontmatter mapper; do not replace strings indiscriminately across runtime policy or hook normalization.
2. For the inspected host, use `read/readFile`, `search/fileSearch`, and `search/textSearch`. Review every remaining entry in the same mapper against supported-host registrations before claiming the projection repaired. Do not guess shell/edit/todo references or mechanically give every agent broad tool sets.
3. Preserve source tool intent, explicit empty tools, user/model invocation controls, and outgoing delegation restrictions. A missing source tool field and `tools: []` must remain distinct.
4. Regenerate affected VS Code artifacts through the existing projection/publication process. Do not hand-edit installed agents or only patch Scout's generated copy; all callers of the defective mapper are affected.
5. Keep audit semantics honest: build-time mapped declarations are not runtime grants. Documentation must state this boundary; no new runtime telemetry framework is needed.
6. Use existing qualification fixtures/evidence handling for a native direct-versus-delegated comparison. Ensure the positive reader control is genuinely eligible for delegation and include a denied-tools control.
7. If valid resolved references still fail only during delegation, capture the minimal host reproduction and escalate with exact versions, agent identity, tool arguments, effective tool evidence, and errors. Do not label a host defect before this point.

No automatic retry layer or permanent fallback orchestration proposed. The parent-only path is an explicit operational workaround.

## Scope, constraints, and touchpoints

In scope:
- VS Code frontmatter tool mapping and affected emission/audit semantics.
- Every affected generated agent, existing adapter contract coverage, native tool fixtures, direct/delegated qualification, related docs/changelog during implementation.
- End-to-end Scout and docs-manager handoff checks for the reported workflow.

Likely touchpoints:
- `src/adapters/vscode/metadata-tools.ts`, `agents.ts`.
- `src/adapters/vscode/references.ts` only if demonstrated prompt wording prevents the exercised path; do not introduce broad prose replacement.
- `tests/adapters/vscode-metadata-permissions.test.mjs`.
- `tests/fixtures/vscode-local/tool-inputs.json`, native-plugin agent fixtures.
- `scripts/qualification/vscode-local-contract-fixture.mjs`, existing VS Code qualification tests/scripts.
- `.evcrate/source/.evcrate-vscode/` generated agents and audit, regenerated through standard tooling.
- Existing architecture/usage documentation and changelog; canonical `.claude` sources only where a proven workflow correction belongs.

Out of scope:
- Other harness migrations, global tool renaming, editor patches, companion extension, model-binding redesign.
- Removing restrictions, enabling all tools, nested delegation, privacy/scout policy bypass, silent installation/settings changes.
- Broad cleanup of Claude-specific prose unrelated to acceptance.

Constraints:
- Preserve compatibility and least privilege; generated outputs are not an authoring surface.
- No new architecture or dependencies needed for the demonstrated mapper correction.
- Qualification must include the affected Windows Local host. Linux metadata evidence cannot substitute for it.
- Supported-host/version envelope must be explicit before implementation planning finalizes; do not infer the incident version from this machine.
- No deadline specified; do not trade native acceptance for an unverified speed claim.

## Success metrics and acceptance criteria

1. Record target host version/commit, Copilot version, Local session target, selected model, workspace root/trust state, resolved agent source URI, and invocation arguments. Detect same-name profile collisions through host evidence, not filenames alone.
2. Direct Scout and explicitly named delegated Scout each perform successful file discovery, content search, and file read against nonsecret fixture content not supplied in their prompts. Verify exact returned content and actual tool-call traces. A README heading alone is weak evidence because it may already be in context.
3. Keep model selection and task constant where possible; record actual model for each invocation. `model: haiku` is a potential confound, not permission to include the separate model-binding project.
4. Confirm `tools: []` cannot read/search, and Scout still cannot delegate under `agents: []`. Verify generated restricted agents receive no broader tools than intended. No terminal permission expansion to rescue missing native read/search tools.
5. Exercise two disjoint delegated scouting slices and the docs-manager handoff in a disposable documentation workspace. Require grounded reports, no Scout edits, and successful workflow output; no retry storm or fabricated success.
6. Where host calls are denied, retain tool identity, arguments, and policy reason. Never convert denied access into an undocumented terminal workaround.
7. Automated coverage checks consumer-visible capability selection and restriction boundaries using host-grounded identities. Mapper-versus-its-own-audit equality alone does not qualify compatibility. Replace incidental string-pinning coverage rather than blessing a new spelling without external evidence.
8. Build/affected tests and native smoke must pass during implementation. No such checks claimed in this brainstorm.

## Report corrections recommended

- Replace 'audited mapping includes required tools, therefore do not change declarations' with 'audit proves emitted declarations only; verify host reference resolution before deciding the repair.'
- Retain correct interpretation of `agents: []` and temporary parent scouting.
- Separate absent tool, rejected tool call, and model self-report.
- Record the current concrete mapping incompatibility while leaving historical Windows causality unconfirmed.

## Sources

- [VS Code Local subagents](https://code.visualstudio.com/docs/agents/run/subagents#run-a-custom-agent-as-a-subagent)
- [Custom agent frontmatter](https://code.visualstudio.com/docs/agent-customization/custom-agents#header-optional)
- [Pinned reference aliases and enablement](https://github.com/microsoft/vscode/blob/07f806f999227108933c2e30515b26eecc1fda74/src/vs/workbench/contrib/chat/browser/tools/languageModelToolsService.ts#L1594-L1669)
- [Pinned custom-subagent tool resolution](https://github.com/microsoft/vscode/blob/07f806f999227108933c2e30515b26eecc1fda74/src/vs/workbench/contrib/chat/common/tools/builtinTools/runSubagentTool.ts#L230-L242)
- Installed metadata: `/usr/share/code/resources/app/extensions/copilot/package.json`.
- Repository paths and exercised commands identified above.

## Next steps and unresolved questions

- Ask whether to create a detailed implementation plan; no implementation authorized by this brainstorm choice.
- Exact affected Windows VS Code/Copilot versions and active resolved Scout profile remain unknown.
- What support envelope must the eventual repair qualify beyond the incident host and inspected local host? Resolve from project policy or an explicit compatibility decision before finalizing implementation scope.
- Does the incident trace show no workspace tool schemas, or unsuccessful calls? Not provided.
- Does direct Scout fail on the affected host under the same actual model and task? Not provided.
- Native qualification access/evidence is a dependency for closing the historical incident, not a reason to ignore the demonstrated current mapper defect.
