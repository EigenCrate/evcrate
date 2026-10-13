# Phase 02 — Frontmatter mapping cutover

## Context links
- [Plan](./plan.md); prerequisite [Phase 01](./phase-01-host-contract-and-baseline.md).
- [Design](./architecture.md), [integrated host contract](./research/host-reference-contract.md).

## Overview
- Date: 2026-10-10. Priority: P1. Implementation: complete. Review: complete.
- Correct the existing mapping boundary for every affected VS Code agent; no generated-file hotfix.

## Key insights
- Frontmatter tool reference, model invocation name, and hook event identity are separate namespaces.
- Core registrations prove terminal, Task, and todo tools exist. Do not remove source capabilities because the extension manifest does not list them.
- `editFiles` is a registered placeholder selector; model-specific expansion must be qualified. `createFile` alone cannot replace existing contents.
- Shared mapper changes affect more than Scout; Task-bearing actors and explicit edit-capable agents are mandatory consumers.

## Requirements
- Emit host-recognized narrow references; preserve omitted versus explicit-empty intent.
- Preserve canonical source intent without unrestricted tool groups or editor setting changes.
- Maintain public `ToolMappingResult` semantics and existing audit schema unless a proven contract incompatibility demands a separate reviewed change.
- No runtime host discovery, network access, version selector framework, fallback mapper, or retained invalid-reference shim.

## Architecture
- Keep `VSCODE_LOCAL_TOOL_MAP` and `mapAgentTools` in the existing file.
- Read -> `read/readFile`; Glob -> `search/fileSearch`; Grep -> `search/textSearch`.
- Task -> `agent/runSubagent`; TodoWrite -> `todo`; model-facing prose may correctly remain `manage_todo_list`.
- Core terminal references include `runInTerminal`, `getTerminalOutput`, `killTerminal`; use the Phase 01 semantic decisions for Bash/helper aliases.
- LS uses a verified listing reference where that bounded correction is qualified, not the broad search group.
- Editing uses the minimal reference set frozen by Phase 01. If multiple references are necessary for source Write/create-and-overwrite semantics, change map values to module-level readonly arrays and union/deduplicate them once per agent. Do not introduce an abstraction for hypothetical future providers.
- Derive `canDelegate` from a successfully recognized source Task capability, not an obsolete emitted spelling. Missing tools continues intentional inheritance; explicit non-Task lists remain leaf-only.

## Related code files
- Modify: `src/adapters/vscode/metadata-tools.ts`.
- Modify only where necessary: `src/adapters/vscode/agents.ts`; preserve `metadata.ts` re-export contract unless its type changes.
- In scope when proven: `src/adapters/vscode/tool-inputs.ts` and `runtime-sources.ts` (`LOCAL_TOOL_INPUTS_SOURCE`), consumed by `hooks.ts`; correct both authorities together, preserve policy decisions and add paired benign/protected-path regressions.
- Conditional demonstrated instruction blocker: `src/adapters/vscode/references.ts` or canonical docs workflow source; never global prose substitution.
- No new production modules expected. No source file deletion expected.
- Generated `.evcrate/source/.evcrate-vscode/` changes occur only in Phase 04.
## Implementation steps
1. Re-read Phase 01's pinned current supported release contract and locate all mapper/re-export consumers; use LSP if available. Revalidate older research rather than adding older-version branches or a second mapper.
2. Replace invalid frontmatter reference strings for read/find/search and the remaining proven entries. Preserve supported source spellings, case handling, arrays/comma-list parsing, deterministic output and dropped-name reporting.
3. Correct Task eligibility independently of output spelling. Verify a Task-bearing source still gets a delegation tool and does not gain `agents: []`; verify leaf sources still do.
4. Preserve `tools` omission for docs-manager. Preserve advisor/tool-less source `tools: []` and `agents: []`. Unsupported-only explicit lists must emit empty tools, never disappear into inheritance.
5. Do not strip todo from direct-capable definitions. Document that the host independently disables it for delegated sessions; do not pretend publication knows the effective runtime grants.
6. Apply the minimal edit mapping established by Phase 01, including creation and overwrite checks. Do not use placeholder metadata alone as proof or widen to the entire edit group.
7. Keep frontmatter audit values aligned with declarations and schema meaning. Add concise source comments/doc text explaining namespace boundaries; no runtime tool-grant claim or speculative schema expansion.
8. If real host captures prove normalization mismatch, add only the observed supported key/tool handling. Maintain operand extraction, privacy/scout checks, unknown-input denial, and path bounds. New terminal-output IDs must not be treated as filesystem paths; only captured semantics justify handling.
9. Leave hook names such as `read_file` unchanged where host events actually use them. Leave prose invocation names unchanged where they match model-visible schemas.
10. Remove code/comments made obsolete by this cutover, not unrelated source. Hand off to Phase 03 without mid-edit build/test loops.

## Todo list
- [x] All mapped capability families use verified references.
- [x] Task delegation preserved independently of reference spelling.
- [x] Empty/omitted/unsupported semantics preserved.
- [x] Edit and terminal capability decisions match Phase 01 evidence.
- [x] No broad groups, installed-file edits, runtime discovery, or fallback paths introduced.
- [x] Any normalization change is backed by a captured payload and paired policy regression.

## Success criteria
- Source review can trace every emitted reference to host evidence and canonical intent.
- Existing audit remains a declaration audit, not runtime certification.
- No public caller or re-export is left expecting an incompatible map-value shape.
- Phase 03 tests specify the behavior; execution and generated output verification occur in Phase 04.

## Risk assessment
- Lost Task delegation from stale literal comparison: explicit source-capability check and regression.
- Write narrowed to creation-only: native create/overwrite coverage required.
- Terminal helper aliases currently approximate operations: do not silently drop or mislabel capability equivalence.
- If changing normalization would require weakening policy or a new patch parser, stop and seek a separate bounded design decision; no bypass to complete this phase.

## Security considerations
- `applyPatch` can add/delete as well as edit; never silently grant it to narrower intent merely because another tool is unavailable.
- Tool lists are host grants, not an OS sandbox. Preserve source shell permission without claiming hard read-only isolation.

## Next steps
- Phase 03 adds/updates behavior coverage and native fixtures, then Phase 04 verifies integrated changes.

## Unresolved questions
- Final model-specific edit reference set depends on Phase 01 native evidence. This is an explicit pre-code gate, not permission to ship partial edit support.
