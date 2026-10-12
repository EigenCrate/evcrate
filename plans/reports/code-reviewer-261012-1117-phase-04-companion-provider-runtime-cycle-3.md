# Code Review Cycle 3 — Phase 04 Companion provider runtime

Score **7/10**. All Cycle-2 criticals fixed; no open critical. New High warnings: HOME root un-approvable, stale dedup hash after withdraw, unhandled loader/stage throws. tsc exit 0; 13/13 tests pass.

## Cycle-2 critical/warning status
| Item | Status | Evidence |
|---|---|---|
| Root approval wiring | FIXED (project) | extension.ts:35 passes `approvedRoots` from `globalState['evcrate.approvedRoots']`; `inspectCandidateRoot` default `approved=false`; `evcrate.selectInstallation` persists. HOME gap: W2 |
| Project direct layout `evcrate/` | FIXED | `isProjectRoot` -> only `.evcrate-vscode` (installation-roots.ts:66-68) |
| templatePath traversal | FIXED | `validateSafeTemplatePath` (NUL, `..`, resolve-prefix) + lstat + realpath containment (loader:64-74). Residual: W4, W5 |
| Hash required | FIXED | non-string/non-64-hex -> `INVALID_MANIFEST_ENTRY` (loader:59); mismatch -> `HASH_MISMATCH` |
| Size bound/symlink file | FIXED (templates) | lstat `isFile && !isSymbolicLink && size<=maxTemplateBytes`. Manifest not bounded: W5 |
| Error isolation per actor | FIXED | per-actor try/catch -> `withheldReasons`; others stay |
| Dedup unchanged generation | FIXED w/ bug | inventory sha compare skips staging (loader:92-101). Bug: W1 |
| Provider double-dispose, redundant guards | PARTLY | `activeProviderDisposable` + provider both in subscriptions; deactivate also disposes |

## Critical
None.

## Warnings (High → Medium)
1. **Stale dedup hash.** `activeInventorySha256` never reset on `withdrawInventory()` (extension.ts:30-33, 44-47, 74-77). Withdraw (all actors withheld / root unresolvable) then restore identical content -> `staged:null`, `contributedCount>0` -> returns false, provider stays empty. Fix: set `activeInventorySha256 = null` in every withdraw path (centralize `withdraw()` helper).
2. **HOME root can never be approved.** `resolveInstallationRoot` requires `approved` for HOME (runtime-contracts:155), but `selectInstallation` lists only workspace folders (extension.ts:103-104), HOME `approved` comes only from the set -> HOME-only install is dead; regression vs Cycle 2. Also multi-root: `explicitSelectedRootIdentity` never passed/persisted -> `MULTI_ROOT_SELECTION_REQUIRED` forever (fails closed, but plan Step 3 requires persisted selection). Add HOME candidate to quick pick + persist selected identity.
3. **Unhandled throws.** `loadAndStageGeneration` (JSON.parse, readFileSync, `STORAGE_BUDGET_EXCEEDED`, fs errors) not wrapped in `refreshActiveGeneration`; callers use `void` -> unhandled rejection, stale inventory remains, no user state. Wrap, withdraw + surface diagnostic/setup message ("honest setup state"). `withheldReasons` produced but never consumed/surfaced.
4. **Open default.** `resolveCandidateRoots`: `approvedRoots` undefined -> everything approved (installation-roots:107). Extension passes a Set so safe today; flip to deny-by-default (required param) before Phase 05 reuses.
5. **Containment gaps.** (a) `realpath(file).startsWith(resolve(pluginFsPath)+'/')` — base not realpath'd: symlinked HOME/`/home -> /var/home` (Fedora atomic) or symlinked workspace path => every actor `SYMLINK_ESCAPE` (fail-closed false negatives); compare against `realpathSync(pluginFsPath)` using `path.relative`/`sep` (hard-coded `'/'` also breaks on Windows). (b) Manifest `agent-intent.json` read without lstat/realpath/size bound in loader (only checked at inspect time; TOCTOU, symlinked `evcrate/` dir not rejected). (c) templatePath not bound to frozen `TEMPLATE_AGENT_PATH = ^evcrate/agent-templates/<actorId>.md$` (model-intent.ts:42): any file under plugin root, or actor A pointing at B's template, accepted. Reuse that regex + key equality. (d) TOCTOU lstat -> realpath -> read.
6. **Storage budget semantics.** `persistentAuthorityBytes: activeInstanceBytesTotal` mislabels; old generations never deleted; counters only grow -> after ~32 content changes all refreshes throw (see W3) with no cleanup. Delete superseded generation after publish confirmed, or document manual cleanup.
7. **Approval is path-TOFU.** Approval keyed on rootIdentity not content; later edits to `.evcrate-vscode` auto-activate (hash only vs. attacker-owned manifest). Acceptable per plan ("not a signature") but state in docs; consider storing manifest sha at approval.
8. **Dead concurrency guard.** `isRefreshing` — no `await` inside `refreshActiveGeneration`, so flag can never be observed true; dead code that implies serialization. Remove or make real queue.
9. **Commands still stubs.** `configureAgentModels`/`configureActorModel` info messages; `clearModelBindings` says "reset" but only refreshes (misleading). Phase 05 scope — fix text.
10. **Tests gap.** No test for extension.ts (approval wiring, withdraw+restore, HOME approval); loader tests don't cover manifest symlink/oversize/restore-after-withdraw. `main: ./dist/extension.js` vs tsc outDir `.cache/evcrate/vscode-model-bindings-dist`; companion tests not in package.json scripts (Phase 07?).
11. Phase todo list unchecked; step 9 live-host smoke not done (document as pending).

## Suggestions
- Drop `ProviderEventEmitter` wrapper; pass `vscode.EventEmitter` directly. `isDisposed`/`currentResources` only for tests/UI.
- DRY: inventory sha computed in both loader and `stageAgentGeneration`; one helper. `.find()` in loops O(n²) at 512 actors — iterate sorted entries.
- Hash string vs. bytes: hash `readFileSync(real)` Buffer, then decode.
- Renderer still rewrites inline/prose `./.evcrate-vscode/` refs; paths with spaces unquoted (plan says structured refs only).
- Extract refresh pipeline from extension.ts into testable module (149 LOC, will grow).
- `runtime-contracts.ts` 198 LOC: split root selection leaf before Phase 05.
- `Object.freeze([...])` vs plain `[]` inconsistent in provider.

## Positives
- Per-actor error isolation with reason codes; fail-closed guard ordering; no local fallback on remote.
- Layered traversal defenses (string, resolve, lstat, realpath) + mandatory hash.
- Atomic mkdtemp stage -> rename, fail-if-exists, size verify, budget pre-check, cleanup on error.
- Provider single owner, event only on delta, cancellation honored.
- W-A/W-B/W-C regressions retained; contracts leaf breaks cycle.

## Files reviewed / LOC (all <200)
binding-contracts 171, contracts 3, diagnostics-contracts 168, runtime-contracts 198, installation-roots 147, generation-loader 111, agent-renderer 74, resource-storage 101, agent-provider 68, extension 149, d.ts 139; tests: contracts 191, prerequisites-regressions 151, provider-runtime 130, storage-and-provider 116.

## Validation
- `npx tsc -p extensions/vscode-model-bindings/tsconfig.json` -> exit 0.
- `node --test tests/vscode-companion/*.test.mjs` -> 13/13 pass.
- Not run: full `npm test`, live VS Code host. W1/W2 are by code reading (no vscode stub harness for extension.ts).

## Unresolved
- Is HOME approval in scope this phase (Step 2/3) or Phase 05? If Phase 05, HOME-only install must be documented as non-functional meanwhile.
- Bind `templatePath` to frozen regex by importing `model-intent.ts` or duplicating in extension leaf (separate compile closure)?
- Windows host in scope for Phase 04? Determines `sep`/`relative` fixes in containment.
