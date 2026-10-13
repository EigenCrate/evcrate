# Code Review Cycle 2 — Phase 05 Runtime tiers, actor overrides, picker

Score: 8/10. All 3 prior criticals resolved. No critical remaining. Warnings: root-only post-reload catalog gap, diagnostics vs provider disagreement on corrupt state, fix paths untested, catalog trim.

## Prior criticals
1. Hardcoded tier table in diagnostics — RESOLVED. `diagnostics-display.ts` reads `agent-intent.json`, calls `resolveInventoryBindings`; tier/source from manifest. `getAvailableActorIds` reads manifest (hardcoded `CANONICAL_ACTOR_IDS` kept only as fallback; ids match the 17 in real manifest).
2. Corrupt state silently ignored — RESOLVED. `extension.ts` doRefresh: corrupt user/root → withdraw + `showErrorMessage`, no silent lower-layer substitution; diagnostics adds CORRUPT USER/ROOT rows.
3. `inherit` actor override shown UNBOUND — RESOLVED. description = `renderedSelector ?? (contributed ? 'inherit' : 'UNBOUND')`.

## Prior warnings
- W1 post-reload catalog: PARTIAL. Activation queries catalog + subscribes only when USER bindings non-empty. Root-only bindings → still no catalog until configure command (see W-A).
- W2 invalid catalog entry throws: RESOLVED (skip + `invalidCount`); handlers try/catch queryChatModelCatalog → error message. `onDidChangeChatModels` `.catch(() => {})` still silent.
- W3 remote guard: RESOLVED. `ScopedBindingStore` ctor rejects non-empty authority; extension calls it inside try/catch → fail closed. Tested.
- W4 refresh concurrency: RESOLVED. Single-flight + pending flag.
- W5 clear no-op messaging: RESOLVED. `clear*` return boolean; handler reports "No bindings found".
- W6 trim identity: NOT RESOLVED (W-C).
- W7 test gaps: PARTIAL (W-D).
- W8 native smoke/plan status: NOT DONE (plan still Pending; step 9 smoke outstanding — out of scope for code review, needs approval-gated native run).
- Suggestions: unused imports removed (tsc `--noUnusedLocals` only flags `ScopedBindingStore.remoteAuthority` field). Missing blank line before `export interface GenerationLoadResult` still present.

## Critical
None.

## Warnings
- W-A (medium) root-only bindings after reload: `activate()` checks only `userRes.bindings`. Root layer needs rootIdentity (resolved inside refresh). With root-only tier bindings: catalogSnapshot=null → tier actors withheld `MODEL_NOT_FOUND` + no `onDidChangeChatModels` subscription until user reruns configure. Fix: in `doRefresh`, if either layer non-empty and `catalogSnapshot===null` → query + subscribe (then re-refresh); `showModelBindings` should also refresh catalog so diagnostics don't show false MODEL_NOT_FOUND.
- W-B (medium-low) diagnostics vs provider disagree on corrupt state: provider withdraws ALL actors on corrupt user/root; diagnostics resolves with `null` bindings and shows inherit actors ✔ / tier actors TIER_UNBOUND. Either mark all rows withheld (reason `BINDINGS_CORRUPT`) when a layer is corrupt, or document. Also corrupt error toast repeats on every refresh (catalog change/trust/folder event).
- W-C (low-medium) `validateCatalogEntry` still trims vendor/id/name and test `validates and trims` enshrines it. Stored/rendered identity may differ from host raw id/name (whitespace). Reject or keep raw. Host selector semantics (case/qualified name) still not asserted by any test.
- W-D (medium) tests: (1) `bind model and inherit` test asserts only return+refreshCount; not stored tiers/actors/revision/scope. (2) Root-changed test has `refreshCalled` but never asserts it, nor that store untouched. (3) No test for diagnostics actor rows with a real/mock manifest → Critical 1 and 3 fixes have no regression test (diagnostics test passes `pluginFsPath=null`). (4) No test for clear-target path returning false, nor corrupt-state clear. (5) extension.ts corrupt-handling/activation untested.
- W-E (low) DRY: manifest-actor reading duplicated in generation-loader, diagnostics-display, `getAvailableActorIds`; fallback `CANONICAL_ACTOR_IDS` is a second source of truth. Prefer single exported manifest reader (and drop fallback — without manifest nothing resolves anyway).
- W-F (low) `refreshActiveGeneration` callers during in-flight run get the in-flight (pre-change) promise; "Configured…" message can precede provider update. Pending re-run still fires, so end state correct.

## Suggestions
- DRY: user/root save blocks duplicated in both configure handlers; `clearUserBindings`/`clearRootBindings` and `saveUser/RootBindings` pairs near-identical → shared `updateLayer(memento,key,…)`.
- YAGNI: `CatalogSnapshot.revision`/`queryChatModelCatalog(revision)` always 1; `ProviderManager.getActiveProviderDisposable` unused; `ScopedBindingStore.remoteAuthority` field stored but unused (make ctor param non-property).
- `throw res.error` in configure handlers on corrupt state → raw rejected command; wrap and show friendly message pointing at Clear.
- `expectedRevision` check is same-tick on shared Memento; no real cross-window protection — document.
- Ambiguous picker rows are selectable then error; sort to bottom/filter. Add current binding to picker `description` (plan architecture).
- Diagnostics checks resolution only, not loader outcome (HASH_MISMATCH etc.) — Phase 06 candidate.
- `validateSafeTemplatePath` hardcodes `/` (pre-existing, Windows-fragile).

## Positive
- Resolver precedence correct and tested; explicit inherit omits model; ambiguity withheld never first-match.
- Fail-closed remote/untrusted handling; corrupt state never overwritten; unrelated state preserved on clear.
- No credential storage, no `sendRequest`; selector rendered via JSON.stringify (no frontmatter injection); template path/symlink guards.
- Good module split; all files < 200 lines.

## Validation
- `npx tsc -p extensions/vscode-model-bindings/tsconfig.json --noEmit false` → exit 0.
- `node --test tests/vscode-companion/*.test.mjs` → 34 pass / 0 fail.
- `npx tsc ... --noEmit --noUnusedLocals --noUnusedParameters` → 1 finding (`remoteAuthority` property).
- Not run: full `npm test`, native VS Code smoke (plan step 9).

## Unresolved questions
- Activation-time catalog query when bindings exist: acceptable under design-contracts L64 ("refresh once configured")? Implementation assumes yes.
- Root overrides per-workspace (`workspaceState`) vs per-installation-root across workspaces — current is per-workspace; confirm intended.
- Host selector matcher semantics (case, qualified names) unpinned in code/tests.
- Plan status/todos for Phase 05 still Pending pending native smoke approval.
