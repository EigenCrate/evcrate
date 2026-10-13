# Phase 01 — Host contract and baseline

## Context links
- [Plan](./plan.md), [design](./architecture.md), [decision](../reports/brainstorm-261010-1552-vscode-subagent-tool-references.md).
- [Host research](./research/host-reference-contract.md), [qualification research](./research/qualification-release-contract.md).
- `docs/system-architecture.md`, `docs/code-standards.md`; paths below relative to repository root.

## Overview
- Date: 2026-10-10. Priority: P1. Implementation: complete. Review: complete.
- Establish a complete host-reference contract before changing tool declarations. Preserve existing incident evidence; do not rerun the five failures merely to confirm the report.

## Key insights
- Current mapper/audit agreement is circular compatibility evidence.
- Read/Glob/Grep mismatch already demonstrated against local VS Code 1.140.0 / Copilot Chat 0.68.0.
- `canDelegate` currently checks emitted string `runSubagent`; changing to a qualified reference without updating this condition silently removes delegation.
- `docs-manager` omits tools and inherits. Do not turn omission into an explicit restriction or add grants to make a test pass.
- Runtime normalization reads `path`, `file_path`, `target_file`, or `TargetFile`; actual host payloads may differ. Capture before assuming frontmatter repair alone closes the workflow.

## Requirements
- Target one current supported VS Code/Copilot release pair, pinned here for native Linux and Windows Local qualification. The inspected 1.140.0/0.68.0 pair is prior evidence, not an automatic support target. No older-version matrix, Remote/WSL, macOS, or repository-wide Windows parity.
- Record all 13 existing mapper aliases and the distinction between spelling correction and any semantic approximation.
- Pin evidence to editor commit, extension version, selected model, loaded agent URI, source hash, and session target.
- Missing Windows access blocks its qualification, incident closure and deployment, but not reviewed-candidate handoff after Linux qualification. Minimal proven hook normalization is in scope in both TypeScript and runtime-source authorities; preserve policy decisions and require paired regressions.

## Architecture
- Static adapter mapping stays offline/deterministic. Host metadata gathering is an implementation/qualification activity, not a new production dependency.
- Capture three columns per capability: frontmatter reference, model-facing name, actual hook identity/input shape.
- Read-only Scout workflow is not an OS sandbox: canonical Scout includes Bash. Preserve that existing intent; use a separate no-shell fixture for technical permission controls.

## Related code files
- Inspect: `src/adapters/vscode/{metadata-tools,agents,tool-inputs,policy,references}.ts`.
- Inspect: `.evcrate/source/.claude/agents/{scout,docs-manager,git-manager,advisor}.md`.
- Inspect: `tests/fixtures/vscode-local/tool-inputs.json`; installed host contribution metadata.
- Create during execution: plan-local `reports/host-contract.md`; redacted native evidence outside published plugin roots.
- Delete: none. Production edits: none in this phase.

## Implementation steps
1. Select one implementation worktree. If copying gitignored plans, verify source/destination SHA-256. Run later implementation commands inside that worktree; no cross-phase writers.
2. Refresh source and command syntax; pin the exact current supported editor/extension pair and evidence date in `reports/host-contract.md`. Use LSP references when available; otherwise inspect known re-exports and consumers. Revalidate prior reference research against the pinned pair.
3. Preserve the original incident versions/trace as historical evidence. If they differ from the selected pair, require an operator-approved upgrade before repair acceptance; do not implement older-version compatibility or claim the upgrade proves historical causality. No automatic upgrade authorization.
4. Inventory the host's accepted references for every existing mapper entry using installed contributions and pinned host resolver source. Include alias and tool-set membership information, but do not enable whole groups.
5. Freeze a table of current reference -> intended reference -> operation capability -> provenance. Distinguish existing approximations (e.g. terminal helper aliases) from direct equivalents; use the bounded decisions in host research.
6. Capture direct/delegated availability and hook payloads with the existing qualification plugin on disposable, nonsecret fixture data. Do not bypass denied policies or edit production installed agents to collect a passing trace.
7. Identify loaded Scout URI and same-name collisions, Local versus other session target, tool selection, actual model and workspace trust. Keep original hash/version with each evidence row.
8. Classify each failure: reference unresolved; wrong profile; tool absent; policy denied; model unsupported; tool execution error; or model self-report without tool evidence.
9. Freeze the phase contract. Any exact reference still unsupported needs a bounded documented resolution before that mapper entry changes. Escalate permission trade-offs instead of silently broadening grants.

## Todo list
- [x] Implementation worktree and source identities recorded.
- [x] Exact current supported editor/extension pair, complete reference matrix and provenance recorded.
- [x] Omitted/empty/unsupported/delegation semantics documented.
- [x] Actual hook identities and required parameters captured or explicitly gated.
- [x] Windows unknowns recorded without inferred parity.

## Success criteria
- Every planned mapping has evidence and an explicit semantic decision.
- Implementation can proceed on the pinned current-release contract without guessing tool names; unavailable Windows evidence remains a later qualification gate.
- Windows acceptance and incident closure require actual affected-host evidence on that pair. Older-version historical attribution remains separate; reviewed-candidate handoff is not completion.
- No source, settings, published agents, or permissions changed in this phase.

## Risk assessment
- Moving online documentation: pin host commit and contribution version.
- Model aliases or profile collisions can masquerade as missing tools: record actual selected state.
- Hook-schema mismatch can become visible only after tools resolve: retain it as a proven acceptance dependency, not a blanket runtime rewrite.

## Security considerations
- Synthetic data only; redact absolute user paths, tokens, account identifiers and session IDs before committing evidence.
- No terminal bypass, trust setting change, nested-delegation enablement, or editor configuration mutation without explicit approval.

## Next steps
- Phase 02 consumes the frozen contract; Phase 03 consumes captured host fixtures.

## Unresolved questions
- Exact Windows version/commit, extension version, active Scout URI, and original call trace are not available in this session.
- Confirm which host paths are native Local versus remote; remote support is not part of this plan.
