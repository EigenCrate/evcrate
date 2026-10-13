# Phase 04 — Build, regenerate, and stage the candidate

## Context links
- [Plan](./plan.md); dependencies: [Phase 02](./phase-02-frontmatter-mapping-cutover.md), [Phase 03](./phase-03-regression-and-native-fixtures.md).
- [Qualification research](./research/qualification-release-contract.md); `package.json`; `src/cli/arguments.ts`.

## Overview
- Date: 2026-10-10. Priority: P1. Implementation: completed. Review: approved. Status: VERIFIED & STAGED.
- Candidate Build Identity: Manifest digest `eb1597b4a85f9ed537aaccaf9ca3b8697898a97367cfabdcf65b5a520a594155`, Audit digest `d0ec26b8cbb619fbdc5af11f22fe4b7ab3fcf1352f99f129c6c2575db909f767`, Pinned host: VS Code 1.140.0 / GitHub Copilot Chat 0.68.0 (`34c174a4f195e03c826bda327ab0b6b93277a1f06a3810b9ef32a49ef0bc98c2`).
- Verification Commands & Status: `npm run build` (Exit 0), `npm run distribute:build -- --target vscode` (Exit 0, ok), `npm run generate:manifests` (Exit 0, 8 manifests), `npm run distribute:check` (Exit 0, ok), `npm run release:check` (Exit 0, closure valid), 304/304 tests passed across 4 suites.
- Isolated Sandbox Staging: Published to `/tmp/evcrate-qualification-261010-phase04/sandbox-home/.evcrate-vscode/` with 0-byte diff against generated candidate. All 18 agents staged, leaf agent `agents: []` delegation invariant preserved, native tool capabilities mapped.

## Key insights
- `npm run distribute:copilot` is the wrong target and also publishes. VS Code target ID is `vscode`.
- `distribute all` includes publication; do not use it as a harmless build command.
- Even target-only publication writes the shared HOME controller first. A disposable workspace alone is insufficient isolation: HOME and state must also be explicit.
- `npm run lint` is echo-only; it is not verification evidence.

## Requirements
- One integrated build/test pass after source/fixture edits; failed checks require targeted correction and affected rerun, not repeated unrelated suites.
- Build/audit consistency, runtime fixture execution, and native-host results remain separate evidence levels.
- No actual user HOME or primary editor profile mutation during candidate staging.

## Architecture
- Existing TypeScript build -> target projection -> generated manifests -> verified publisher -> disposable HOME/project -> native qualification.
- Keep all generated metadata consistent through existing generation commands; no hand-edited manifest/hash fixes.
- This phase changes generated artifacts, not canonical tool intent.

## Related code files
- Execute: `scripts/build-typescript.mjs`, `scripts/build-manifests.mjs`, `dist/cli/evcrate.js` through supported entrypoints.
- Regenerate: `.evcrate/source/.evcrate-vscode/`, relevant `.evcrate/build-manifest*.json` through normal tooling.
- Execute: relevant adapter, qualification, installed-runtime, and HOME/project publication suites.
- Create during execution: plan-local candidate verification receipt and external disposable qualification directories.
- Delete: only execution-owned temporary scaffolding after evidence capture; no unrelated files.

## Implementation steps
1. Finish source and fixture edits; check current command syntax before execution. Build from the chosen worktree.
2. Run `npm run build` once. This also runs existing prebuild generation; do not claim a no-write typecheck.
3. Run targeted integrated suites, including all affected tests:
   ```bash
   node --test tests/adapters/vscode-metadata-permissions.test.mjs tests/adapters/vscode-resource-projection.test.mjs tests/adapters/vscode-policy.test.mjs tests/adapters/vscode-hooks.test.mjs tests/qualification/vscode-local-qualification.test.mjs tests/qualification/vscode-local-phase08-qualification.test.mjs
   ```
4. Regenerate using the existing pipeline. For focused iteration use `node dist/cli/evcrate.js distribute build --target vscode`; before final publication refresh aggregate/per-target manifests using `npm run generate:manifests`. This can regenerate other projections as part of its standard all-target transaction; do not edit or redesign those adapters. Run `npm run distribute:check` afterward.
5. Run broader adapter/publication/installed-runtime checks once against the final generated state:
   ```bash
   npm run test:adapters
   node --test tests/distribution/publication-vscode-home.test.mjs tests/distribution/publication-vscode-project.test.mjs tests/integration/vscode-installed-runtime.test.mjs
   npm run release:check
   ```
   Avoid repeating targeted adapter tests separately if the broad adapter suite is the chosen integrated pass. Record the actual commands used and their exit statuses.
6. Exercise the real fixture CLI in a unique absolute disposable destination:
   ```bash
   node scripts/qualification/vscode-local-contract-fixture.mjs --destination "$FIXTURE_PLUGIN" --capture-directory "$RAW_CAPTURE" --with-workspace
   ```
   Variables denote operator-created absolute paths; the CLI creates the workspace at `FIXTURE_PLUGIN-workspace`. Observe output and verify fixture content/restrictions, not just process exit. No shell variables or paths may point to primary user data.
7. Stage the generated production candidate separately from the fixture plugin using explicit sandbox locations. Source-verified CLI forms:
   ```bash
   node dist/cli/evcrate.js publish --dry-run --scope home --target vscode --home "$SANDBOX_HOME" --state-home "$SANDBOX_STATE" --no-register-vscode-settings --json
   node dist/cli/evcrate.js publish --apply --scope home --target vscode --home "$SANDBOX_HOME" --state-home "$SANDBOX_STATE" --no-register-vscode-settings --json
   ```
   Confirm preview targets shared `.evcrate/bin` and `.evcrate-vscode` only under the sandbox. Stop on collisions or unexpected destinations. PowerShell uses corresponding quoted absolute values or `$env:` variables; do not paste POSIX expansion blindly.
8. Record candidate hashes, installed/generated Scout equality, source revision, declaration audit and Phase 01's pinned supported editor/extension pair. Verify canonical omitted/empty/leaf/Task cases without treating declarations as runtime grant proof.
9. Stage project-scope qualification only if needed to match incident installation. Add `--scope project --project-root "$SANDBOX_PROJECT"` while retaining sandbox HOME/state. Project rollback does not undo the already committed shared HOME phase.
10. Provide the immutable candidate and fixture roots to Phase 05. Register only one same-name candidate per profile. Staging alone does not authorize handoff as reviewed: that requires automated checks, passed Linux native/workflow rows and review; Windows may remain blocked, but deployment and incident closure may not proceed.

## Observed Execution Evidence

### 1. Build and Distribution Check Records
- `npm run build`: Exit code 0, 0 errors. Executed `prebuild` (runtime brief, advisor runtime TypeScript compile, controller inventory) and root TypeScript compile.
- `npm run distribute:build -- --target vscode`: Exit code 0, status `ok`. Regenerated VS Code target projection from canonical sources.
- `npm run generate:manifests`: Exit code 0. Regenerated and verified 8 manifests across 7 targets in single pass.
- `npm run distribute:check`: Exit code 0, status `ok`. All projection and manifest digests synchronized.
- `npm run release:check`: Exit code 0. Runtime closure validated cleanly.

### 2. Candidate Identifiers and Digests
- Pinned Target: VS Code 1.140.0 / GitHub Copilot Chat 0.68.0 (provenance: `tests/fixtures/vscode-local/tool-references.json`, digest `34c174a4f195e03c826bda327ab0b6b93277a1f06a3810b9ef32a49ef0bc98c2`).
- Build Manifest: `.evcrate/build-manifest-vscode.json` (SHA-256: `eb1597b4a85f9ed537aaccaf9ca3b8697898a97367cfabdcf65b5a520a594155`).
- Tool Audit: `.evcrate/source/.evcrate-vscode/evcrate/agent-tool-audit.json` (SHA-256: `d0ec26b8cbb619fbdc5af11f22fe4b7ab3fcf1352f99f129c6c2575db909f767`).
- Candidate Agent `evc-scout.agent.md` (SHA-256: `72f49951477557a42e199840f38e9d9ac897f455028fbc2ebb5431f019e85958`).
- Candidate Agent `evc-scout-external.agent.md` (SHA-256: `3aef1a8b48a30b480f2865b2e2f45aebc696df2d3bb26ffa3b7bd4871919805e`).
- Candidate Agent `evc-git-manager.agent.md` (SHA-256: `9bcf7a419968ed58e60e79c9171267f2abd44febb3bb2a266124baf935cd385f`).
- Candidate Agent `evc-project-manager.agent.md` (SHA-256: `05a214272b7f5e2fe9a156da8f99e9dbe37b681017616f3683819de127633861`).

### 3. Scoped Generation & Invariant Verification
- **Source Tool Intent & Mappings**: `evc-scout` declares mapped native capabilities: `["getTerminalOutput", "killTerminal", "read/readFile", "runInTerminal", "search/fileSearch", "search/textSearch", "todo"]`. Dropped tools: `["ListMcpResourcesTool", "ReadMcpResourceTool", "WebFetch", "WebSearch"]`.
- **Delegation Invariants**: `agents: []` preserved across all leaf agents (`evc-scout`, `evc-scout-external`, `evc-advisor`). Delegation disallowed (`allowed: false`).
- **Deterministic Regeneration**: Clean single-pass manifest regeneration matched projection hashes exactly.
- **Scope Isolation**: No non-VS Code projections modified; working tree changes strictly isolated to `.evcrate-vscode` and VS Code manifests.

### 4. Isolated Sandbox Staging Verification
- **Fixture CLI Execution**:
  `node scripts/qualification/vscode-local-contract-fixture.mjs --destination /tmp/evcrate-qualification-261010-phase04/fixture-plugin --capture-directory /tmp/evcrate-qualification-261010-phase04/raw-capture --with-workspace`
  Materialized 11 plugin components and 5 synthetic workspace files under disposable path `/tmp/evcrate-qualification-261010-phase04/`.
- **Staging Commands**:
  `node dist/cli/evcrate.js publish --dry-run --scope home --target vscode --home /tmp/evcrate-qualification-261010-phase04/sandbox-home --state-home /tmp/evcrate-qualification-261010-phase04/sandbox-state --no-register-vscode-settings --json` (status: `ok`)
  `node dist/cli/evcrate.js publish --apply --scope home --target vscode --home /tmp/evcrate-qualification-261010-phase04/sandbox-home --state-home /tmp/evcrate-qualification-261010-phase04/sandbox-state --no-register-vscode-settings --json` (status: `committed`)
- **Observed Smoke Result**:
  All 18 agents staged under `/tmp/evcrate-qualification-261010-phase04/sandbox-home/.evcrate-vscode/com.github.copilot/agents/`.
  Byte-for-byte diff between generated `.evcrate/source/.evcrate-vscode/com.github.copilot/agents/evc-scout.agent.md` and staged candidate is empty (0 bytes diff, 100% identical).

### 5. Automated Validation Results
- Targeted integrated suites (63/63 passed): `node --test tests/adapters/vscode-*.test.mjs tests/qualification/vscode-local-*.test.mjs`
- Broad adapter suite (232/232 passed): `npm run test:adapters`
- Publication and installed runtime (9/9 passed): `node --test tests/distribution/publication-vscode-*.test.mjs tests/integration/vscode-installed-runtime.test.mjs`
- Release check (passed): `npm run release:check`
- Total tests: 304/304 passed (100% pass rate).

## Todo list
- [x] Build and affected behavioral tests pass.
- [x] Projections and aggregate/per-target manifests regenerate and check cleanly.
- [x] Fixture CLI exercised with observed outputs.
- [x] Publication preview reviewed; candidate applied only under sandbox roots.
- [x] Candidate identities and command evidence recorded.

## Success criteria
- No stale generated declarations or manifests; unrelated target behavior unchanged.
- Runtime bridge regression checks use the installed/generated code, not only TypeScript helpers.
- Candidate publication is isolated and traceable; native qualification remains pending.

## Risk assessment
- Old compiled output can hide source fixes: compile before invoking tests or publisher.
- Multiple-generation entrypoints can do redundant work: choose the documented focused path or final all-manifest path deliberately.
- Hidden settings side effects: explicitly disable CLI registration; separate user-controlled profile configuration from publisher success.

## Security considerations
- No automatic registration in the primary profile, unknown collision override, or edits to user-owned `.evcrate.json`.
- Keep raw evidence outside repository; stage only verified candidate output.

## Next steps
- Phase 05 runs native direct/delegated scenarios against this candidate.

## Unresolved questions
- Operator-selected disposable absolute paths and editor profile are runtime inputs, not fixed repository paths.
