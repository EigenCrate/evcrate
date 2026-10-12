# Code Review — Phase 05 Runtime tiers, actor overrides, picker

Score: 6/10. Resolver/store/catalog core solid; diagnostics + corrupt-state + post-reload paths contradict plan success criteria.

## Critical (MUST FIX)
1. `diagnostics-display.ts` hardcodes `CANONICAL_ACTOR_TIERS` + `CANONICAL_ACTOR_IDS` (also in `configuration-pickers.ts`). Table wrong vs `.evcrate/source/.claude/agents/*.md` for 11/17 actors (brainstormer none-not-opus; code-reviewer/database-admin/debugger/fullstack sonnet-not-opus; docs-manager/journal-writer/mcp-manager/project-manager/researcher/tester haiku-not-sonnet). Diagnostics report wrong tier/source/status → violates "diagnostics, derived frontmatter agree". Fix: derive actors+intent from loaded `agent-intent.json` manifest (expose from `loadAndStageGeneration` or cache in extension.ts) and call `resolveInventoryBindings` (currently exported+tested but unused in prod). Actor picker/clear picker should use same manifest list.
2. Corrupt/invalid stored bindings silently ignored: `extension.ts` (`userRes.ok ? … : null`, `rootRes.ok ? … : null`) and `diagnostics-display.ts`. Plan: "invalid/corrupt state shown". Corrupt root layer silently falls to user layer = silent substitution. Surface error (warning message + diagnostics row), withhold dependents or keep last-good explicitly.
3. Diagnostics description bug: explicit actor `inherit` override (`effectiveSource` `root.actor`/`user.actor`, no selector) shows `UNBOUND` because check is `effectiveSource.includes('inherit')`. Use `status==='contributed' && !renderedSelector`.

## Warnings (SHOULD FIX)
1. After window reload catalogSnapshot=null (only populated by configure commands); `ensureCatalogSubscribed` only called from configure commands. Persisted tier-bound actors withheld `MODEL_NOT_FOUND` until user re-runs a configure command; breaks "select once". Query + subscribe at activation when persisted bindings non-empty (gesture previously given; design-contracts L64 allows refresh once configured), and have `showModelBindings` refresh catalog.
2. `buildCatalogSnapshot` throws on any single invalid entry (name>128, empty id, inconsistent dup) → third-party model breaks whole picker; `queryChatModelCatalog` errors uncaught in handlers (plan step 1 "handle empty/multiple/error"). Skip+count invalid entries; try/catch in handlers → showErrorMessage. `.catch(() => {})` in onDidChange handler leaves stale snapshot silently.
3. Remote guard gap: only `getRootStorageKey` rejects `remoteAuthority`; `getUserBindings/saveUserBindings/clearUserBindings` and command entry do not → user-scope writes allowed to remote host globalState. Reject at store constructor/ command entry.
4. Concurrent `refreshActiveGeneration` (onDidChangeChatModels + commands + trust/folders) unserialized; mutates generation counters/inventory key. Add single-flight/queue.
5. Clear paths: `clearUserBindings/clearRootBindings(target)` silently no-op on corrupt/null state, yet handler shows "Cleared bindings". Return boolean; report accurately.
6. Catalog `validateCatalogEntry` trims vendor/id/name; stored identity then may differ from host id if host id has whitespace. Reject (not trim) or keep raw. Selector semantics vs pinned host matcher (case/qualified names) not asserted by any test.
7. Test gaps: `binds model and increments revision` asserts only return/refresh, not stored tiers/revision/scope; `handleConfigureActorModel` imported but untested; no tests for root-changed abort, mid-flow cancel after tier pick, diagnostics, corrupt state in loader/extension, cross-scope reset revealing lower layer through store+resolver. Tests depend on prior `tsc` build into `.cache` (existing convention).
8. Plan steps 9 (real native smoke) + todo checkboxes not done; plan file still "Pending".

## Suggestions
- DRY: user/root save blocks duplicated 2x in configure handlers; `clearUserBindings`/`clearRootBindings` and save pairs duplicate. Extract `updateLayer(scope, mutate)`.
- YAGNI: `CatalogSnapshot.revision` always 1; exported `getCurrentRootIdentity` in extension.ts unused; `resolveInventoryBindings` unused (see Critical 1) — use or delete.
- Unused imports: binding-store (`STORAGE_AND_SOURCE_BOUNDS`, `ModelIdentitySelection`, `ActorOverrideBinding`), binding-resolver (`CompanionContractError`). Enable `noUnusedLocals`.
- Ambiguous picker rows labeled "disabled" are selectable then error; filter out or sort to bottom with `kind: Separator`-style note.
- Picker lacks current-binding/layer preview (plan architecture) — show current value in `description`.
- `generation-loader.ts` lost blank line before `export interface`.
- `expectedRevision` check is intra-tick (reads same Memento cache) → no real cross-window protection; document or drop.
- Root layer in `workspaceState` keyed by root hash: HOME installation shared by two workspaces gets separate overrides — confirm intended.

## Positive
- Pure resolver precedence correct (`root.actor > user.actor > inherit omission > root.tier > user.tier`); explicit inherit omits model; ambiguity withheld not first-match.
- Renderer uses `JSON.stringify` for selector → no frontmatter injection from model names.
- Store validates schema/bounds, refuses overwrite of corrupt state, per-root hashed keys, no credentials stored.
- No `sendRequest`/token probes; catalog query only on gesture; cancel paths persist nothing.
- Inventory key hashes rendered content so binding changes republish.

## Validation
- `npx tsc -p extensions/vscode-model-bindings/tsconfig.json` → exit 0, no errors.
- `node --test tests/vscode-companion/*.test.mjs` → 34 pass / 0 fail.
- Not run: full `npm test`, native VS Code smoke (step 9).

## Unresolved questions
- Is activation-time catalog query acceptable under design-contracts L64, or must every post-reload refresh wait for a gesture?
- Should root overrides be per-workspace (workspaceState) or per-installation-root across workspaces?
- Host selector matching semantics (case, qualified names) pinned anywhere? No evidence found in reviewed code.
