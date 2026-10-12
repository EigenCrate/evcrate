# Code Review — Phase 04 Companion provider runtime

Score: **4/10**. Primitives clean, typecheck + 12/12 tests green; but runtime not wired and 3 confirmed defects (home layout, path traversal, auto-approval).

## Critical
1. **extension.ts wires nothing.** No root resolve / template read / render / stage / `updateInventory`. Provider inventory always empty -> no `evc-*` actor ever contributed. `selectInstallation`/`configure*`/`clear*` commands = info-message stubs. `getCurrentGenerationId`/`nextGenerationId` unused. Todo items 1-5 + success criteria unmet.
2. **Path traversal in `stageAgentGeneration`.** `actorId` never validated against `ACTOR_ID_PATTERN` (renderer or stager); filename = `${actorId}.agent.md`. Probe: actorId `../../../escape` wrote `<base>/resolved/escape.agent.md`, outside generation dir. Fix: validate `ACTOR_ID_PATTERN` in `renderAgentTemplate` and re-validate in stager (+ dup-id reject, <=512 count).
3. **HOME root broken.** `resolveCandidateRoots` default `homePath = ~/.evcrate-vscode`, but `inspectCandidateRoot` checks `<root>/.evcrate-vscode/evcrate/...` -> default HOME probe = `NO_INSTALLATION_FOUND` (verified). With custom parent-style HOME, `pluginFsPath = homePath` (not `.../.evcrate-vscode`) -> reference rewrite points to wrong dir (verified). Tests only cover project path; HOME never exercised.
4. **Root approval bypassed.** `inspectCandidateRoot(fsPath, approved = true)`; `resolveCandidateRoots` never passes persisted approval -> every workspace `.evcrate-vscode` auto-approved. Contradicts plan Security ("workspace trust not a signature; explicit root approval required"). No enrollment UI/state, no `lstat`/symlink/realpath containment, no size/regular-file bounds (uses `existsSync`/`statSync` following symlinks).

## Warnings
1. Renderer YAML corruption: `model:` filter uses `line.trim()` -> removes nested `metadata.model` (leaves empty `metadata:`, verified); block-scalar `model: |` leaves orphan continuation lines (verified). Need frontmatter-structure-aware strip (top-level, col 0 only, + continuation lines).
2. Renderer rewrites `./.evcrate-vscode/...` inside fenced code (verified) — plan: "without rewriting arbitrary prompt code". Also unquoted paths with spaces; no `file:`/Uri semantics. Limit to structured reference forms.
3. Stager deletes existing `targetGenPath` before rename (non-atomic window; plan: "do not delete active or uncertain generations"). Fail if exists instead. No post-write byte/reference-target verification (plan step 6). No fsync. `Date.now()` staging suffix collides in same ms -> use uuid/mkdtemp.
4. `extension.ts`: guard computed 3x (DRY) -> one `currentGuard()`; unused `initialGuard`; module-level mutable state + double `randomUUID`; unqualified path drops registration but not provider/emitter/inventory (no `withdrawInventory`); `onDidGrantWorkspaceTrust` only handles grant, no root/workspace-folder change handler (`onDidChangeWorkspaceFolders` typed but unused). Registered disposable disposed manually and again via `subscriptions` (harmless, noisy).
5. `validateLocalRootUri({path: fsPath})` rejects real POSIX dirs containing literal `%0A`-like sequences (`ENCODED_CONTROLS` applied to decoded object path) and rejects Windows `C:\` fsPaths; fine for Linux-only tuple, but raw-path vs URI-input concerns are conflated. Prefer `vscode.Uri.file(...).toString()` -> string path.
6. `d.ts` uses `Thenable` without declaration; masked by `skipLibCheck: true` (silently `any`).
7. Tests: none for HOME layout, traversal, renderer nested/block `model`, code fences, `extension.ts` activation/trust handling; `tests/vscode-companion` not wired into any `package.json` script (pre-existing `contracts.test.mjs` same) and depends on prior `tsc` into `.cache`. Phase-required real-host smoke (step 9) not done.

## Suggestions
- Phase 04 Todo list still unchecked in phase file; leave until items 1/3/4 land.
- Merge `ProviderEventEmitter` wrapper: pass `vscode.EventEmitter` directly or drop interface; `currentResources`/`isDisposed` getters are test-only surface.
- `updateInventory` key compare: compare sorted arrays in place; `Object.freeze([...])` vs plain `[]` in withdraw inconsistent.
- Several files hit <200 LOC via dense long lines (`runtime-contracts.ts` 198); consider split of `validateLocalRootUri` / selection into a leaf `root-uri.ts` before Phase 05 grows it.
- Stager: use `mkdtempSync` in generation parent, `renameSync` to final, no `existsSync` pre-rm.

## Positives
- Host guard ordering (remote -> trust -> proposal) fail-closed, frozen results, no local fallback on remote.
- `validateLocalRootUri` idempotent identity + control-char rejection; W-A/W-B/W-C tests meaningful. `contracts.ts` re-export cleanly breaks cycle.
- Storage budget enforced before write; rootIdentity hashed into path; cleanup of staging on error.
- Provider: single owner, change event only on delta, cancellation + disposal handled.
- Selector emitted via `JSON.stringify` (no YAML injection); rewrite callback avoids `$&` replacement-pattern expansion (verified).

## Files / LOC (all <200)
agent-provider 68, agent-renderer 53, binding-contracts 171, contracts 3, diagnostics-contracts 168, extension 110, installation-roots 123, resource-storage 85, runtime-contracts 198, d.ts 119, prerequisites-regressions.test 151, provider-runtime.test 132, storage-and-provider.test 95.

## Validation
- `npx tsc -p extensions/vscode-model-bindings/tsconfig.json` -> exit 0.
- `node --test tests/vscode-companion/*.test.mjs` -> 12/12 pass.
- Ad-hoc probes (`/tmp/rv.mjs`, `/tmp/rv2.mjs`): HOME default fails, traversal write escapes, renderer corruption — all reproduced. Not run: full `npm test`, live VS Code host.

## Unresolved
- Intended HOME layout: is `homePath` the plugin dir (`~/.evcrate-vscode`) or its parent? Phase 03 intent layout should pin this.
- Where does root approval persist (globalState keyed by rootIdentity?) and who owns enrollment UI — this phase or Phase 05?
- Is extension-level wiring (load -> render -> stage -> inventory) deferred to Phase 05/06? Phase 04 text says no; success criteria require it.
