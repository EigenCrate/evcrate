# Phase 03 — Behavioral regressions and native fixtures

## Context links
- [Plan](./plan.md); dependencies: [Phase 01](./phase-01-host-contract-and-baseline.md), [Phase 02](./phase-02-frontmatter-mapping-cutover.md).
- [Qualification matrix](./qualification-matrix.md), [qualification research](./research/qualification-release-contract.md).

## Overview
- Date: 2026-10-10. Priority: P1. Implementation: complete. Review: approved.
- Protect capability and restriction behavior without replacing old string snapshots with new circular expectations.

## Key insights
- Existing map-per-entry test asserts the mapper against itself; it does not prove VS Code recognizes those strings.
- Generated-resource tests also pin `manage_todo_list` in both frontmatter and prose. Those are different namespaces after correction.
- Existing contract-reader is non-delegatable by default and grants only `read_file`; update it into an intentional direct/delegated positive control.
- Fixture/hook subprocess tests cannot establish a real editor session result.

## Requirements
- Cover plausible consumer-visible regressions: missing workspace access, lost Task delegation, accidental inheritance, permission expansion, incorrect drop semantics, and policy weakening.
- Tests deterministic, offline, isolated, and safe in the complete suite. Do not depend on `/usr/share/code` or authenticated hosts in automated unit tests.
- Preserve native tool/input fixture identities unless actual host captures demonstrate they are wrong.

## Architecture
- Reuse existing projection test setup and qualification materializer/redactor.
- A small versioned host-reference evidence fixture may be added at `tests/fixtures/vscode-local/tool-references.json` if existing fixtures cannot express provenance cleanly. It records independent host reference identities/capabilities, not a second production mapper or copied host resolver implementation.
- Avoid a new generic tool registry or runtime discovery framework.

## Related code files
- Modify: `tests/adapters/vscode-metadata-permissions.test.mjs`, `vscode-resource-projection.test.mjs`.
- Modify where behavior changes: `tests/adapters/vscode-policy.test.mjs`, `vscode-hooks.test.mjs`.
- Modify: `tests/fixtures/vscode-local/native-plugin/com.github.copilot/agents/{contract-reader,contract-deny-all}.agent.md` and fixture materializer as needed.
- Create narrowly scoped `contract-no-child.agent.md` fixture if needed: valid delegation reference but `agents: []`, invoked directly to isolate the allowlist from nested-subagent defaults.
- Modify: `scripts/qualification/vscode-local-contract-fixture.mjs`, relevant `tests/qualification/vscode-local-*.test.mjs`.
- Conditional new fixture: `tests/fixtures/vscode-local/tool-references.json`.
- Preserve: `tests/fixtures/vscode-local/tool-inputs.json` unless captured event schemas require targeted correction.
- Delete: obsolete map-copy assertions and incidental fixture-count assertions affected by this work, not unrelated coverage.

## Implementation steps
1. Remove `VSCODE_LOCAL_TOOL_MAP defines all 13 canonical tool mappings`; remove its now-unused test import. Do not simply re-pin 13 new spellings.
2. Replace frontmatter-only spelling tests with capability contract cases using independently recorded reference identities for Phase 01's pinned current supported release pair. Historical metadata remains provenance, not a second support target. Keep exact assertions only for actual external contracts, coupled to allowed/denied capability checks.
3. Retain/reinforce behavior cases: missing tools retains omission; null follows current omission semantics; `none` and empty lists emit deny-all; unsupported-only explicit lists stay empty rather than inherit; mixed known/unknown tools grant only known capabilities and retain dropped names; Task changes delegation eligibility while non-Task tools do not.
4. Exercise array and comma-list canonical inputs only where parsing affects these security decisions. Verify deduplication does not accidentally add capabilities. Do not add duplicate rows for incidental serialization or ordering alone.
5. Exercise real projection output for Scout, a Task-bearing actor, advisor deny-all, and docs-manager omission. Verify no unsupported edit/execute/agent group grant is introduced. Separate prose model names from frontmatter references.
6. Update contract-reader to the verified narrow read/find/text-search references, `agents: []`, and deliberate delegation eligibility. Keep deny-all eligible so parent -> deny-all can be exercised. Use exact fixture names distinct from shipped Scout to avoid profile collisions.
7. Provide nonsecret fixture content whose exact values are not included in prompts, plus two disjoint folders for later workflow scouting. Native probes may use per-run values; automated assertions use fixed deterministic fixture content.
8. Add one explicit edit-capable positive control only if the existing fixture set cannot independently exercise the corrected edit references. Its scope is a disposable file, not general permission expansion of production Scout.
9. For a proven hook mismatch, add paired regressions for permitted operation success and protected-path denial/approval against both TypeScript normalization and emitted runtime bridge. This minimal correction is approved scope; unknown/unqualified inputs must remain denied.
10. Update materializer tests around usable fixture behavior and restriction outcomes. Remove affected hard-coded file-count assertions; do not re-pin a new count.
11. Do not run build/test loops during partial edits. Hand off integrated source/fixture changes to Phase 04 for one compiled verification pass.
12. Update materializer constants as well as checked-in native-plugin fixtures: the CLI emits `FIXTURE_READER_AGENT` and `FIXTURE_DENY_ALL_AGENT` from its own source, not by copying the checked-in Markdown. Do not let these diverge. A direct no-child control must declare the agent tool plus `agents: []`; otherwise absence of the tool cannot prove the allowlist rule.

## Todo list
- [x] Circular mapping and incidental count assertions removed.
- [x] Independent host provenance recorded for expected references.
- [x] Empty/omitted/unsupported/Task security boundaries covered.
- [x] Positive delegated reader and denied-tools controls runnable.
- [x] Edit capability and actual hook schema dependencies covered where applicable.

## Success criteria
- Regressions would catch the original emitted-name incompatibility, lost Task delegation, and accidental permission widening.
- Tests do not claim native availability from metadata or mock echoes.
- Parent can run the fixture materializer with an isolated destination and obtain distinct positive/negative controls.
- Full execution deferred to Phase 04; phase review verifies contracts and ownership, not fabricated test outcomes.

## Risk assessment
- Copying production map into tests hides the defect: expected host evidence is independent and versioned.
- `tools: []` tests alone do not test outgoing agent restrictions: retain a separate no-child control.
- Host model-specific edit mechanisms may require more than one explicit reference: use Phase 01 evidence and do not compensate through shell.

## Security considerations
- Keep no-shell reader distinct from production Scout's instruction-only read-only task.
- No real secrets in fixtures; no hard-coded incident credentials, machine paths, or raw transcripts.

## Next steps
- Phase 04 compiles and executes affected suites, regenerates artifacts, and runs real fixture CLI smoke.

## Unresolved questions
- Exact additional edit fixture shape depends on the Phase 01 model/tool contract; no new generalized test harness is authorized.
