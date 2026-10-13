# Research: Qualification & Release Contract (VS Code Subagent Tool References)

## Executive Summary
Central adapter fix updates emitted frontmatter tool references (`read/readFile`, `search/fileSearch`, `search/textSearch`). Automated tests only verify generation, synthetic hook exits, and redaction; they cannot prove host Copilot resolution. Contract defines validated CLI entrypoints, minimal fixture additions, safe isolated qualification staging, redaction rules, and acceptance dependencies.

## Exact Validated Command Syntax (Verified from Source)
Source-verified commands from `package.json` and qualification scripts:
- TypeScript build: `npm run build` (`node scripts/build-typescript.mjs -p tsconfig.json`)
- Clean build: `npm run build:clean` (`node scripts/build-typescript.mjs -p tsconfig.json --clean`)
- Distribution build: `npm run distribute:build` (`node dist/cli/evcrate.js distribute build`)
- Distribution check: `npm run distribute:check` (`node dist/cli/evcrate.js distribute check`)
- VS Code target build: `node dist/cli/evcrate.js distribute build --target vscode`. Never use `distribute:copilot`: that script targets the distinct Copilot CLI adapter and also publishes.
- Publish apply: `npm run distribute:publish` (`node dist/cli/evcrate.js publish --apply`)
- Full generation: `npm run generate:all` (`npm run build && npm run generate:registry && npm run generate:manifests`)
- Materialize qualification fixture:
  `node scripts/qualification/vscode-local-contract-fixture.mjs --destination <abs-path> --capture-directory <abs-path>`
- Qualification unit tests:
  `node --test tests/qualification/vscode-local-qualification.test.mjs`
  `node --test tests/qualification/vscode-local-phase08-qualification.test.mjs`
- Adapter test suite: `npm run test:adapters` (`node --test tests/adapters/*.test.mjs`)
- Publication & CLI tests: `npm run test:publication`

## Artifact Ownership & Distribution Lifecycle
- Source authority: `src/adapters/vscode/metadata-tools.ts`, `agents.ts`, `policy.ts`.
- Generated projection: `.evcrate/source/.evcrate-vscode/` owned by generator/distribute pipeline; never manually edited.
- Host configuration: user owns `chat.pluginLocations`. CLI supports separate opt-in registration; qualification publication must pass `--no-register-vscode-settings`. Core publication and postpublish settings registration are different operations.
- Evidence store: `reports/native-local/<context>-<run>/receipt.md` bound to immutable candidate digest.

## Native Test Limits vs Host Qualification Dependencies
- Synthetic limit: Node test runners (`tests/qualification/*`) run `spawnSync` against isolated fixture scripts and mock hook payloads. They prove hook process lifecycle and envelope parsing, NOT VS Code Copilot extension host tool resolution.
- Native dependency: Validated host execution requires real VS Code Local session (Linux/Windows) with Copilot Chat enabled. Pinned host commit observed: VS Code 1.140.0 (`07f806f99922...`), Copilot Chat 0.68.0.
- Incident caveat: Windows reproduction requires native Windows extension-host environment; Linux metadata cannot claim Windows parity.

## Fixture Analysis & Minimal Added Behavior
Existing fixtures in `scripts/qualification/vscode-local-contract-fixture.mjs`:
- `contract-deny-all.agent.md`: `tools: []`, `agents: []` -> Valid positive control for complete denial and no-subagent spawning.
- `contract-reader.agent.md`: Has `disable-model-invocation: true` and old `read_file` reference; unusable as-is for delegated model invocation.
- Canonical `docs-manager.md`: Parent confirmed `tools` field is OMITTED (inherits workspace tools). DO NOT add explicit tool grants to test docs-manager.

Minimal added fixture behavior:
1. `contract-scout.agent.md` (or updated delegatable reader):
   - `user-invocable: true`, `disable-model-invocation: false`.
   - Explicit references: `tools: [read/readFile, search/fileSearch, search/textSearch]`.
   - `agents: []` (leaf subagent; prohibits subagent chaining).
2. Delegating parent test agent (e.g., `contract-lead.agent.md`):
   - `tools: ['agent/runSubagent']`, with an explicit list containing only qualification child agents.
3. Docs-manager fixture:
   - Preserves omitted `tools:` to verify inherited workspace tool access for file editing without artificial overrides.
4. Denied-tools control:
   - Reuse `contract-deny-all` to ensure empty declarations strictly block workspace tools and subagents.

## Normalization, Tool Inputs, & Delegation Guardrails
- Delegation mapper guardrail: `canDelegate` in `src/adapters/vscode/metadata-tools.ts` checks emitted string against `runSubagent`. Changing the output reference must preserve canonical Task eligibility, not rely on a stale spelling.
- Parameter normalization: `normalizeLocalTool` in `src/adapters/vscode/tool-inputs.ts` accepts READ targets from `path`, `file_path`, `target_file`, `TargetFile`, not `filePath`.
- Policy: DO NOT perform blanket renaming of `tool-inputs.json` or hook models. Capture actual host PreToolUse hook payload first. Minimal normalization patch permitted only if host demonstrates distinct parameter key.
- Hook model names: Must remain untouched; hook schema names represent distinct namespace from agent frontmatter tools.

## Safe Isolated Staging & Rollback Limitations
Staging isolation:
- Never install directly into primary user profile. Use dedicated disposable test workspace with explicit `--user-data-dir` and `--extensions-dir` or disposable folder registered temporarily in `chat.pluginLocations`.
- Fixture workspaces materialized into `os.tmpdir()` with nonsecret sentinel files (`fixture.env`, `sample.txt`, `edit-target.txt`).

Rollback limitations:
- Remove only the disposable profile's qualification registration or restore a verified known-good candidate through the established publisher. Do not blindly delete managed output or publication state.
- After switching candidate registrations, refresh the host session and verify the loaded agent URI/hash; do not assume a file replacement updates an active chat.
- Rollback cannot clean user edits made by docs-manager in target workspace; disposable git worktrees mandatory during test runs.

Evidence redaction:
- Mandatory execution of `scripts/qualification/redact-vscode-local-evidence.mjs` before writing receipts.
- Scrub absolute user home paths, workspace tokens, API keys, usernames, and non-fixture environment variables.

## File Touchpoints
1. `src/adapters/vscode/metadata-tools.ts`: Frontmatter tool mapping definitions.
2. `src/adapters/vscode/agents.ts`: Frontmatter generation, `canDelegate` validation, audit output.
3. `src/adapters/vscode/tool-inputs.ts`: Minimal tool-payload normalization only when captured host evidence proves it necessary; preserve policy behavior.
4. `scripts/qualification/vscode-local-contract-fixture.mjs`: Added delegatable scout & parent fixtures; updated tool references.
5. `tests/qualification/vscode-local-qualification.test.mjs`: Fixture manifest digests and hook test assertions.
6. `tests/fixtures/vscode-local/tool-inputs.json`: Keep intact; update only if proven host schema divergence occurs.
7. `.evcrate/source/.evcrate-vscode/`: Regenerated with `node dist/cli/evcrate.js distribute build --target vscode`; manifests use the existing generation path.
8. `docs/`: Reference documentation updates regarding frontmatter tool references vs runtime grants.

## Unresolved Questions
1. Does host VS Code Copilot Chat 0.68.0 pass `filePath` or `path` in `PreToolUse` for `read/readFile`? (Requires live host hook JSON capture).
2. On Windows host, does Copilot normalize backslashes before firing `PreToolUse` hooks for `read/readFile`?
3. `agent/runSubagent` is documented and registered in core; legacy simple `runSubagent` is a tool-set alias on the pinned host. Use the explicit reference and verify effective delegation natively.
